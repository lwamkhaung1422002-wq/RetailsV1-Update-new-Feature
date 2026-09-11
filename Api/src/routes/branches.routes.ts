import { Router } from "express";
import { z } from "zod";

import { summarizeBranchInventory } from "../lib/branch-domain.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import { applyTemplateDefaults } from "../lib/store-capabilities.js";
import { assertShopAccess, assertShopOwner, assertShopPermission, getAccessibleShops, getShopAccess, hasShopPermission, publicShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const branchesRouter = Router();
branchesRouter.use(requireAuth);

const params = z.object({ shopId: z.string().min(1) });
const branchParams = z.object({ shopId: z.string().min(1), branchId: z.string().min(1) });
const createBranch = z.object({ name: z.string().trim().min(1).max(120), address: z.string().trim().max(500).optional(), currencyCode: z.enum(["MMK", "USD", "THB"]).optional() });
const updateBranch = createBranch.pick({ name: true, address: true }).partial();

function yangonDayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const key = `${value("year")}-${value("month")}-${value("day")}`;
  return { gte: new Date(`${key}T00:00:00.000+06:30`), lte: new Date(`${key}T23:59:59.999+06:30`) };
}

async function accessibleBranchContext(userId: string, activeShopId: string) {
  const activeAccess = await assertShopAccess(userId, activeShopId);
  const accessibleShops = await getAccessibleShops(userId);
  const shops = activeAccess.isOwner
    ? accessibleShops.filter((shop) => shop.isOwner)
    : accessibleShops.filter((shop) => shop.id === activeShopId);
  const access = new Map((await Promise.all(shops.map((shop) => getShopAccess(userId, shop.id)))).filter((item) => item !== null).map((item) => [item.shopId, item]));
  return { shops, access, activeAccess };
}

branchesRouter.get("/:shopId/branches", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const { shops, access } = await accessibleBranchContext(auth.id, shopId);
    const salesShopIds = shops.filter((shop) => hasShopPermission(access.get(shop.id)!, "report.viewSales")).map((shop) => shop.id);
    const inventoryShopIds = shops.filter((shop) => hasShopPermission(access.get(shop.id)!, "stock.view") || hasShopPermission(access.get(shop.id)!, "report.viewCost")).map((shop) => shop.id);
    const [orders, balances, members] = await Promise.all([
      prisma.order.findMany({ where: { shopId: { in: salesShopIds }, createdAt: yangonDayRange(), fulfillmentStatus: { not: "cancelled" } }, select: { shopId: true, total: true } }),
      prisma.inventoryBalance.findMany({ where: { shopId: { in: inventoryShopIds } }, include: { product: { select: { name: true, sku: true, minimumStock: true, cost: true } } } }),
      prisma.shopMember.findMany({ where: { shopId: { in: shops.map((shop) => shop.id) }, active: true }, select: { shopId: true } }),
    ]);
    const inventory = summarizeBranchInventory(balances);
    response.json({ branches: shops.map((shop) => {
      const branchOrders = orders.filter((order) => order.shopId === shop.id);
      const branchInventory = inventory.filter((item) => item.shopId === shop.id);
      const branchAccess = access.get(shop.id)!;
      const canViewSales = hasShopPermission(branchAccess, "report.viewSales");
      const canViewStock = hasShopPermission(branchAccess, "stock.view");
      const canViewCost = hasShopPermission(branchAccess, "report.viewCost");
      return {
        id: shop.id, name: shop.name, address: shop.address, logoUrl: shop.logoUrl, setting: shop.setting,
        role: branchAccess.role, permissions: branchAccess.permissions, isOwner: branchAccess.isOwner,
        todaySales: canViewSales ? branchOrders.reduce((sum, order) => sum + order.total, 0) : null,
        orders: canViewSales ? branchOrders.length : null,
        lowStock: canViewStock ? branchInventory.filter((item) => item.available <= item.minimumStock).length : null,
        stockValue: canViewCost ? branchInventory.reduce((sum, item) => sum + item.stockValue, 0) : null,
        staff: branchAccess.isOwner || hasShopPermission(branchAccess, "staff.manage") ? members.filter((member) => member.shopId === shop.id).length : null,
      };
    }) });
  } catch (error) { next(error); }
});

branchesRouter.get("/:shopId/branches/inventory", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const { shops, access, activeAccess } = await accessibleBranchContext(auth.id, shopId);
    if (!activeAccess.isOwner) await assertShopPermission(auth.id, shopId, "stock.view");
    const visibleShops = shops.filter((shop) => hasShopPermission(access.get(shop.id)!, "stock.view"));
    const balances = await prisma.inventoryBalance.findMany({ where: { shopId: { in: visibleShops.map((shop) => shop.id) } }, include: { product: { select: { name: true, sku: true, minimumStock: true, cost: true } } } });
    const shopById = new Map(visibleShops.map((shop) => [shop.id, shop]));
    response.json({ inventory: summarizeBranchInventory(balances).map((item) => ({ ...item, branchName: shopById.get(item.shopId)?.name ?? "Branch", stockValue: hasShopPermission(access.get(item.shopId)!, "report.viewCost") ? item.stockValue : null })) });
  } catch (error) { next(error); }
});

branchesRouter.post("/:shopId/branches", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = createBranch.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    const source = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, include: { setting: true } });
    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.shop.create({ data: { name: input.name, ...(input.address !== undefined ? { address: input.address } : {}), ownerId: auth.id, ledgerEnabled: true, inventoryReadMode: "LEDGER", ledgerCutoverAt: new Date(), setting: { create: { currencyCode: input.currencyCode ?? source.setting?.currencyCode ?? "MMK" } } }, include: { setting: true } });
      await applyTemplateDefaults(tx, created.id, "GENERAL_STORE", { includeCategories: false });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "branch.add", entity: "Shop", entityId: created.id, metadata: { name: created.name } });
      return created;
    });
    response.status(201).json({ branch: { ...publicShop(branch), role: "OWNER", permissions: [], isOwner: true } });
  } catch (error) { next(error); }
});

branchesRouter.patch("/:shopId/branches/:branchId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, branchId } = branchParams.parse(request.params);
    const input = updateBranch.parse(request.body);
    await assertShopOwner(auth.id, shopId);
    await assertShopOwner(auth.id, branchId);
    const branch = await prisma.$transaction(async (tx) => {
      const data = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.address !== undefined ? { address: input.address } : {}) };
      const updated = await tx.shop.update({ where: { id: branchId }, data, include: { setting: true } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "branch.update", entity: "Shop", entityId: branchId, metadata: data });
      return updated;
    });
    response.json({ branch: publicShop(branch) });
  } catch (error) { next(error); }
});
