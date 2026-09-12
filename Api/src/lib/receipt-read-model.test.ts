import { describe, expect, it } from "vitest";
import { historicalReceiptPaymentSummary } from "./order-payment-balance.js";
import { buildReceiptReadModel } from "./receipt-read-model.js";

const createdAt = new Date("2026-09-10T03:00:00.000Z");
const baseOrder = (): any => ({
  id: "order-1",
  orderNumber: "INV-00125",
  total: 90_000,
  subtotal: 100_000,
  discount: 10_000,
  deliveryFee: 0,
  paymentStatus: "partial",
  fulfillmentStatus: "completed",
  createdAt,
  completedAt: createdAt,
  shop: { id: "shop-1", name: "Hledan", address: "Yangon" },
  customer: { id: "customer-1", name: "Aye Aye" },
  items: [{ id: "item-1", productName: "Tea", variantName: null, quantity: 2, unitPrice: 50_000, regularUnitPrice: 60_000, lineTotal: 100_000, discount: 0, promotionDiscount: 20_000, manualDiscount: 0, pricingSnapshot: { promotionName: "Thingyan" }, returns: [] }],
  payments: [{ id: "payment-1", amount: 40_000, type: "payment", scope: "order-payment", method: "Cash", paidAt: createdAt }],
  sourceExchanges: [],
  replacementExchange: null,
});

const receiptFor = (order: any, actors = new Map<string, { id: string; name: string }>()) => buildReceiptReadModel(
  order,
  historicalReceiptPaymentSummary(order.total, order.id, order.payments, []),
  actors.has("cashier-1") ? "cashier-1" : null,
  actors,
);

