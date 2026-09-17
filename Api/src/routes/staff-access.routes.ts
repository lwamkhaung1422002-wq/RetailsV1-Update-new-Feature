import { Router } from "express";
import { z } from "zod";

import { writeAuditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import { DEFAULT_ROLE_PERMISSIONS, SHOP_PERMISSIONS, STAFF_ROLES, assertShopOwner, type ShopPermission } from "../lib/shop-access.js";
import { sendResetLogin, sendStaffInvite } from "../lib/staff-email.js";
import { createStaffToken, hashStaffToken, staffInviteExpiresAt, staffInviteUrl, staffResetExpiresAt, staffResetUrl } from "../lib/staff-tokens.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const staffAccessRouter = Router();

const paramsSchema = z.object({ shopId: z.string().min(1) });
const memberParamsSchema = paramsSchema.extend({ memberId: z.string().min(1) });
const inviteParamsSchema = paramsSchema.extend({ inviteId: z.string().min(1) });
const roleParamsSchema = paramsSchema.extend({ role: z.enum(STAFF_ROLES) });
const addStaffSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.email().trim().toLowerCase(), role: z.enum(STAFF_ROLES) }).strict();
const updateStaffSchema = z.object({ role: z.enum(STAFF_ROLES).optional(), active: z.boolean().optional() }).strict().refine((input) => input.role !== undefined || input.active !== undefined, "Choose a staff change.");
const updatePolicySchema = z.object({ permissions: z.array(z.enum(SHOP_PERMISSIONS)).max(SHOP_PERMISSIONS.length) });

function namedError(name: string, message: string): Error { return Object.assign(new Error(message), { name }); }
function badRequest(message: string): Error { return namedError("BadRequestError", message); }
function conflict(message: string): Error { return namedError("ConflictError", message); }
function notFound(message: string): Error { return namedError("NotFoundError", message); }
function rateLimited(message: string): Error { return namedError("RateLimitError", message); }
function isUniqueConstraintError(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }

type StaffMemberRecord = {
  id: string; role: string; active: boolean; createdAt: Date; updatedAt: Date;
  user: { id: string; name: string; email: string; lastLoginAt: Date | null };
};

function memberResponse(member: StaffMemberRecord, shop: { id: string; name: string }) {
  return {
    id: member.id,
    user: { id: member.user.id, name: member.user.name, email: member.user.email },
    role: member.role,
    active: member.active,
    status: member.active ? "ACTIVE" : "DEACTIVATED",
    lastLoginAt: member.user.lastLoginAt,
    branch: shop,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

staffAccessRouter.use(requireAuth);

staffAccessRouter.get("/:shopId/staff", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: {
        id: true, name: true,
        owner: { select: { id: true, name: true, email: true, lastLoginAt: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } },
        staffInvites: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, expiresAt: true, createdAt: true, updatedAt: true } },
      },
    });
    const branch = { id: shop.id, name: shop.name };
    const memberEmails = new Set(shop.members.map((member) => member.user.email));
    response.json({ staff: [
      { id: `owner:${shop.owner.id}`, user: { id: shop.owner.id, name: shop.owner.name, email: shop.owner.email }, role: "OWNER", active: true, status: "ACTIVE", lastLoginAt: shop.owner.lastLoginAt, branch },
      ...shop.staffInvites.filter((invite) => !memberEmails.has(invite.email)).map((invite) => ({ id: `invite:${invite.id}`, inviteId: invite.id, user: { id: `invite:${invite.id}`, name: invite.name, email: invite.email }, role: invite.role, active: false, status: "SETUP_REQUIRED", lastLoginAt: null, expiresAt: invite.expiresAt, branch, createdAt: invite.createdAt, updatedAt: invite.updatedAt })),
      ...shop.members.map((member) => memberResponse(member, branch)),
    ] });
  } catch (error) { next(error); }
});

