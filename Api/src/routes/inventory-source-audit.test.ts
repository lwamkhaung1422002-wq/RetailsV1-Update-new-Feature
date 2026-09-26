import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findVariant: vi.fn(),
  findProductUnit: vi.fn(),
  createBatch: vi.fn(),
  listBatches: vi.fn(),
  listMovements: vi.fn(),
  updateMovement: vi.fn(),
  recordMovement: vi.fn(),
  refreshCost: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    product: { findFirst: mocks.findProduct },
    productVariant: { findFirst: mocks.findVariant },
    inventoryBatch: { findMany: mocks.listBatches },
    inventoryMovement: { findMany: mocks.listMovements },
    orderItemAllocation: { findMany: vi.fn().mockResolvedValue([]) },
    orderItem: { findMany: vi.fn().mockResolvedValue([]) },
    order: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: async (run: (tx: unknown) => unknown) => run({
      inventoryBatch: { create: mocks.createBatch },
      productUnit: { findFirst: mocks.findProductUnit },
      inventoryMovement: { update: mocks.updateMovement },
    }),
  },
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/inventory-domain.js", () => ({ recordInventoryMovement: mocks.recordMovement }));
vi.mock("../lib/costing.js", () => ({ refreshProductWeightedCost: mocks.refreshCost }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { inventoryRouter } from "./inventory.routes.js";

const app = express();
app.use(express.json());
app.use(inventoryRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(400).json({ message: error.message });
});

describe("stock receipt source audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProduct.mockResolvedValue({ id: "product-1", isActive: true });
    mocks.findVariant.mockResolvedValue(null);
    mocks.findProductUnit.mockResolvedValue(null);
    mocks.createBatch.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
      id: "batch-1",
      reservedQuantity: 0,
      receivedAt: new Date("2026-09-11T00:00:00.000Z"),
      ...data,
      product: { id: "product-1", name: "Coffee" },
      variant: null,
    }));
    mocks.recordMovement.mockResolvedValue({ id: "movement-1" });
    mocks.refreshCost.mockResolvedValue(450);
    mocks.updateMovement.mockResolvedValue({ id: "movement-1" });
    mocks.listBatches.mockResolvedValue([]);
    mocks.listMovements.mockResolvedValue([]);
  });

  it("persists Supplier and Invoice / Reference without changing quantity or costing inputs", async () => {
    const result = await request(app).post("/shop-1/inventory").send({
      productId: "product-1",
      quantity: 12,
      unitCost: 450,
      supplierName: "Golden Supply",
      invoiceReference: "INV-001",
      note: "Initial stock created with product.",
    }).expect(201);

    expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        productId: "product-1",
        quantity: 12,
        unitCost: 450,
        supplierName: "Golden Supply",
        invoiceReference: "INV-001",
      }),
    }));
    expect(mocks.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      quantity: 12,
      unitCost: 450,
      inventoryBatchId: "batch-1",
    }));
    expect(mocks.refreshCost).toHaveBeenCalledWith(expect.anything(), "shop-1", "product-1");
    expect(result.body.inventoryBatch).toMatchObject({
      quantity: 12,
      unitCost: 450,
      supplierName: "Golden Supply",
      invoiceReference: "INV-001",
    });
  });

  it("keeps both source fields optional for the existing Stock In request", async () => {
    await request(app).post("/shop-1/inventory").send({
      productId: "product-1",
      quantity: 7,
      unitCost: 600,
      note: "Existing stock in",
    }).expect(201);

    const data = mocks.createBatch.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ productId: "product-1", quantity: 7, unitCost: 600 });
    expect(data).not.toHaveProperty("supplierName");
    expect(data).not.toHaveProperty("invoiceReference");
  });

  it("receives ten cartons as 240 base pieces with a fixed movement snapshot", async () => {
    mocks.findProductUnit.mockResolvedValue({ unitId: "carton", conversionFactor: 24, unit: { shopId: "shop-1", isActive: true } });
    await request(app).post("/shop-1/inventory").send({
      productId: "product-1", unitId: "carton", quantity: 10, unitCost: 18_000,
    }).expect(201);
    expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 240, unitCost: 750 }),
    }));
    expect(mocks.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      unitId: "carton", enteredQuantity: 10, conversionFactor: "24", quantity: 240,
    }));
  });

  it("accepts a fractional purchase unit only when its precision converts to whole base stock", async () => {
    mocks.findProductUnit.mockResolvedValue({ unitId: "carton", conversionFactor: 24, unit: { shopId: "shop-1", isActive: true, precision: 1 } });
    await request(app).post("/shop-1/inventory").send({ productId: "product-1", unitId: "carton", quantity: 0.5, unitCost: 9000 }).expect(201);
    expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 12, unitCost: 375 }) }));
    expect(mocks.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enteredQuantity: 0.5, quantity: 12 }));
  });

  it("rejects disabled purchase units and fractional base stock without rounding it", async () => {
    mocks.findProductUnit.mockResolvedValue({ unitId: "carton", conversionFactor: 24, canPurchase: false, unit: { shopId: "shop-1", isActive: true, precision: 0 } });
    await request(app).post("/shop-1/inventory").send({ productId: "product-1", unitId: "carton", quantity: 1, unitCost: 18_000 }).expect(400);
    mocks.findProductUnit.mockResolvedValue({ unitId: "carton", conversionFactor: 0.999999, canPurchase: true, unit: { shopId: "shop-1", isActive: true, precision: 0 } });
    await request(app).post("/shop-1/inventory").send({ productId: "product-1", unitId: "carton", quantity: 1, unitCost: 18_000 }).expect(400);
    expect(mocks.createBatch).not.toHaveBeenCalled();
  });

  it("keeps old inventory records with null source metadata readable", async () => {
    mocks.listBatches.mockResolvedValue([{ id: "legacy-batch", supplierName: null, invoiceReference: null }]);
    const result = await request(app).get("/shop-1/inventory").expect(200);
    expect(result.body.inventory).toEqual([{ id: "legacy-batch", supplierName: null, invoiceReference: null }]);
    expect(mocks.listBatches).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    }));
  });

  it("returns receipt source metadata on existing stock movement history", async () => {
    mocks.listMovements.mockResolvedValue([{
      id: "movement-1",
      sourceType: "InventoryBatch",
      sourceId: "batch-1",
      inventoryBatch: { supplierName: "Golden Supply", invoiceReference: "INV-001" },
    }]);
    const result = await request(app).get("/shop-1/inventory-movements").expect(200);
    expect(result.body.movements[0]).toMatchObject({
      supplierName: "Golden Supply",
      invoiceReference: "INV-001",
    });
  });
});