describe("receipt read model", () => {
  it("uses persisted sale, pricing, shop, cashier, payment, and outstanding values", () => {
    const receipt = receiptFor(baseOrder(), new Map([["cashier-1", { id: "cashier-1", name: "Ko Aung" }]]));
    expect(receipt).toMatchObject({
      invoiceNumber: "INV-00125",
      transactionAt: createdAt,
      shop: { id: "shop-1", name: "Hledan" },
      cashier: { id: "cashier-1", name: "Ko Aung" },
      customer: { name: "Aye Aye" },
      items: [{ unitPrice: 50_000, regularUnitPrice: 60_000, lineTotal: 100_000, promotionDiscount: 20_000, pricingSnapshot: { promotionName: "Thingyan" } }],
      totals: { subtotal: 100_000, orderDiscount: 10_000, total: 90_000, paid: 40_000, outstanding: 50_000 },
      payments: [{ id: "payment-1", method: "Cash", amount: 40_000 }],
    });
  });

  it("exposes persisted return and refund references", () => {
    const order = baseOrder();
    order.payments[0].amount = 90_000;
    order.items[0]!.returns = [{ id: "return-1", quantity: 1, condition: "SELLABLE", reason: "Changed mind", createdAt }];
    order.payments.push({ id: "refund-1", amount: -20_000, type: "refund", scope: "refund", method: "Cash", paidAt: createdAt });
    const original = structuredClone(order);
    const receipt = receiptFor(order);
    expect(receipt.returns).toEqual([expect.objectContaining({ id: "return-1", itemName: "Tea", quantity: "1" })]);
    expect(receipt.refunds).toEqual([expect.objectContaining({ id: "refund-1", amount: -20_000 })]);
    expect(receipt.totals).toMatchObject({ total: 90_000, paid: 90_000, outstanding: 0 });
    expect(receipt.transactionAt).toBe(createdAt);
    expect(order).toEqual(original);
  });

  it("links the exchange and keeps the original invoice values unchanged", () => {
    const order = baseOrder();
    const originalSnapshot = structuredClone(order);
    const exchange = {
      id: "exchange-1", actorId: "cashier-1", reason: "Different item", createdAt,
      originalOrder: { id: order.id, orderNumber: order.orderNumber, total: order.total, items: order.items },
      replacementOrder: { id: "order-2", orderNumber: "INV-00126", total: 40_000, items: [{ id: "item-2", productName: "Coffee", quantity: 1, unitPrice: 40_000, lineTotal: 40_000 }] },
      returns: [{ id: "return-1", orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Different item" }],
      payments: [
        { id: "return-payment", amount: -30_000, type: "refund", scope: "exchange-return", method: "Cash", paidAt: createdAt },
        { id: "credit", amount: 30_000, type: "payment", scope: "exchange-credit", method: "Exchange Credit", paidAt: createdAt },
        { id: "difference", amount: 10_000, type: "payment", scope: "exchange-difference", method: "Cash", paidAt: createdAt },
      ],
    };
    order.sourceExchanges = [exchange];
    order.payments.push(exchange.payments[0]!);

    const receipt = receiptFor(order, new Map([["cashier-1", { id: "cashier-1", name: "Ko Aung" }]]));

    expect(receipt.totals).toEqual({ subtotal: 100_000, orderDiscount: 10_000, deliveryFee: 0, total: 90_000, paid: 40_000, outstanding: 50_000 });
    expect(receipt.exchanges[0]).toMatchObject({ id: "exchange-1", originalInvoice: { invoiceNumber: "INV-00125" }, replacementInvoice: { invoiceNumber: "INV-00126" }, returnedValue: 30_000, replacementValue: 40_000, difference: 10_000, differenceType: "customer-payment", differenceMethod: "Cash", differencePaymentReference: "difference" });
    expect({ ...order, sourceExchanges: [], payments: order.payments.slice(0, 1) }).toEqual(originalSnapshot);
  });

  it.each([
    [40_000, 30_000, -10_000, "refund"],
    [30_000, 30_000, 0, "even"],
  ])("uses canonical Package G difference for returned %i and replacement %i", (returnedValue, replacementValue, difference, differenceType) => {
    const order = baseOrder();
    const exchange = {
      id: "exchange-1", actorId: "cashier-1", reason: "Different item", createdAt,
      originalOrder: { id: order.id, orderNumber: order.orderNumber, total: order.total, items: order.items },
      replacementOrder: { id: "order-2", orderNumber: "INV-00126", total: replacementValue, items: [{ id: "item-2", productName: "Coffee", quantity: 1, unitPrice: replacementValue, lineTotal: replacementValue }] },
      returns: [{ id: "return-1", orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Different item" }],
      payments: [
        { id: "return-payment", amount: -returnedValue, type: "refund", scope: "exchange-return", method: "Cash", paidAt: createdAt },
        { id: "credit", amount: Math.min(returnedValue, replacementValue), type: "payment", scope: "exchange-credit", method: "Exchange Credit", paidAt: createdAt },
      ],
    };
    order.sourceExchanges = [exchange];
    order.payments.push(exchange.payments[0]);

    const receipt = receiptFor(order);

    expect(receipt.exchanges[0]).toMatchObject({ returnedValue, replacementValue, difference, differenceType });
    expect(receipt.totals).toMatchObject({ paid: 40_000, outstanding: 50_000 });
  });

  it("keeps Exchange Credit separate from actual additional customer cash on the replacement invoice", () => {
    const order = baseOrder();
    order.id = "order-2";
    order.orderNumber = "INV-00126";
    order.total = 40_000;
    order.subtotal = 40_000;
    order.discount = 0;
    order.items = [{ id: "item-2", productName: "Coffee", quantity: 1, unitPrice: 40_000, lineTotal: 40_000, returns: [] }];
    order.payments = [
      { id: "credit", amount: 30_000, type: "payment", scope: "exchange-credit", method: "Exchange Credit", paidAt: createdAt },
      { id: "difference", amount: 10_000, type: "payment", scope: "exchange-difference", method: "Cash", paidAt: createdAt },
    ];
    order.replacementExchange = {
      id: "exchange-1", actorId: "cashier-1", reason: "Different item", createdAt,
      originalOrder: { id: "order-1", orderNumber: "INV-00125", total: 30_000, items: [{ id: "item-1", productName: "Tea", quantity: 1, unitPrice: 30_000, lineTotal: 30_000 }] },
      replacementOrder: { id: order.id, orderNumber: order.orderNumber, total: order.total, items: order.items },
      returns: [{ id: "return-1", orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Different item" }],
      payments: [
        { id: "return-payment", amount: -30_000, type: "refund", scope: "exchange-return", method: "Cash", paidAt: createdAt },
        ...order.payments,
      ],
    };

    const receipt = receiptFor(order);

    expect(receipt.totals).toMatchObject({ total: 40_000, paid: 40_000, outstanding: 0 });
    expect(receipt.payments).toEqual([
      expect.objectContaining({ id: "credit", method: "Exchange Credit", amount: 30_000, scope: "exchange-credit" }),
      expect.objectContaining({ id: "difference", method: "Cash", amount: 10_000, scope: "exchange-difference" }),
    ]);
  });

  it("supports historical receipts without optional references or attribution", () => {
    const order = baseOrder();
    order.customer = null;
    const receipt = receiptFor(order);
    expect(receipt).toMatchObject({ cashier: null, customer: null, returns: [], refunds: [], exchanges: [] });
  });
});
