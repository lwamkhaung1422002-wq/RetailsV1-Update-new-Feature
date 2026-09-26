import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), findUnit: vi.fn(), deleteUnit: vi.fn(),
  productUnit: vi.fn(), movement: vi.fn(), orderItem: vi.fn(), purchaseItem: vi.fn(),
}));
vi.mock("../lib/prisma.js", () => {
  const prisma = {
    unitOfMeasure: { findMany: mocks.list, findFirst: mocks.findUnit, delete: mocks.deleteUnit },
    productUnit: { findFirst: mocks.productUnit },
    inventoryMovement: { findFirst: mocks.movement },
    orderItem: { findFirst: mocks.orderItem },
    purchaseItem: { findFirst: mocks.purchaseItem },
    $transaction: async (run: (tx: unknown) => unknown) => run(prisma),
  };
  return { prisma };
});
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../lib/store-capabilities.js", () => ({ assertCapability: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));
import { capabilityInventoryRouter } from "./capability-inventory.routes.js";

const app = express();
app.use(express.json());
app.use(capabilityInventoryRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.name === "ConflictError" ? 409 : error.name === "NotFoundError" ? 404 : 400).json({ message: error.message });
});

const unit = { id: "unit-1", shopId: "shop-1", name: "Carton", symbol: "ctn", precision: 0, isActive: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([unit]);
  mocks.findUnit.mockResolvedValue(unit);
  mocks.deleteUnit.mockResolvedValue(unit);
  for (const lookup of [mocks.productUnit, mocks.movement, mocks.orderItem, mocks.purchaseItem]) lookup.mockResolvedValue(null);
});

describe("shop UnitOfMeasure deletion", () => {
  it("exposes canDelete for a completely unused unit and deletes it", async () => {
    const listed = await request(app).get("/shop-1/units").expect(200);
    expect(listed.body.units).toEqual([expect.objectContaining({ id: unit.id, canDelete: true })]);
    await request(app).delete("/shop-1/units/unit-1").expect(204);
    expect(mocks.deleteUnit).toHaveBeenCalledWith({ where: { id: unit.id } });
  });

  it.each([
    ["ProductUnit", mocks.productUnit],
    ["InventoryMovement", mocks.movement],
    ["historical OrderItem", mocks.orderItem],
    ["historical PurchaseItem", mocks.purchaseItem],
  ])("rejects a unit referenced by %s", async (_name, lookup) => {
    lookup.mockResolvedValue({ id: "history-1" });
    const listed = await request(app).get("/shop-1/units").expect(200);
    expect(listed.body.units[0].canDelete).toBe(false);
    const deleted = await request(app).delete("/shop-1/units/unit-1").expect(409);
    expect(deleted.body.message).toMatch(/already in use/);
    expect(mocks.deleteUnit).not.toHaveBeenCalled();
  });

  it("rechecks after an earlier canDelete=true response", async () => {
    await request(app).get("/shop-1/units").expect(200);
    mocks.orderItem.mockResolvedValue({ id: "new-order-item" });
    await request(app).delete("/shop-1/units/unit-1").expect(409);
    expect(mocks.deleteUnit).not.toHaveBeenCalled();
  });
});
