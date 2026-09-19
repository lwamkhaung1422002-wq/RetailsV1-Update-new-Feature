import { describe, expect, it } from "vitest";
import { refundableSalePayments } from "./refundablePayments";

describe("refundableSalePayments", () => {
  it("keeps the remaining amount after repeated partial refunds", () => {
    expect(refundableSalePayments([
      { id: "payment", amount: 100, method: "Cash" },
      { id: "refund-1", amount: -25, originalPaymentId: "payment", method: "Cash" },
      { id: "refund-2", amount: -15, originalPaymentId: "payment", method: "Cash" },
    ])).toEqual([expect.objectContaining({ id: "payment", refundableAmount: 60 })]);
  });

  it("removes fully refunded payments and keeps refundable COD payments", () => {
    expect(refundableSalePayments([
      { id: "payment", amount: 100, method: "Cash" },
      { id: "refund", amount: -100, originalPaymentId: "payment", method: "Cash" },
      { id: "cod", amount: 100, method: "COD" },
    ])).toEqual([expect.objectContaining({ id: "cod", refundableAmount: 100 })]);
  });
});