staffAccessRouter.post("/:shopId/staff", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = addStaffSchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { id: true, name: true, owner: { select: { id: true, email: true } } } });
    if (input.email === shop.owner.email) throw badRequest("The owner already has permanent full access.");
    const rawToken = createStaffToken();
    const expiresAt = staffInviteExpiresAt();
    const now = new Date();
    let invitation;
    try {
      invitation = await prisma.$transaction(async (transaction) => {
        const existingUser = await transaction.user.findUnique({ where: { email: input.email }, select: { id: true } });
        if (existingUser) {
          const member = await transaction.shopMember.findUnique({ where: { shopId_userId: { shopId, userId: existingUser.id } }, select: { active: true } });
          if (member?.active) throw conflict("This user already has active store access.");
          if (member) throw conflict("This staff account is deactivated. Reactivate it instead of creating another invitation.");
        }
        await transaction.staffInvite.updateMany({ where: { shopId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }, data: { revokedAt: now } });
        const pending = await transaction.staffInvite.findFirst({ where: { shopId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
        if (pending) throw conflict("A valid pending invitation already exists for this email.");
        const created = await transaction.staffInvite.create({ data: { shopId, name: input.name, email: input.email, role: input.role, tokenHash: hashStaffToken(rawToken), expiresAt, createdById: auth.id, lastSentAt: now } });
        await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.inviteCreated", entity: "StaffInvite", entityId: created.id, metadata: { email: input.email, role: input.role, expiresAt: expiresAt.toISOString() } });
        return created;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw conflict("A valid pending invitation already exists for this email.");
      throw error;
    }
    const inviteUrl = staffInviteUrl(rawToken);
    const emailDelivery = await sendStaffInvite({ email: invitation.email, name: invitation.name, shopName: shop.name, url: inviteUrl, expiresAt });
    response.status(201).json({ invitation: { id: invitation.id, status: "SETUP_REQUIRED", expiresAt, emailDelivery, inviteUrl } });
  } catch (error) { next(error); }
});

staffAccessRouter.post("/:shopId/staff-invites/:inviteId/resend", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, inviteId } = inviteParamsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const current = await prisma.staffInvite.findFirst({ where: { id: inviteId, shopId }, include: { shop: { select: { name: true } } } });
    if (!current) throw notFound("Staff invitation not found.");
    if (current.revokedAt || current.acceptedAt) throw conflict("This invitation is no longer pending.");
    if (current.lastSentAt && current.lastSentAt > new Date(Date.now() - 60_000)) throw rateLimited("Wait one minute before resending this invitation.");
    const rawToken = createStaffToken();
    const expiresAt = staffInviteExpiresAt();
    const invitation = await prisma.$transaction(async (transaction) => {
      const rotated = await transaction.staffInvite.updateMany({ where: { id: current.id, shopId, acceptedAt: null, revokedAt: null }, data: { tokenHash: hashStaffToken(rawToken), expiresAt, lastSentAt: new Date() } });
      if (rotated.count !== 1) throw conflict("This invitation is no longer pending.");
      const updated = await transaction.staffInvite.findUniqueOrThrow({ where: { id: current.id } });
      await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.inviteResent", entity: "StaffInvite", entityId: updated.id, metadata: { email: updated.email, role: updated.role, expiresAt: expiresAt.toISOString(), delivery: "email" } });
      return updated;
    });
    const inviteUrl = staffInviteUrl(rawToken);
    const emailDelivery = await sendStaffInvite({ email: invitation.email, name: invitation.name, shopName: current.shop.name, url: inviteUrl, expiresAt });
    response.json({ invitation: { id: invitation.id, status: "SETUP_REQUIRED", expiresAt, emailDelivery, inviteUrl } });
  } catch (error) { next(error); }
});

staffAccessRouter.post("/:shopId/staff-invites/:inviteId/link", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, inviteId } = inviteParamsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const current = await prisma.staffInvite.findFirst({ where: { id: inviteId, shopId } });
    if (!current) throw notFound("Staff invitation not found.");
    if (current.revokedAt || current.acceptedAt) throw conflict("This invitation is no longer pending.");
    const rawToken = createStaffToken();
    const expiresAt = staffInviteExpiresAt();
    const invitation = await prisma.$transaction(async (transaction) => {
      const rotated = await transaction.staffInvite.updateMany({ where: { id: current.id, shopId, acceptedAt: null, revokedAt: null }, data: { tokenHash: hashStaffToken(rawToken), expiresAt } });
      if (rotated.count !== 1) throw conflict("This invitation is no longer pending.");
      const updated = await transaction.staffInvite.findUniqueOrThrow({ where: { id: current.id } });
      await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.inviteResent", entity: "StaffInvite", entityId: updated.id, metadata: { email: updated.email, role: updated.role, expiresAt: expiresAt.toISOString(), delivery: "copy-link" } });
      return updated;
    });
    response.json({ invitation: { id: invitation.id, status: "SETUP_REQUIRED", expiresAt, emailDelivery: { state: "disabled" }, inviteUrl: staffInviteUrl(rawToken) } });
  } catch (error) { next(error); }
});

