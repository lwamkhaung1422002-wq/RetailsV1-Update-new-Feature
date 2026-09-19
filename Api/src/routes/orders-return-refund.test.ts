import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), consume: vi.fn(), audit: vi.fn(), movement: vi.fn(),
  orderFindFirst: vi.fn(), orderFindUnique: vi.fn(), orderUpdate: vi.fn(),
  returnsFind: vi.fn(), returnCreate: vi.fn(), batchFind: vi.fn(), batchUpdate: vi.fn(), paymentCreate: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  $transaction: (run: (tx: unknown) => unknown) => run({
    order: { findFirst: mocks.orderFindFirst, findUniqueOrThrow: mocks.orderFindUnique, update: mocks.orderUpdate },
    customerReturn: { findMany: mocks.returnsFind, create: mocks.returnCreate },
    inventoryBatch: { findUnique: mocks.batchFind, update: mocks.batchUpdate },
    inventorySerial: { updateMany: vi.fn() }, inventoryLocation: { upsert: vi.fn() },
    payment: { create: mocks.paymentCreate },
  }),
} }));
vi.mock("../lib/manager-approval.js", () => ({
  approvalAccessToken: () => "approval", approvalAuditMetadata: () => ({}), approvalPayloadFingerprint: () => "hash",
  authorizeSensitiveAction: mocks.authorize, consumeManagerApproval: mocks.consume,
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/inventory-domain.js", () => ({ recordInventoryMovement: mocks.movement, setInventoryReservation: vi.fn() }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn(), assertShopAccess: vi.fn(), hasShopPermission: vi.fn() }));
vi.mock("../lib/store-capabilities.js", () => ({ assertCapability: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "owner-1" }) }));

import { ordersRouter } from "./orders.routes.js";

const app = express();
app.use(express.json());
app.use((request, _response, next) => { (request as unknown as { log: { info: () => void } }).log = { info: vi.fn() }; next(); });
app.use(ordersRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

const order = (alreadyReturned = 0) => ({
  id: "order-1", shopId: "shop-1", fulfillmentStatus: "completed", total: 100_000, subtotal: 100_000, discount: 0, deliveryFee: 0,
  items: [{ id: "item-1", productId: "product-1", variantId: null, productName: "Coffee", quantity: 2, baseQuantity: null, lineTotal: 100_000, unitCost: 20_000, product: { trackingMode: "NONE" }, allocations: [{ inventoryBatchId: "batch-1", quantity: 2, baseQuantity: null }], returns: alreadyReturned ? [{ quantity: alreadyReturned }] : [], serialAllocations: [] }],
  payments: [{ id: "payment-1", amount: 100_000, method: "Cash", originalPaymentId: null, paidAt: new Date("2026-09-01") }],
});

describe("atomic product return/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ actorRole: "OWNER", authorizationMode: "direct" });
    mocks.orderFindFirst.mockImplementation(async () => order());
    mocks.orderFindUnique.mockResolvedValue(order(1));
    mocks.orderUpdate.mockResolvedValue({ id: "order-1" });
    mocks.returnsFind.mockResolvedValue([]);
    mocks.returnCreate.mockResolvedValue({ id: "return-1", orderItemId: "item-1", quantity: 1 });
    mocks.batchFind.mockResolvedValue({ id: "batch-1", reservedQuantity: 2 });
    mocks.batchUpdate.mockResolvedValue({});
    mocks.paymentCreate.mockImplementation(async ({ data }) => ({ id: "refund-1", ...data }));
  });

  it("returns stock and refunds the original payment method in the same transaction", async () => {
    const result = await request(app).post("/shop-1/orders/order-1/product-returns").set("Idempotency-Key", "return-key").send({ items: [{ orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Customer return" }] });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body).toMatchObject({ returnedValue: 50_000, refundedAmount: 50_000 });
    expect(mocks.movement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "CUSTOMER_RETURN", direction: "IN", quantity: "1", sourceType: "CustomerReturn", sourceId: "return-1" }));
    expect(mocks.paymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ method: "Cash", amount: -50_000, originalPaymentId: "payment-1", scope: "product-return" }) });
    expect(mocks.consume).toHaveBeenCalled();
  });

  it("rejects a cumulative return above the immutable sold quantity", async () => {
    mocks.orderFindFirst.mockImplementation(async () => order(1.5));
    await request(app).post("/shop-1/orders/order-1/product-returns").set("Idempotency-Key", "over-key").send({ items: [{ orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Too many" }] }).expect(400);
    expect(mocks.returnCreate).not.toHaveBeenCalled();
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });
});
