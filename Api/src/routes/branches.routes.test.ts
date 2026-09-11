import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  assertPermission: vi.fn(),
  accessibleShops: vi.fn(),
  shopAccess: vi.fn(),
  orders: vi.fn(),
  balances: vi.fn(),
  members: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    order: { findMany: mocks.orders },
    inventoryBalance: { findMany: mocks.balances },
    shopMember: { findMany: mocks.members },
  },
}));
vi.mock("../lib/shop-access.js", () => ({
  assertShopAccess: mocks.assertAccess,
  assertShopOwner: vi.fn(),
  assertShopPermission: mocks.assertPermission,
  getAccessibleShops: mocks.accessibleShops,
  getShopAccess: mocks.shopAccess,
  hasShopPermission: (access: { isOwner: boolean; permissions: string[] }, permission: string) => access.isOwner || access.permissions.includes(permission),
  publicShop: (shop: unknown) => shop,
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../lib/store-capabilities.js", () => ({ applyTemplateDefaults: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { branchesRouter } from "./branches.routes.js";

const app = express();
app.use(express.json());
app.use(branchesRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error.name === "NotFoundError" ? 404 : error.name === "ForbiddenError" ? 403 : 400;
  response.status(status).json({ message: error.message });
});

const ownerShop = { id: "shop-1", name: "Downtown", address: null, logoUrl: null, setting: {}, isOwner: true };
const staffShop = { ...ownerShop, isOwner: false };
const secondShop = { ...ownerShop, id: "shop-2", name: "Uptown" };
const balance = {
  shopId: "shop-1",
  productId: "product-1",
  onHand: 5,
  reserved: 1,
  product: { name: "Rice", sku: "RICE", minimumStock: 4, cost: 1_000 },
};

function access(permissions: string[] = [], isOwner = false) {
  return { shopId: "shop-1", role: isOwner ? "OWNER" : "CASHIER", permissions, isOwner };
}

describe("branch overview permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orders.mockResolvedValue([{ shopId: "shop-1", total: 10_000 }]);
    mocks.balances.mockResolvedValue([balance]);
    mocks.members.mockResolvedValue([{ shopId: "shop-1" }]);
    mocks.assertPermission.mockResolvedValue(access(["stock.view"]));
  });

  it("lets an owner see all branch metrics", async () => {
    const ownerAccess = access([], true);
    mocks.assertAccess.mockResolvedValue(ownerAccess);
    mocks.accessibleShops.mockResolvedValue([ownerShop, secondShop]);
    mocks.shopAccess.mockImplementation((_userId: string, shopId: string) => Promise.resolve({ ...ownerAccess, shopId }));

    const result = await request(app).get("/shop-1/branches").expect(200);

    expect(result.body.branches).toHaveLength(2);
    expect(result.body.branches[0]).toEqual(expect.objectContaining({
      todaySales: 10_000,
      orders: 1,
      lowStock: 1,
      stockValue: 5_000,
      staff: 1,
    }));
  });

  it("hides stock value from a Cashier without report.viewCost", async () => {
    const cashierAccess = access(["report.viewSales", "stock.view"]);
    mocks.assertAccess.mockResolvedValue(cashierAccess);
    mocks.accessibleShops.mockResolvedValue([staffShop, { ...secondShop, isOwner: false }]);
    mocks.shopAccess.mockResolvedValue(cashierAccess);

    const result = await request(app).get("/shop-1/branches").expect(200);

    expect(result.body.branches).toHaveLength(1);
    expect(result.body.branches[0].stockValue).toBeNull();
    expect(result.body.branches[0].todaySales).toBe(10_000);
  });

  it("hides sales and order performance without report.viewSales", async () => {
    const stockAccess = access(["stock.view"]);
    mocks.assertAccess.mockResolvedValue(stockAccess);
    mocks.accessibleShops.mockResolvedValue([staffShop]);
    mocks.shopAccess.mockResolvedValue(stockAccess);

    const result = await request(app).get("/shop-1/branches").expect(200);

    expect(result.body.branches[0].todaySales).toBeNull();
    expect(result.body.branches[0].orders).toBeNull();
    expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ shopId: { in: [] } }) }));
  });

  it("does not expose an unrelated branch", async () => {
    const error = Object.assign(new Error("Shop not found."), { name: "NotFoundError" });
    mocks.assertAccess.mockRejectedValue(error);

    await request(app).get("/unrelated/branches").expect(404);
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("requires stock.view for branch inventory details", async () => {
    const cashierAccess = access(["report.viewSales"]);
    const error = Object.assign(new Error("You do not have permission for this action."), { name: "ForbiddenError" });
    mocks.assertAccess.mockResolvedValue(cashierAccess);
    mocks.accessibleShops.mockResolvedValue([staffShop]);
    mocks.shopAccess.mockResolvedValue(cashierAccess);
    mocks.assertPermission.mockRejectedValue(error);

    await request(app).get("/shop-1/branches/inventory").expect(403);
    expect(mocks.balances).not.toHaveBeenCalled();
  });
});
