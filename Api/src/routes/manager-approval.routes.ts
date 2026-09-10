import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { MANAGER_APPROVAL_ACTIONS, signManagerApproval } from "../lib/manager-approval.js";
import { prisma } from "../lib/prisma.js";
import { assertShopAccess } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";
import { approvalRateLimit } from "../middleware/rate-limit.middleware.js";

export const managerApprovalRouter = Router();

const paramsSchema = z.object({ shopId: z.string().min(1) });
const pinSchema = z.object({ pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits."), currentPin: z.string().regex(/^\d{6}$/).optional() });
const approvalSchema = z.object({
  approverId: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits."),
  action: z.enum(Object.keys(MANAGER_APPROVAL_ACTIONS) as [keyof typeof MANAGER_APPROVAL_ACTIONS, ...(keyof typeof MANAGER_APPROVAL_ACTIONS)[]]),
  targetId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

function forbidden(message = "Approval is not allowed."): Error {
  return Object.assign(new Error(message), { name: "ForbiddenError" });
}

managerApprovalRouter.use(requireAuth);

managerApprovalRouter.get("/:shopId/approvers", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    await assertShopAccess(auth.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: {
        owner: { select: { id: true, name: true } },
        approvalPinHash: true,
        members: {
          where: { role: "MANAGER", active: true },
          select: { approvalPinHash: true, user: { select: { id: true, name: true } } },
        },
      },
    });
    response.json({
      approvers: [
        { id: shop.owner.id, name: shop.owner.name, role: "OWNER", pinConfigured: Boolean(shop.approvalPinHash) },
        ...shop.members.map((member) => ({ id: member.user.id, name: member.user.name, role: "MANAGER", pinConfigured: Boolean(member.approvalPinHash) })),
      ],
    });
  } catch (error) {
    next(error);
  }
});

managerApprovalRouter.put("/:shopId/approval-pin", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = pinSchema.parse(request.body);
    const access = await assertShopAccess(auth.id, shopId);
    if (!access.isOwner && access.role !== "MANAGER") throw forbidden();
    const currentHash = access.isOwner
      ? (await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { approvalPinHash: true } })).approvalPinHash
      : (await prisma.shopMember.findUniqueOrThrow({ where: { shopId_userId: { shopId, userId: auth.id } }, select: { approvalPinHash: true } })).approvalPinHash;
    if (currentHash && (!input.currentPin || !await bcrypt.compare(input.currentPin, currentHash))) throw forbidden("Current PIN is incorrect.");
    const approvalPinHash = await bcrypt.hash(input.pin, 12);
    if (access.isOwner) await prisma.shop.update({ where: { id: shopId }, data: { approvalPinHash } });
    else await prisma.shopMember.update({ where: { shopId_userId: { shopId, userId: auth.id } }, data: { approvalPinHash } });
    response.json({ configured: true });
  } catch (error) {
    next(error);
  }
});

managerApprovalRouter.post("/:shopId/approvals", approvalRateLimit, async (request, response, next) => {
  try {
    const requester = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = approvalSchema.parse(request.body);
    await assertShopAccess(requester.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { ownerId: true, approvalPinHash: true } });
    let approverRole: "OWNER" | "MANAGER";
    let pinHash: string | null;
    if (input.approverId === shop.ownerId) {
      approverRole = "OWNER";
      pinHash = shop.approvalPinHash;
    } else {
      const manager = await prisma.shopMember.findUnique({ where: { shopId_userId: { shopId, userId: input.approverId } }, select: { role: true, active: true, approvalPinHash: true } });
      if (!manager?.active || manager.role !== "MANAGER") throw forbidden();
      approverRole = "MANAGER";
      pinHash = manager.approvalPinHash;
    }
    if (!pinHash || !await bcrypt.compare(input.pin, pinHash)) throw forbidden("PIN is incorrect.");
    const permission = MANAGER_APPROVAL_ACTIONS[input.action];
    const approvalToken = signManagerApproval({
      kind: "manager-approval",
      requesterId: requester.id,
      approverId: input.approverId,
      approverRole,
      shopId,
      action: input.action,
      permission,
      targetId: input.targetId,
      reason: input.reason,
    });
    response.status(201).json({ approvalToken, expiresInSeconds: 90 });
  } catch (error) {
    next(error);
  }
});
