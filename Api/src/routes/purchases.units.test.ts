import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supplierFind: vi.fn(), productFind: vi.fn(), purchaseCount: vi.fn(), purchaseFind: vi.fn(),
  purchaseCreate: vi.fn(), purchaseUpdate: vi.fn(), supplierUpsert: vi.fn(),
  locationFind: vi.fn(), batchCreate: vi.fn(), itemUpdate: vi.fn(), itemFind: vi.fn(), receiptCreate: vi.fn(),
  recordMovement: vi.fn(), refreshCost: vi.fn(), audit: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  supplier: { findFirst: mocks.supplierFind }, product: { findMany: mocks.productFind },
  purchase: { count: mocks.purchaseCount, findFirst: mocks.purchaseFind },
  inventoryLocation: { findFirst: mocks.locationFind },
  $transaction: async (run: (tx: unknown) => unknown) => run({
    purchase: { create: mocks.purchaseCreate, update: mocks.purchaseUpdate },
    productSupplier: { upsert: mocks.supplierUpsert },
    inventoryBatch: { create: mocks.batchCreate },
    purchaseItem: { update: mocks.itemUpdate, findMany: mocks.itemFind },
    purchaseReceipt: { create: mocks.receiptCreate },
  }),
} }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/inventory-domain.js", () => ({ recordInventoryMovement: mocks.recordMovement }));
vi.mock("../lib/costing.js", () => ({ refreshProductWeightedCost: mocks.refreshCost }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { purchasesRouter } from "./purchases.routes.js";

const app = express();
app.use(express.json());
app.use(purchasesRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

let purchase: any;
let product: any;

beforeEach(() => {
  vi.clearAllMocks();
  product = { id: "product-1", name: "Coffee", trackingMode: "NONE", capabilities: {}, variants: [], units: [
    { id: "piece-product-unit", unitId: "piece", isBase: true, canPurchase: true, conversionFactor: "1", unit: { precision: 0 } },
    { id: "carton-product-unit", unitId: "carton", canPurchase: true, conversionFactor: "24", unit: { precision: 0 } },
  ] };
  mocks.supplierFind.mockResolvedValue({ id: "supplier-1" });
  mocks.productFind.mockImplementation(async () => [product]);
  mocks.purchaseCount.mockResolvedValue(0);
  mocks.purchaseCreate.mockImplementation(async ({ data }) => {
    purchase = { id: "purchase-1", purchaseNumber: data.purchaseNumber, status: "ordered", deliveryCost: 0,
      items: data.items.create.map((item: any) => ({ id: "line-1", ...item, receivedQuantity: 0, receivedBaseQuantity: 0, product })) };
    return purchase;
  });
  mocks.purchaseFind.mockImplementation(async () => purchase);
  mocks.purchaseUpdate.mockImplementation(async ({ data }) => ({ ...purchase, ...data }));
  mocks.supplierUpsert.mockResolvedValue({});
  mocks.locationFind.mockResolvedValue({ id: "main", shopId: "shop-1", type: "SELLABLE", isActive: true });
  mocks.batchCreate.mockResolvedValue({ id: "batch-1" });
  mocks.itemUpdate.mockResolvedValue({});
  mocks.itemFind.mockImplementation(async () => purchase.items);
  mocks.receiptCreate.mockResolvedValue({ id: "receipt-1" });
  mocks.recordMovement.mockResolvedValue(null);
  mocks.refreshCost.mockResolvedValue(750);
  mocks.audit.mockResolvedValue(undefined);
});

describe("purchase unit snapshots", () => {
  it("keeps ten cartons as 240 pieces when the current conversion later changes", async () => {
    await request(app).post("/shop-1/purchases").send({ supplierId: "supplier-1", items: [
      { productId: "product-1", unitId: "carton", quantity: 10, unitCost: 18_000 },
    ] }).expect(201);
    const line = mocks.purchaseCreate.mock.calls[0]![0].data.items.create[0];
    expect(line).toMatchObject({ unitId: "carton", quantity: 240, unitCost: 18_000, lineTotal: 180_000 });
    expect(String(line.enteredQuantity)).toBe("10");
    expect(String(line.conversionFactor)).toBe("24");
    expect(String(line.baseQuantity)).toBe("240");

    product.units[1].conversionFactor = "30";
    await request(app).post("/shop-1/purchases/purchase-1/receive").send({ items: [{ purchaseItemId: "line-1", quantity: 10 }] }).expect(200);
    const batch = mocks.batchCreate.mock.calls[0]![0].data;
    expect(batch.quantity).toBe(240);
    expect(String(batch.baseQuantity)).toBe("240");
    expect(batch.unitCost).toBe(750);
    expect(mocks.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      unitId: "carton", enteredQuantity: 10, conversionFactor: "24", quantity: "240",
    }));
  });
});
