import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productFind: vi.fn(), shopUpdate: vi.fn(), orderCreate: vi.fn(), orderFind: vi.fn(), orderFindFirst: vi.fn(), operationalFind: vi.fn(), orderUpdate: vi.fn(),
  batchFind: vi.fn(), batchUpdate: vi.fn(), itemCreate: vi.fn(), paymentCreate: vi.fn(),
  reserve: vi.fn(), movement: vi.fn(), lotFind: vi.fn(), price: vi.fn(), audit: vi.fn(),
  customerFind: vi.fn(), settingsFind: vi.fn(), creditOrders: vi.fn(), allocatedPayments: vi.fn(), lockCustomer: vi.fn(),
  groupFind: vi.fn(), groupUpsert: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: { order: { findFirst: mocks.orderFindFirst }, customer: { findFirst: mocks.customerFind }, $transaction: async (run: (tx: unknown) => unknown) => run({
  product: { findFirst: mocks.productFind }, shop: { update: mocks.shopUpdate },
  order: { create: mocks.orderCreate, findUniqueOrThrow: mocks.orderFind, findFirstOrThrow: mocks.operationalFind, update: mocks.orderUpdate, findMany: mocks.creditOrders },
  customer: { findFirst: mocks.customerFind }, shopSetting: { findUnique: mocks.settingsFind }, $queryRaw: mocks.lockCustomer,
  customerPriceGroup: { findUnique: mocks.groupFind, upsert: mocks.groupUpsert },
  inventoryBatch: { findMany: mocks.batchFind, update: mocks.batchUpdate },
  inventoryLot: { findMany: mocks.lotFind },
  orderItem: { create: mocks.itemCreate }, payment: { create: mocks.paymentCreate, findMany: mocks.allocatedPayments },
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
  mocks.customerFind.mockResolvedValue({ id: "customer-1", shopId: "shop-1", priceGroupId: null, priceGroup: null, creditLimitOverride: null, paymentTermsDaysOverride: null });
  mocks.groupFind.mockResolvedValue({ id: "wholesale-group" });
  mocks.groupUpsert.mockResolvedValue({ id: "wholesale-group" });
  mocks.settingsFind.mockResolvedValue({ defaultCreditLimit: 0, defaultPaymentTermsDays: 30 });
  mocks.creditOrders.mockResolvedValue([]);
  mocks.allocatedPayments.mockResolvedValue([]);
  mocks.lockCustomer.mockResolvedValue([{ id: "customer-1" }]);
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
    expect(mocks.price).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: null }));
    expect(mocks.groupFind).not.toHaveBeenCalled();
  });

  it("uses canonical Wholesale context for a legacy customer and ignores a stale display price", async () => {
    mocks.price.mockImplementation(async (_tx, _shop, input) => ({
      regularUnitPrice: 1000, tierUnitPrice: 900, appliedTierId: null, promotionId: null,
      promotionType: null, promotionValue: null, promotionDiscount: 0, manualDiscount: 0,
      finalUnitPrice: input.priceGroupId === "wholesale-group" ? 900 : 1000,
      priceResolvedAt: new Date(), currencyCode: "MMK",
    }));
    await request(app).post("/shop-1/orders").send({ customerId: "customer-1", initialPayment: { method: "Cash", amount: 9_000 }, items: [
      { productId: "product-1", quantity: 10, unitPrice: 1 },
    ] }).expect(201);
    expect(mocks.groupFind).toHaveBeenCalledWith({ where: { shopId_name: { shopId: "shop-1", name: "Wholesale" } }, select: { id: true } });
    expect(mocks.groupUpsert).not.toHaveBeenCalled();
    expect(mocks.price).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: "wholesale-group" }));
    expect(mocks.itemCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitPrice: 900, lineTotal: 9_000 }) }));
  });
});

