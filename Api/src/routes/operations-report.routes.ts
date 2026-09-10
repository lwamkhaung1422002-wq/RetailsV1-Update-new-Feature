import { Router } from "express";
import { z } from "zod";

import { OPERATION_GROUPS, operationGroup, operationSummary } from "../lib/operations-report.js";
import { prisma } from "../lib/prisma.js";
import { assertShopPermission, getAccessibleShops, getShopAccess, hasShopPermission, type ShopAccess } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const operationsReportRouter = Router();
operationsReportRouter.use(requireAuth);

const params = z.object({ shopId: z.string().min(1) });
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
  group: z.enum(OPERATION_GROUPS).optional(),
});

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionLabel(action: string): string {
  return action.split(".").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

operationsReportRouter.get("/:shopId/reports/operations", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const query = querySchema.parse(request.query);
    await assertShopPermission(auth.id, shopId, "audit.view");
    const accessible = await getAccessibleShops(auth.id);
    const accessCandidates = await Promise.all(accessible.map((shop) => getShopAccess(auth.id, shop.id)));
    const accessRows = accessCandidates.filter((access): access is ShopAccess => access !== null && hasShopPermission(access, "audit.view"));
    const allowedIds = new Set(accessRows.map((access) => access.shopId));
    const selectedIds = query.branchId ? [query.branchId] : [...allowedIds];
    if (selectedIds.some((id) => !allowedIds.has(id))) await assertShopPermission(auth.id, query.branchId!, "audit.view");
    const today = dateKey();
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? today;
    const createdAt = { gte: new Date(`${from}T00:00:00.000+06:30`), lte: new Date(`${to}T23:59:59.999+06:30`) };
    const logs = await prisma.auditLog.findMany({ where: { shopId: { in: selectedIds }, createdAt, ...(query.staffId ? { actorId: query.staffId } : {}) }, orderBy: { createdAt: "desc" }, take: 250 });
    const shopRows = accessible.filter((shop) => selectedIds.includes(shop.id));
    const shopById = new Map(shopRows.map((shop) => [shop.id, shop]));
    const actorIds = [...new Set(logs.flatMap((log) => {
      const metadata = objectMetadata(log.metadata);
      return [log.actorId, typeof metadata.approvedById === "string" ? metadata.approvedById : null];
    }).filter((id): id is string => Boolean(id)))];
    const [users, memberships] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
      prisma.shopMember.findMany({ where: { shopId: { in: selectedIds }, userId: { in: actorIds } }, select: { shopId: true, userId: true, role: true } }),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const roleFor = (userId: string | null, branchId: string, metadataRole?: unknown) => typeof metadataRole === "string" ? metadataRole : userId && shopById.get(branchId)?.ownerId === userId ? "OWNER" : memberships.find((member) => member.shopId === branchId && member.userId === userId)?.role ?? "SYSTEM";
    const mapped = logs.map((log) => {
      const metadata = objectMetadata(log.metadata);
      const group = operationGroup(log.action, metadata.authorizationMode);
      const approvedById = typeof metadata.approvedById === "string" ? metadata.approvedById : null;
      return {
        id: log.id, createdAt: log.createdAt, action: log.action, label: actionLabel(log.action), group, entity: log.entity, entityId: log.entityId,
        branch: { id: log.shopId, name: shopById.get(log.shopId)?.name ?? "Branch" },
        actor: log.actorId ? { id: log.actorId, name: userById.get(log.actorId)?.name ?? "Staff", role: roleFor(log.actorId, log.shopId, metadata.actorRole) } : { id: null, name: "System", role: "SYSTEM" },
        approver: approvedById ? { id: approvedById, name: userById.get(approvedById)?.name ?? "Manager", role: roleFor(approvedById, log.shopId, metadata.approvedByRole) } : null,
        authorizationMode: metadata.authorizationMode ?? "direct",
        reason: typeof metadata.approvalReason === "string" ? metadata.approvalReason : typeof metadata.reason === "string" ? metadata.reason : null,
      };
    }).filter((event) => !query.group || event.group === query.group);
    response.json({ range: { from, to }, branches: accessible.filter((shop) => allowedIds.has(shop.id)).map((shop) => ({ id: shop.id, name: shop.name })), staff: users.filter((user) => logs.some((log) => log.actorId === user.id)), summary: operationSummary(logs), groups: OPERATION_GROUPS.map((group) => ({ group, events: mapped.filter((event) => event.group === group) })).filter((entry) => entry.events.length), events: mapped });
  } catch (error) { next(error); }
});
