import { describe, expect, it } from "vitest";
import { historicalReceiptPaymentSummary, orderPaidAmount, orderPaymentEntries } from "./order-payment-balance.js";

describe("canonical order payment balance", () => {
  it("preserves direct payment and refund behavior", () => {
    const direct = [{ id: "payment-1", amount: 100_000 }, { id: "refund-1", amount: -20_000, type: "refund", scope: "refund" }];
    expect(orderPaidAmount("order-1", direct, [])).toBe(80_000);
  });

  it("preserves allocated COD payment behavior", () => {
    const allocated = [{ id: "cod-1", amount: 100_000, type: "payment", scope: "cod-settlement", allocations: JSON.stringify([{ orderId: "order-1", amount: 40_000 }, { orderId: "order-2", amount: 60_000 }]) }];
    expect(orderPaymentEntries("order-1", [], allocated)).toEqual([expect.objectContaining({ id: "cod-1", amount: 40_000 })]);
    expect(orderPaidAmount("order-1", [], allocated)).toBe(40_000);
  });

  it("preserves allocated COD void behavior", () => {
    const allocated = [
      { id: "cod-1", amount: 40_000, type: "payment", scope: "cod-settlement", allocations: JSON.stringify([{ orderId: "order-1", amount: 40_000 }]) },
      { id: "void-1", amount: -40_000, type: "cod-settlement-void", scope: "cod-settlement-void", allocations: JSON.stringify([{ orderId: "order-1", amount: 40_000 }]) },
    ];
    expect(orderPaidAmount("order-1", [], allocated)).toBe(0);
  });

  it("keeps follow-up reversals out of the historical receipt settlement", () => {
    const direct = [{ id: "payment-1", amount: 90_000 }, { id: "refund-1", amount: -20_000, type: "refund", scope: "refund" }];
    expect(historicalReceiptPaymentSummary(90_000, "order-1", direct, [])).toMatchObject({ paid: 90_000, outstanding: 0, paymentStatus: "paid", entries: [{ id: "payment-1", amount: 90_000 }] });
  });
});