describe("order credit enforcement", () => {
  const twoPieces = { customerId: "customer-1", items: [{ productId: "product-1", quantity: 2 }] };

  it("allows fully paid sales for a zero-limit customer without due terms", async () => {
    await request(app).post("/shop-1/orders").send({ ...twoPieces, initialPayment: { method: "Cash", amount: 2_000 } }).expect(201);
    expect(mocks.lockCustomer).not.toHaveBeenCalled();
    expect(mocks.orderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentTracking: false, paymentTermsDaysSnapshot: null, dueAt: null }) }));
  });

  it("rejects unpaid sales when effective credit limit is zero", async () => {
    const result = await request(app).post("/shop-1/orders").send(twoPieces).expect(400);
    expect(result.body.message).toMatch(/credit limit is 0/i);
    expect(mocks.lockCustomer).toHaveBeenCalled();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("locks the customer, includes existing unpaid exposure, and rejects excess", async () => {
    mocks.settingsFind.mockResolvedValue({ defaultCreditLimit: 2_500, defaultPaymentTermsDays: 30 });
    mocks.creditOrders.mockResolvedValue([{
      id: "existing", total: 1_000, subtotal: 1_000, discount: 0, deliveryFee: 0,
      createdAt: new Date(), paymentTracking: true, dueAt: null, payments: [],
      items: [{ id: "old-item", quantity: 1, lineTotal: 1_000, returns: [] }],
    }]);
    const result = await request(app).post("/shop-1/orders").send(twoPieces).expect(400);
    expect(result.body.message).toMatch(/Credit limit exceeded by 500/);
    expect(mocks.lockCustomer.mock.invocationCallOrder[0]!).toBeLessThan(mocks.creditOrders.mock.invocationCallOrder[0]!);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("serializes simultaneous credit checks so only one cashier can consume the available limit", async () => {
    mocks.settingsFind.mockResolvedValue({ defaultCreditLimit: 2_500, defaultPaymentTermsDays: 30 });
    const outstandingOrders: unknown[] = [];
    let releaseSecondLock!: () => void;
    const secondLock = new Promise<void>((resolve) => { releaseSecondLock = resolve; });
    let lockCount = 0;
    mocks.lockCustomer.mockImplementation(async () => {
      lockCount += 1;
      if (lockCount === 2) await secondLock;
      return [{ id: "customer-1" }];
    });
    mocks.creditOrders.mockImplementation(async () => [...outstandingOrders]);
    mocks.orderCreate.mockImplementation(async () => {
      outstandingOrders.push({
        id: "first-order", total: 2_000, subtotal: 2_000, discount: 0, deliveryFee: 0,
        createdAt: new Date(), paymentTracking: true, dueAt: null, payments: [],
        items: [{ id: "first-item", quantity: 2, lineTotal: 2_000, returns: [] }],
      });
      releaseSecondLock();
      return { id: "first-order" };
    });

    const [first, second] = await Promise.all([
      request(app).post("/shop-1/orders").send(twoPieces),
      request(app).post("/shop-1/orders").send(twoPieces),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    expect([first.body.message, second.body.message].filter(Boolean).join(" ")).toMatch(/Credit limit exceeded by 1,500/);
    expect(mocks.lockCustomer).toHaveBeenCalledTimes(2);
    expect(mocks.orderCreate).toHaveBeenCalledTimes(1);
  });

  it("saves payment terms and due date once when unpaid amount fits", async () => {
    mocks.customerFind.mockResolvedValue({ id: "customer-1", shopId: "shop-1", priceGroupId: null, priceGroup: null, creditLimitOverride: 5_000, paymentTermsDaysOverride: 15 });
    await request(app).post("/shop-1/orders").send({ ...twoPieces, initialPayment: { method: "Cash", amount: 500 } }).expect(201);
    const data = mocks.orderCreate.mock.calls[0]![0].data;
    expect(data.paymentTracking).toBe(true);
    expect(data.paymentTermsDaysSnapshot).toBe(15);
    expect(data.dueAt.getTime() - data.createdAt.getTime()).toBe(15 * 86_400_000);
  });
});
