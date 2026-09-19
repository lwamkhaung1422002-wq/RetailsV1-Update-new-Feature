import { describe, expect, it } from "vitest";
import { currentSalePaymentState } from "./sale-payment-state.js";

describe("current sale payment state", () => {
  it("shows Unpaid with no current method after a full refund while preserving historical events", () => {
    const payments = [
      { id: "payment", amount: 50_000, method: "Cash", paidAt: "2026-09-01" },
      { id: "refund", amount: -50_000, method: "Cash", originalPaymentId: "payment", paidAt: "2026-09-02" },
    ];
    const state = currentSalePaymentState({ total: 50_000, subtotal: 50_000, discount: 0, fulfillmentStatus: "completed", items: [{ id: "item", quantity: 1, lineTotal: 50_000, returns: [] }], payments });
    expect(state).toMatchObject({ paid: 0, status: "Unpaid", currentMethod: "", remainingAmount: 50_000 });
    expect(payments).toHaveLength(2);
  });

  it("compares net payments with the payable total after a partial product return", () => {
    const state = currentSalePaymentState({
      total: 100_000, subtotal: 100_000, discount: 0, fulfillmentStatus: "completed",
      items: [{ id: "item", quantity: 2, lineTotal: 100_000, returns: [{ quantity: 1 }] }],
      payments: [{ id: "payment", amount: 100_000, method: "Cash" }, { id: "refund", amount: -50_000, method: "Cash", originalPaymentId: "payment" }],
    });
    expect(state).toMatchObject({ payableTotal: 50_000, paid: 50_000, remainingAmount: 0, status: "Paid", currentMethod: "Cash" });
  });
});
