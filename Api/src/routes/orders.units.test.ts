import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productFind: vi.fn(), shopUpdate: vi.fn(), orderCreate: vi.fn(), orderFind: vi.fn(), orderFindFirst: vi.fn(), operationalFind: vi.fn(), orderUpdate: vi.fn(),
  batchFind: vi.fn(), batchUpdate: vi.fn(), itemCreate: vi.fn(), paymentCreate: vi.fn(),
  reserve: vi.fn(), movement: vi.fn(), lotFind: vi.fn(), price: vi.fn(), audit: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: { order: { findFirst: mocks.orderFindFirst }, $transaction: async (run: (tx: unknown) => unknown) => run({
  product: { findFirst: mocks.productFind }, shop: { update: mocks.shopUpdate },
  order: { create: mocks.orderCreate, findUniqueOrThrow: mocks.orderFind, findFirstOrThrow: mocks.operationalFind, update: mocks.orderUpdate },
  inventoryBatch: { findMany: mocks.batchFind, update: mocks.batchUpdate },
  inventoryLot: { findMany: mocks.lotFind },
  orderItem: { create: mocks.itemCreate }, payment: { create: mocks.paymentCreate },
}) } }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../lib/pricing-domain.js", () => ({ resolvePrice: mocks.price }));
vi.mock("../lib/inventory-domain.js", () => ({ setInventoryReservation: mocks.reserve, recordInventoryMovement: mocks.movement }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { ordersRouter } from "./orders.routes.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).log = { info: vi.fn() }; next(); });
app.use(ordersRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

const piece = { id: "piece-product-unit", unitId: "piece", isBase: true, canSell: true, conversionFactor: "1", minimumOrderQty: null, unit: { name: "Piece", symbol: "pc", precision: 0 } };
const carton = { id: "carton-product-unit", unitId: "carton", isBase: false, canSell: true, conversionFactor: "24", minimumOrderQty: "3", unit: { name: "Carton", symbol: "ctn", precision: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.productFind.mockResolvedValue({ id: "product-1", name: "Coffee", isActive: true, price: 1000, cost: 750, trackingMode: "NONE", quantityPrecision: 0, units: [piece, carton], variants: [], priceTiers: [], recipe: null });
  mocks.shopUpdate.mockResolvedValue({ saleSequence: 1 });
  mocks.orderCreate.mockResolvedValue({ id: "order-1" });
  mocks.orderFind.mockResolvedValue({ id: "order-1" });
  mocks.orderFindFirst.mockResolvedValue({ id: "order-1", fulfillmentStatus: "reserved" });
  mocks.operationalFind.mockResolvedValue({ items: [{ id: "item-1", product: { recipe: null } }] });
  mocks.orderUpdate.mockResolvedValue({ id: "order-1", completedAt: new Date(), items: [{ id: "item-1", productId: "product-1", variantId: null, quantity: 120, baseQuantity: "120", allocations: [{ id: "allocation-1", inventoryBatchId: "batch-1", quantity: 120, baseQuantity: "120", unitCost: 750 }], serialAllocations: [] }] });
  mocks.lotFind.mockResolvedValue([]);
  mocks.movement.mockResolvedValue({});
  mocks.batchFind.mockResolvedValue([{ id: "batch-1", quantity: 200, baseQuantity: "200", reservedQuantity: 0, unitCost: 750, lots: [], receivedAt: new Date() }]);
  mocks.batchUpdate.mockResolvedValue({});
  mocks.itemCreate.mockResolvedValue({ id: "item-1" });
  mocks.paymentCreate.mockResolvedValue({ id: "payment-1" });
  mocks.reserve.mockResolvedValue({});
  mocks.price.mockImplementation(async (_tx, _shop, input) => ({
    regularUnitPrice: input.productUnitId === carton.id ? 24_000 : 1000,
    tierUnitPrice: null, appliedTierId: null, promotionId: null, promotionType: null,
    promotionValue: null, promotionDiscount: 0, manualDiscount: 0,
    finalUnitPrice: input.productUnitId === carton.id ? 24_000 : 1000,
    priceResolvedAt: new Date(), currencyCode: "MMK",
  }));
  mocks.audit.mockResolvedValue(undefined);
});

describe("order unit quantities", () => {
  it("rejects two cartons below the entered-unit MOQ of three", async () => {
    const result = await request(app).post("/shop-1/orders").send({ items: [{ productId: "product-1", unitId: "carton", quantity: 2 }] }).expect(400);
    expect(result.body.message).toMatch(/Minimum order quantity is 3 ctn/);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("accepts three cartons and reserves 72 base pieces", async () => {
    await request(app).post("/shop-1/orders").send({ initialPayment: { method: "Cash", amount: 72_000 }, items: [
      { productId: "product-1", unitId: "carton", quantity: 3 },
    ] }).expect(201);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantity: "72" }));
  });

  it("stores five cartons as 120 base pieces with entered-unit pricing snapshots", async () => {
    await request(app).post("/shop-1/orders").send({ initialPayment: { method: "Cash", amount: 120_000 }, items: [
      { productId: "product-1", unitId: "carton", quantity: 5, unitPrice: 1 },
    ] }).expect(201);
    expect(mocks.price).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ productUnitId: carton.id, quantity: expect.anything() }));
    expect(mocks.batchUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { reservedQuantity: 120 } }));
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantity: "120" }));
    expect(mocks.itemCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      quantity: 120, enteredQuantity: "5", conversionFactor: "24", baseQuantity: "120", unitId: "carton", unitPrice: 24_000, lineTotal: 120_000,
      pricingSnapshot: expect.objectContaining({ unitName: "Carton", unitSymbol: "ctn" }),
    }) }));
  });

  it("deducts 120 base pieces when the five-carton order is completed", async () => {
    await request(app).patch("/shop-1/orders/order-1/status").send({ fulfillmentStatus: "completed" }).expect(200);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantity: "120", release: true }));
    expect(mocks.movement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ direction: "OUT", quantity: "120", type: "SALE" }));
  });

  it("keeps a Piece-only retail sale at one-to-one quantity and price", async () => {
    mocks.productFind.mockResolvedValueOnce({ id: "product-1", name: "Coffee", isActive: true, price: 1000, cost: 750, trackingMode: "NONE", quantityPrecision: 0, units: [piece], variants: [], priceTiers: [], recipe: null });
    await request(app).post("/shop-1/orders").send({ initialPayment: { method: "Cash", amount: 2000 }, items: [{ productId: "product-1", quantity: 2 }] }).expect(201);
    expect(mocks.itemCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 2, enteredQuantity: "2", conversionFactor: "1", baseQuantity: "2", unitPrice: 1000 }) }));
  });
});