staffAccessRouter.delete("/:shopId/staff-invites/:inviteId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, inviteId } = inviteParamsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.staffInvite.findFirst({ where: { id: inviteId, shopId } });
      if (!current) throw notFound("Staff invitation not found.");
      if (current.acceptedAt) throw conflict("An accepted invitation cannot be cancelled.");
      if (current.revokedAt) throw conflict("This invitation is already cancelled.");
      const cancelled = await transaction.staffInvite.updateMany({ where: { id: current.id, shopId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      if (cancelled.count !== 1) throw conflict("This invitation is no longer pending.");
      await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.inviteCancelled", entity: "StaffInvite", entityId: current.id, metadata: { email: current.email, role: current.role } });
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

staffAccessRouter.patch("/:shopId/staff/:memberId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, memberId } = memberParamsSchema.parse(request.params);
    const input = updateStaffSchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const member = await prisma.$transaction(async (transaction) => {
      const current = await transaction.shopMember.findFirst({ where: { id: memberId, shopId }, include: { shop: { select: { ownerId: true } } } });
      if (!current) throw notFound("Staff member not found.");
      if (current.userId === current.shop.ownerId) throw badRequest("The Owner account cannot be changed through Staff management.");
      const updated = await transaction.shopMember.update({ where: { id: memberId }, data: { ...(input.role !== undefined ? { role: input.role } : {}), ...(input.active !== undefined ? { active: input.active } : {}) }, include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } } });
      if (input.role && input.role !== current.role) await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.roleChange", entity: "ShopMember", entityId: memberId, metadata: { from: current.role, to: input.role } });
      if (input.active !== undefined && input.active !== current.active) {
        if (!input.active) await transaction.authSession.updateMany({ where: { userId: current.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        await writeAuditLog(transaction, { shopId, actorId: auth.id, action: input.active ? "staff.reactivate" : "staff.deactivate", entity: "ShopMember", entityId: memberId, metadata: { role: updated.role } });
      }
      return updated;
    });
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { id: true, name: true } });
    response.json({ member: memberResponse(member, shop) });
  } catch (error) { next(error); }
});

staffAccessRouter.post("/:shopId/staff/:memberId/reset-login", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, memberId } = memberParamsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const member = await prisma.shopMember.findFirst({ where: { id: memberId, shopId, active: true }, include: { user: { select: { id: true, name: true, email: true } }, shop: { select: { name: true, ownerId: true } } } });
    if (!member) throw notFound("Active staff member not found.");
    if (member.userId === member.shop.ownerId) throw badRequest("The Owner login cannot be reset through Staff management.");
    const rawToken = createStaffToken();
    const expiresAt = staffResetExpiresAt();
    const reset = await prisma.$transaction(async (transaction) => {
      const current = await transaction.shopMember.findFirst({ where: { id: memberId, shopId, active: true }, select: { id: true } });
      if (!current) throw notFound("Active staff member not found.");
      const now = new Date();
      await transaction.user.update({ where: { id: member.userId }, data: { loginResetRequired: true } });
      await transaction.authSession.updateMany({ where: { userId: member.userId, revokedAt: null }, data: { revokedAt: now } });
      await transaction.staffPasswordResetToken.updateMany({ where: { userId: member.userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const created = await transaction.staffPasswordResetToken.create({ data: { shopId, userId: member.userId, createdById: auth.id, tokenHash: hashStaffToken(rawToken), expiresAt } });
      await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "staff.resetLogin", entity: "User", entityId: member.userId, metadata: { memberId, resetTokenId: created.id, expiresAt: expiresAt.toISOString() } });
      return created;
    });
    const resetUrl = staffResetUrl(rawToken);
    const emailDelivery = await sendResetLogin({ email: member.user.email, name: member.user.name, shopName: member.shop.name, url: resetUrl, expiresAt });
    response.status(201).json({ reset: { id: reset.id, expiresAt, emailDelivery, resetUrl } });
  } catch (error) { next(error); }
});

staffAccessRouter.get("/:shopId/role-policies", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const policies = await prisma.shopRolePolicy.findMany({ where: { shopId } });
    const stored = new Map(policies.map((policy) => [policy.role, policy.permissions]));
    response.json({ policies: STAFF_ROLES.map((role) => ({ role, permissions: Array.isArray(stored.get(role)) ? stored.get(role) : DEFAULT_ROLE_PERMISSIONS[role] })) });
  } catch (error) { next(error); }
});

staffAccessRouter.put("/:shopId/role-policies/:role", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, role } = roleParamsSchema.parse(request.params);
    const input = updatePolicySchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const permissions = [...new Set(input.permissions)] as ShopPermission[];
    const policy = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.shopRolePolicy.upsert({ where: { shopId_role: { shopId, role } }, create: { shopId, role, permissions }, update: { permissions } });
      await writeAuditLog(transaction, { shopId, actorId: auth.id, action: "role.permissionsUpdate", entity: "ShopRolePolicy", entityId: saved.id, metadata: { role, permissions } });
      return saved;
    });
    response.json({ policy: { role: policy.role, permissions: policy.permissions } });
  } catch (error) { next(error); }
});
