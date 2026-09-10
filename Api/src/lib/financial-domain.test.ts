import { describe, expect, it } from "vitest";

import {
  calculateFinancialMetrics,
  costOfGoodsSold,
  normalizedRefundAmount,
} from "./financial-domain.js";

describe("financial domain", () => {
  it("calculates normal recognized-sale profit", () => {
    expect(calculateFinancialMetrics({
      recognizedOrders: [{ total: 100_000, items: [{ unitCost: 60_000, quantity: 1 }] }],
      payments: [],
      expenses: [{ amount: 10_000 }],
    })).toMatchObject({
      recognizedSalesBeforeRefunds: 100_000,
      netRevenue: 100_000,
      costOfGoods: 60_000,
      grossProfit: 40_000,
      netProfit: 30_000,
    });
  });

  it("uses persisted order totals without discounting them again", () => {
    const metrics = calculateFinancialMetrics({
      recognizedOrders: [{ total: 80_000, items: [{ unitCost: 50_000, quantity: 1 }] }],
      payments: [],
      expenses: [],
    });

    expect(metrics.netRevenue).toBe(80_000);
    expect(metrics.grossProfit).toBe(30_000);
  });

  it("does not let payment status change recognized revenue or profit", () => {
    const input = {
      recognizedOrders: [{ total: 100_000, items: [{ unitCost: 60_000, quantity: 1 }] }],
      expenses: [],
    };

    expect(calculateFinancialMetrics({ ...input, payments: [{ amount: 40_000, type: "payment" }] }).netProfit).toBe(40_000);
    expect(calculateFinancialMetrics({ ...input, payments: [] }).netProfit).toBe(40_000);
  });

  it("subtracts negative financial refunds exactly once", () => {
    const metrics = calculateFinancialMetrics({
      recognizedOrders: [{ total: 100_000, items: [{ unitCost: 60_000, quantity: 1 }] }],
      payments: [{ amount: -20_000, scope: "refund" }],
      expenses: [],
    });

    expect(normalizedRefundAmount({ amount: -20_000, scope: "refund" })).toBe(20_000);
    expect(metrics).toMatchObject({ refunds: 20_000, netRevenue: 80_000, grossProfit: 20_000 });
  });

  it("uses the exact stored base quantity for COGS", () => {
    expect(costOfGoodsSold([{ total: 0, items: [{ unitCost: 10_000, quantity: 1, baseQuantity: "0.25" }] }])).toBe(2_500);
  });

  it("falls back to legacy quantity when base quantity is absent", () => {
    expect(costOfGoodsSold([{ total: 0, items: [{ unitCost: 10_000, quantity: 3 }] }])).toBe(30_000);
  });

  it("excludes cancelled and income-category expense records", () => {
    const metrics = calculateFinancialMetrics({
      recognizedOrders: [],
      payments: [],
      expenses: [
        { amount: 10_000, cancelledAt: new Date() },
        { amount: 20_000, category: "income" },
        { amount: 30_000, category: "Rent" },
      ],
    });

    expect(metrics).toMatchObject({ operatingExpenses: 30_000, netProfit: -30_000 });
  });

  it("aggregates multiple orders, refunds, and expenses deterministically", () => {
    expect(calculateFinancialMetrics({
      recognizedOrders: [
        { total: 100_000, items: [{ unitCost: 40_000, quantity: 1 }] },
        { total: 50_000, items: [{ unitCost: 20_000, quantity: 1 }] },
      ],
      payments: [{ amount: -15_000, type: "refund" }],
      expenses: [{ amount: 10_000 }, { amount: 5_000, category: "Utilities" }],
    })).toMatchObject({
      recognizedSalesBeforeRefunds: 150_000,
      refunds: 15_000,
      netRevenue: 135_000,
      costOfGoods: 60_000,
      grossProfit: 75_000,
      operatingExpenses: 15_000,
      netProfit: 60_000,
    });
  });

  it("returns zero financial metrics when no records exist", () => {
    expect(calculateFinancialMetrics({ recognizedOrders: [], payments: [], expenses: [] })).toEqual({
      recognizedSalesBeforeRefunds: 0,
      refunds: 0,
      netRevenue: 0,
      costOfGoods: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      netProfit: 0,
    });
  });
});
