import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { writeAuditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import {
  DEFAULT_ROLE_PERMISSIONS,
  SHOP_PERMISSIONS,
  STAFF_ROLES,
  assertShopOwner,
  type ShopPermission,
  type StaffRole,
} from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const staffAccessRouter = Router();

const paramsSchema = z.object({ shopId: z.string().min(1) });
const memberParamsSchema = paramsSchema.extend({ memberId: z.string().min(1) });
const roleParamsSchema = paramsSchema.extend({ role: z.enum(STAFF_ROLES) });
const addStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).optional(),
  role: z.enum(STAFF_ROLES),
});
const updateStaffSchema = z.object({
  role: z.enum(STAFF_ROLES).optional(),
  active: z.boolean().optional(),
}).refine((input) => input.role !== undefined || input.active !== undefined, "Choose a staff change.");
const updatePolicySchema = z.object({
  permissions: z.array(z.enum(SHOP_PERMISSIONS)).max(SHOP_PERMISSIONS.length),
});

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { name: "BadRequestError" });
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { name: "ConflictError" });
}

function memberResponse(member: {
  id: string;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string };
}, branch: { id: string; name: string }) {
  return {
    id: member.id,
    user: member.user,
    role: member.role,
    active: member.active,
    branch,
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
        id: true,
        name: true,
        owner: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    response.json({
      staff: [
        { id: `owner:${shop.owner.id}`, user: shop.owner, role: "OWNER", active: true, branch: { id: shop.id, name: shop.name } },
        ...shop.members.map((member) => memberResponse(member, shop)),
      ],
    });
  } catch (error) {
    next(error);
  }
});

staffAccessRouter.post("/:shopId/staff", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = addStaffSchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (!existingUser && !input.password) throw badRequest("Password is required for a new staff account.");
    if (existingUser?.id === auth.id) throw badRequest("The owner already has full access.");
    const passwordHash = existingUser ? undefined : await bcrypt.hash(input.password!, 12);

    const member = await prisma.$transaction(async (tx) => {
      const user = existingUser ?? await tx.user.create({
        data: { name: input.name, email: input.email, password: passwordHash! },
      });
      const current = await tx.shopMember.findUnique({ where: { shopId_userId: { shopId, userId: user.id } } });
      if (current?.active) throw conflict("This user already has access to the branch.");
      const saved = current
        ? await tx.shopMember.update({
            where: { id: current.id },
            data: { role: input.role, active: true },
            include: { user: { select: { id: true, name: true, email: true } } },
          })
        : await tx.shopMember.create({
            data: { shopId, userId: user.id, role: input.role },
            include: { user: { select: { id: true, name: true, email: true } } },
          });
      await writeAuditLog(tx, {
        shopId,
        actorId: auth.id,
        action: current ? "staff.reactivate" : "staff.add",
        entity: "ShopMember",
        entityId: saved.id,
        metadata: { userId: user.id, role: input.role },
      });
      return saved;
    });
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { id: true, name: true } });
    response.status(201).json({ member: memberResponse(member, shop) });
  } catch (error) {
    next(error);
  }
});

staffAccessRouter.patch("/:shopId/staff/:memberId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, memberId } = memberParamsSchema.parse(request.params);
    const input = updateStaffSchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const member = await prisma.$transaction(async (tx) => {
      const current = await tx.shopMember.findFirst({ where: { id: memberId, shopId } });
      if (!current) throw Object.assign(new Error("Staff member not found."), { name: "NotFoundError" });
      const updated = await tx.shopMember.update({
        where: { id: memberId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (input.role && input.role !== current.role) {
        await writeAuditLog(tx, { shopId, actorId: auth.id, action: "staff.roleChange", entity: "ShopMember", entityId: memberId, metadata: { from: current.role, to: input.role } });
      }
      if (input.active !== undefined && input.active !== current.active) {
        await writeAuditLog(tx, { shopId, actorId: auth.id, action: input.active ? "staff.reactivate" : "staff.deactivate", entity: "ShopMember", entityId: memberId, metadata: { role: updated.role } });
      }
      return updated;
    });
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { id: true, name: true } });
    response.json({ member: memberResponse(member, shop) });
  } catch (error) {
    next(error);
  }
});

staffAccessRouter.get("/:shopId/role-policies", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    await assertShopOwner(auth.id, shopId);
    const policies = await prisma.shopRolePolicy.findMany({ where: { shopId } });
    const stored = new Map(policies.map((policy) => [policy.role, policy.permissions]));
    response.json({
      policies: STAFF_ROLES.map((role) => ({
        role,
        permissions: Array.isArray(stored.get(role)) ? stored.get(role) : DEFAULT_ROLE_PERMISSIONS[role],
      })),
    });
  } catch (error) {
    next(error);
  }
});

staffAccessRouter.put("/:shopId/role-policies/:role", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, role } = roleParamsSchema.parse(request.params);
    const input = updatePolicySchema.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const permissions = [...new Set(input.permissions)] as ShopPermission[];
    const policy = await prisma.$transaction(async (tx) => {
      const saved = await tx.shopRolePolicy.upsert({
        where: { shopId_role: { shopId, role } },
        create: { shopId, role, permissions },
        update: { permissions },
      });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "role.permissionsUpdate", entity: "ShopRolePolicy", entityId: saved.id, metadata: { role, permissions } });
      return saved;
    });
    response.json({ policy: { role: policy.role, permissions: policy.permissions } });
  } catch (error) {
    next(error);
  }
});
