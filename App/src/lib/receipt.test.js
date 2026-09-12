import { describe, expect, it } from "vitest";
import { buildExchangeReceiptHtml, buildInvoiceReceiptHtml } from "./receipt";

const receipt = () => ({
  invoiceNumber: "INV-00125",
  transactionAt: "2026-09-10T03:00:00.000Z",
  shop: { id: "shop-1", name: "Hledan", address: "Yangon" },
  cashier: { id: "cashier-1", name: "Ko Aung" },
  customer: { id: "customer-1", name: "Aye Aye" },
  paymentStatus: "partial",
  items: [{ id: "item-1", name: "Tea", variantName: null, quantity: 2, unitPrice: 50_000, lineTotal: 100_000, itemDiscount: 0, promotionDiscount: 20_000, manualDiscount: 0, pricingSnapshot: { promotionName: "Thingyan" } }],
  totals: { subtotal: 100_000, orderDiscount: 10_000, deliveryFee: 0, total: 90_000, paid: 40_000, outstanding: 50_000 },
  payments: [{ id: "payment-1", method: "Cash", amount: 40_000 }],
  returns: [{ id: "return-1", itemName: "Tea", quantity: "1" }],
  refunds: [{ id: "refund-1", method: "Cash", amount: -10_000 }],
  exchanges: [],
});

describe("receipt presentation", () => {
  it("renders persisted sale, promotion, payment, outstanding, branch, cashier, and references", () => {
    const html = buildInvoiceReceiptHtml(receipt());
    for (const value of ["INV-00125", "Hledan", "Ko Aung", "Aye Aye", "Thingyan", "100,000 MMK", "90,000 MMK", "40,000 MMK", "50,000 MMK", "return-1", "refund-1", "REPRINT"]) {
      expect(html).toContain(value);
    }
  });

  it("uses the original timestamp on reprint and does not mutate receipt truth", () => {
    const input = receipt();
    const before = structuredClone(input);
    const html = buildInvoiceReceiptHtml(input, { reprint: true });
    expect(html).toContain(new Date(input.transactionAt).toLocaleString());
    expect(input).toEqual(before);
  });

  it.each([
    [10_000, "customer-payment", "Customer paid 10,000 MMK"],
    [-10_000, "refund", "Refund 10,000 MMK"],
    [0, "even", "No additional payment or refund"],
  ])("renders canonical exchange difference %s", (difference, differenceType, expected) => {
    const input = receipt();
    const exchange = { id: "exchange-1", reason: "Different item", createdAt: input.transactionAt, cashier: input.cashier, originalInvoice: { invoiceNumber: "INV-00125" }, replacementInvoice: { invoiceNumber: "INV-00126" }, returnedItems: [{ reference: "return-1", name: "Tea", variantName: null, quantity: "1", condition: "SELLABLE" }], replacementItems: [{ name: "Coffee", variantName: null, quantity: 1, unitPrice: 40_000, lineTotal: 40_000 }], returnedValue: 30_000, replacementValue: 30_000 + difference, difference, differenceType, differenceMethod: difference ? "Cash" : null, differencePaymentReference: difference ? "payment-1" : null };
    const html = buildExchangeReceiptHtml(input, exchange);
    expect(html).toContain("EXCHANGE");
    expect(html).toContain("INV-00125");
    expect(html).toContain("INV-00126");
    expect(html).toContain("return-1");
    expect(html).toContain(expected);
  });
});
