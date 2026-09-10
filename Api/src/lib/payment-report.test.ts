import { describe, expect, it } from "vitest";
import { paymentReportMetrics } from "./payment-report.js";

describe("payment report totals", () => {
  it("calculates collected, refund, and net collected with canonical refund normalization", () => {
    expect(paymentReportMetrics([
      { type: "payment", scope: "order-payment", method: "Cash", amount: 100_000 },
      { type: "refund", scope: "financial-refund", method: "Cash", amount: -20_000 },
    ])).toEqual({ collected: 100_000, refunds: 20_000, netCollected: 80_000 });
  });

  it("does not count a refund as a positive collection", () => {
    expect(paymentReportMetrics([{ type: "refund", scope: "financial-refund", method: "Cash", amount: -20_000 }])).toEqual({ collected: 0, refunds: 20_000, netCollected: -20_000 });
  });
});
