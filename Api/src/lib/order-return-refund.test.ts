import { describe, expect, it } from "vitest";
import { allocateRefund, effectiveOrderTotal, remainingCancellationSlices, remainingRefundablePayments } from "./order-return-refund.js";

describe("return/refund accounting", () => {
  it("reduces the payable total by cumulative historical return value", () => {
    expect(effectiveOrderTotal({
      total: 90_000, subtotal: 100_000, discount: 10_000,
      items: [{ id: "line-1", quantity: 2, lineTotal: 100_000, returns: [{ quantity: 1 }] }],
    })).toBe(45_000);
  });

  it("supports repeated partial refunds without exceeding the original payment", () => {
    const payments = [
      { id: "pay-1", amount: 100_000, method: "Cash", paidAt: "2026-01-01" },
      { id: "refund-1", amount: -30_000, method: "Cash", originalPaymentId: "pay-1", paidAt: "2026-01-02" },
    ];
    expect(remainingRefundablePayments(payments)[0]?.refundableAmount).toBe(70_000);
    expect(allocateRefund(payments, 50_000)).toEqual({
      allocations: [{ originalPaymentId: "pay-1", method: "Cash", amount: 50_000 }],
      unallocatedAmount: 0,
    });
    expect(allocateRefund(payments, 80_000).unallocatedAmount).toBe(10_000);
  });

  it("allocates deterministically across original payment methods", () => {
    const result = allocateRefund([
      { id: "pay-2", amount: 40_000, method: "KPay", paidAt: "2026-01-02" },
      { id: "pay-1", amount: 30_000, method: "Cash", paidAt: "2026-01-01" },
    ], 50_000);
    expect(result.allocations).toEqual([
      { originalPaymentId: "pay-1", method: "Cash", amount: 30_000 },
      { originalPaymentId: "pay-2", method: "KPay", amount: 20_000 },
    ]);
  });

  it("cancels only sold quantity that has not already been returned", () => {
    const slices = remainingCancellationSlices(
      [{ id: "first", quantity: 6 }, { id: "second", quantity: 4 }],
      (slice) => slice.quantity,
      3,
    );
    expect(slices).toEqual([
      { slice: { id: "first", quantity: 6 }, quantity: 3 },
      { slice: { id: "second", quantity: 4 }, quantity: 4 },
    ]);
    expect(slices.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(7);
  });
});
