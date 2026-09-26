import { describe, expect, it, vi } from "vitest";

import { creditDueAt, effectiveCustomerCredit, loadCustomerCredit } from "./customer-credit.js";

const date = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`);

function order(id: string, total: number, dueAt: Date | null, payments: Array<{ id: string; amount: number; paidAt: Date }> = [], paymentTracking = true) {
  return {
    id, orderNumber: id, shopId: "shop-1", customerId: "customer-1", total, subtotal: total, discount: 0, deliveryFee: 0,
    createdAt: date(1), dueAt, paymentTracking, cancelledAt: null,
    items: [{ id: `item-${id}`, quantity: 1, baseQuantity: null, lineTotal: total, returns: [] }],
    payments,
  };
}

function db(orders: unknown[], allocations: unknown[] = []) {
  return { order: { findMany: vi.fn().mockResolvedValue(orders) }, payment: { findMany: vi.fn().mockResolvedValue(allocations) } } as never;
}

describe("customer credit", () => {
  it("resolves shop defaults, explicit zero overrides, and immutable due dates", () => {
    expect(effectiveCustomerCredit({}, { defaultCreditLimit: 500_000, defaultPaymentTermsDays: 30 })).toEqual({ effectiveCreditLimit: 500_000, effectivePaymentTermsDays: 30 });
    expect(effectiveCustomerCredit({ creditLimitOverride: 0, paymentTermsDaysOverride: 0 }, { defaultCreditLimit: 500_000, defaultPaymentTermsDays: 30 })).toEqual({ effectiveCreditLimit: 0, effectivePaymentTermsDays: 0 });
    expect(creditDueAt(date(1), 30).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("counts active unpaid exposure, classifies invoices once, and excludes cash and legacy terms from behavior", async () => {
    const orders = [
      order("overdue", 400_000, date(10), [{ id: "p1", amount: 100_000, paidAt: date(5) }]),
      order("late", 100_000, date(10), [{ id: "p2", amount: 30_000, paidAt: date(9) }, { id: "p3", amount: 70_000, paidAt: date(15) }]),
      order("on-time", 100_000, date(10), [{ id: "p4", amount: 100_000, paidAt: date(10) }]),
      order("cash", 100_000, null, [{ id: "p5", amount: 100_000, paidAt: date(1) }], false),
      order("legacy", 50_000, null),
    ];
    const result = await loadCustomerCredit(db(orders), "shop-1", "customer-1", 500_000, date(15));
    expect(result).toMatchObject({ effectiveCreditLimit: 500_000, outstanding: 350_000, availableCredit: 150_000, overdueAmount: 300_000, creditInvoices: 3, paidOnTime: 1, paidLate: 1, currentlyOverdue: 1, averageDaysLate: 5, longestDelay: 5 });
    expect(result.recentInvoices.map((invoice) => invoice.status)).toEqual(["OVERDUE", "LATE", "ON_TIME", "LEGACY"]);
    expect(result.lastPayment).toEqual(date(15));
  });

  it("uses signed COD allocations and a later void to restore outstanding", async () => {
    const allocations = [
      { id: "cod", amount: 100_000, scope: "cod-settlement", allocations: JSON.stringify([{ orderId: "cod-order", amount: 100_000 }]), paidAt: date(9) },
      { id: "void", amount: -100_000, scope: "cod-settlement-void", allocations: JSON.stringify([{ orderId: "cod-order", amount: 100_000 }]), paidAt: date(12) },
    ];
    const result = await loadCustomerCredit(db([order("cod-order", 100_000, date(10))], allocations), "shop-1", "customer-1", 200_000, date(15));
    expect(result.outstanding).toBe(100_000);
    expect(result.recentInvoices[0]).toMatchObject({ status: "OVERDUE", finalPaidAt: null, daysLate: 5 });
  });

  it("reduces receivables for returns without double-counting refunds", async () => {
    const returned = order("return", 100_000, date(10), [{ id: "payment", amount: 20_000, paidAt: date(5) }]);
    returned.items[0]!.quantity = 2;
    returned.items[0]!.returns = [{ quantity: 1, createdAt: date(12) }] as never;
    const result = await loadCustomerCredit(db([returned]), "shop-1", "customer-1", 100_000, date(15));
    expect(result.outstanding).toBe(30_000);
    expect(result.overdueAmount).toBe(30_000);
  });
});
