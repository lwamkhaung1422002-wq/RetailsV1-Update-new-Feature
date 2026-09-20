import { describe, expect, it } from "vitest";
import { resolveCheckoutPayment } from "./checkoutPayment";

describe("checkout payment rules", () => {
  it.each([0, ""])("treats blank or %p cash received as exact cash payment", (cashAmount) => {
    expect(resolveCheckoutPayment({ paymentMethod: "cash", otherPayment: "unpaid", cashAmount, total: 10_000 })).toEqual({
      error: "", initialPaymentAmount: 10_000, change: 0,
    });
  });

  it("blocks positive cash below the total and calculates overpayment change", () => {
    expect(resolveCheckoutPayment({ paymentMethod: "cash", cashAmount: 5_000, total: 10_000 }).error).toMatch(/at least/);
    expect(resolveCheckoutPayment({ paymentMethod: "cash", cashAmount: 12_000, total: 10_000 })).toEqual({
      error: "", initialPaymentAmount: 10_000, change: 2_000,
    });
  });

  it("accepts partial only when it is above zero and below the total", () => {
    expect(resolveCheckoutPayment({ paymentMethod: "other", otherPayment: "partial", cashAmount: 4_000, total: 10_000 }).initialPaymentAmount).toBe(4_000);
    expect(resolveCheckoutPayment({ paymentMethod: "other", otherPayment: "partial", cashAmount: 0, total: 10_000 }).error).toMatch(/greater than zero/);
    expect(resolveCheckoutPayment({ paymentMethod: "other", otherPayment: "partial", cashAmount: 10_000, total: 10_000 }).error).toMatch(/less than/);
  });
});
