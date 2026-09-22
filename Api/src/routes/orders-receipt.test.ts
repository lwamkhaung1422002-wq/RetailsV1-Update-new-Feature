import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFind: vi.fn(),
  orderFindMany: vi.fn(),
  orderCount: vi.fn(),
  transaction: vi.fn(),
  allocatedPayments: vi.fn(),
  auditFind: vi.fn(),
  usersFind: vi.fn(),
  orderCreate: vi.fn(),
  paymentCreate: vi.fn(),
  movementCreate: vi.fn(),
  returnCreate: vi.fn(),
  exchangeCreate: vi.fn(),
  auditWrite: vi.fn(),
  access: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  $transaction: mocks.transaction,
  order: { findFirst: mocks.orderFind, findMany: mocks.orderFindMany, count: mocks.orderCount, create: mocks.orderCreate },
  payment: { findMany: mocks.allocatedPayments, create: mocks.paymentCreate },
  auditLog: { findFirst: mocks.auditFind },
  user: { findMany: mocks.usersFind },
  inventoryMovement: { create: mocks.movementCreate },
  customerReturn: { create: mocks.returnCreate },
  saleExchange: { create: mocks.exchangeCreate },
} }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.auditWrite }));
vi.mock("../lib/shop-access.js", () => ({
  assertUserOwnsShop: mocks.access,
  assertShopAccess: vi.fn(),
  hasShopPermission: vi.fn(),
}));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { ordersRouter } from "./orders.routes.js";

const app = express();
app.use(express.json());
app.use(ordersRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("order receipt read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFind.mockResolvedValue({ actorId: "cashier-1" });
    mocks.usersFind.mockResolvedValue([{ id: "cashier-1", name: "Ko Aung" }]);
    mocks.allocatedPayments.mockResolvedValue([]);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.orderFind.mockResolvedValue({
      id: "order-1",
      shopId: "shop-1",
      orderNumber: "INV-00125",
      subtotal: 100_000,
      discount: 10_000,
      deliveryFee: 5_000,
      total: 95_000,
      paymentStatus: "partial",
      fulfillmentStatus: "completed",
      createdAt: new Date("2026-09-10T03:00:00.000Z"),
      completedAt: new Date("2026-09-10T03:05:00.000Z"),
      shop: { id: "shop-1", name: "Hledan", address: "Yangon" },
      customer: { id: "customer-1", name: "Aye Aye" },
      items: [{ id: "item-1", productName: "Tea", variantName: null, quantity: 2, unitPrice: 50_000, lineTotal: 100_000, regularUnitPrice: 60_000, promotionDiscount: 20_000, manualDiscount: 0, discount: 0, pricingSnapshot: { promotionName: "Thingyan" }, returns: [] }],
      payments: [{ id: "payment-1", amount: 40_000, type: "payment", scope: "order-payment", method: "Cash", originalPaymentId: null, reason: null, note: null, paidAt: new Date("2026-09-10T03:00:00.000Z") }],
      sourceExchanges: [],
      replacementExchange: null,
    });
  });

  it("returns persisted receipt truth and performs no transaction mutation", async () => {
    const result = await request(app).get("/shop-1/orders/order-1").expect(200);

    expect(mocks.access).toHaveBeenCalledWith("user-1", "shop-1");
    expect(result.body.receipt).toMatchObject({
      invoiceNumber: "INV-00125",
      transactionAt: "2026-09-10T03:00:00.000Z",
      shop: { id: "shop-1", name: "Hledan" },
      cashier: { id: "cashier-1", name: "Ko Aung" },
      items: [{ unitPrice: 50_000, lineTotal: 100_000, promotionDiscount: 20_000 }],
      totals: { subtotal: 100_000, orderDiscount: 10_000, deliveryFee: 5_000, total: 95_000, paid: 40_000, outstanding: 55_000 },
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
    expect(mocks.movementCreate).not.toHaveBeenCalled();
    expect(mocks.returnCreate).not.toHaveBeenCalled();
    expect(mocks.exchangeCreate).not.toHaveBeenCalled();
    expect(mocks.auditWrite).not.toHaveBeenCalled();
  });

  it("includes minimal customer identity and delivery fee in the sale summary", async () => {
    mocks.orderFindMany.mockResolvedValue([{ id: "order-1", subtotal: 0, discount: 0, total: 5_000, items: [], payments: [], customer: { id: "customer-1", name: "Aye Aye" }, deliveryFee: 5_000 }]);
    mocks.orderCount.mockResolvedValue(1);

    const result = await request(app).get("/shop-1/orders?view=summary&pageSize=100");

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.orders[0]).toMatchObject({ customer: { id: "customer-1", name: "Aye Aye" }, deliveryFee: 5_000 });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ deliveryFee: true, customer: { select: { id: true, name: true } } }) }));
  });
});
