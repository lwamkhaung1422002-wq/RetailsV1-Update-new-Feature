import { describe, expect, it } from "vitest";
import { paymentReportCashMovements, paymentReportMetrics } from "./payment-report.js";

const payment = (input: Partial<{ id: string; exchangeId: string | null; type: string; scope: string; method: string; amount: number }> = {}) => ({
  id: input.id ?? "payment-1",
  exchangeId: input.exchangeId ?? null,
  type: input.type ?? "payment",
  scope: input.scope ?? "order-payment",
  method: input.method ?? "Cash",
  amount: input.amount ?? 100_000,
});

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

  it("leaves ordinary payments and refunds unchanged", () => {
    const payments = [payment(), payment({ id: "refund-1", type: "refund", scope: "financial-refund", amount: -20_000 })];
    expect(paymentReportCashMovements(payments)).toEqual(payments);
    expect(paymentReportMetrics(paymentReportCashMovements(payments))).toEqual({ collected: 100_000, refunds: 20_000, netCollected: 80_000 });
  });

  it.each([
    {
      name: "more expensive replacement",
      payments: [
        payment({ id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", amount: -30_000 }),
        payment({ id: "credit", exchangeId: "exchange-1", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 }),
        payment({ id: "difference", exchangeId: "exchange-1", scope: "exchange-difference", amount: 10_000 }),
      ],
      expected: { collected: 10_000, refunds: 0, netCollected: 10_000 },
      sourceId: "difference",
      amount: 10_000,
    },
    {
      name: "cheaper replacement",
      payments: [
        payment({ id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", amount: -40_000 }),
        payment({ id: "credit", exchangeId: "exchange-1", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 }),
      ],
      expected: { collected: 0, refunds: 10_000, netCollected: -10_000 },
      sourceId: "return",
      amount: -10_000,
    },
    {
      name: "equal-value replacement",
      payments: [
        payment({ id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", amount: -30_000 }),
        payment({ id: "credit", exchangeId: "exchange-1", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 }),
      ],
      expected: { collected: 0, refunds: 0, netCollected: 0 },
      sourceId: null,
      amount: 0,
    },
  ])("reports only cash movement for $name", ({ payments, expected, sourceId, amount }) => {
    const movements = paymentReportCashMovements(payments);
    expect(paymentReportMetrics(movements)).toEqual(expected);
    expect(movements).toHaveLength(sourceId ? 1 : 0);
    if (sourceId) expect(movements[0]).toMatchObject({ id: sourceId, method: "Cash", amount });
    expect(movements.some((entry) => entry.method === "Exchange Credit")).toBe(false);
  });
});
