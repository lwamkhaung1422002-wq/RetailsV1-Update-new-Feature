import { describe, expect, it } from "vitest";
import { salePaymentDisplay, sumActiveSaleAmounts } from "./salePaymentDisplay";

describe("sale payment display", () => {
  it("keeps payment state separate from the actual paid method", () => {
    expect(salePaymentDisplay([], 10_000)).toMatchObject({ status: "Unpaid", label: "Unpaid" });
    expect(salePaymentDisplay([{ amount: 4_000, method: "Cash" }], 10_000)).toMatchObject({ status: "Partial", label: "Partial" });
    expect(salePaymentDisplay([{ amount: 10_000, method: "KPay" }], 10_000)).toMatchObject({ status: "Paid", label: "KPay" });
  });

  it("uses the effective total and net refunds", () => {
    expect(salePaymentDisplay([
      { amount: 10_000, method: "Cash" },
      { amount: -3_000, method: "Cash" },
    ], 7_000)).toMatchObject({ status: "Paid", label: "Cash", paidAmount: 7_000, remainingAmount: 0 });
  });

  it("sums effective active-sale amounts and excludes cancelled rows", () => {
    expect(sumActiveSaleAmounts([
      { amount: 70_000, status: "Done" },
      { amount: 20_000, status: "Done" },
      { amount: 90_000, status: "Cancel" },
    ])).toBe(90_000);
  });
});
