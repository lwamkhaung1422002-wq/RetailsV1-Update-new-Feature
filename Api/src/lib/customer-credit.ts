import type { Prisma } from "../generated/prisma/client.js";

import { orderPaymentEntries } from "./order-payment-balance.js";
import { effectiveOrderTotal } from "./order-return-refund.js";

type CreditDb = Pick<Prisma.TransactionClient, "order" | "payment">;

export function effectiveCustomerCredit(
  customer: { creditLimitOverride?: number | null; paymentTermsDaysOverride?: number | null },
  settings: { defaultCreditLimit?: number; defaultPaymentTermsDays?: number } | null,
) {
  return {
    effectiveCreditLimit: customer.creditLimitOverride ?? settings?.defaultCreditLimit ?? 0,
    effectivePaymentTermsDays: customer.paymentTermsDaysOverride ?? settings?.defaultPaymentTermsDays ?? 30,
  };
}

export function creditDueAt(createdAt: Date, termsDays: number) {
  return new Date(createdAt.getTime() + termsDays * 86_400_000);
}

function delayDays(from: Date, to: Date) {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
}

export async function loadCustomerCredit(db: CreditDb, shopId: string, customerId: string, limit: number, now = new Date()) {
  const orders = await db.order.findMany({
    where: { shopId, customerId, cancelledAt: null, fulfillmentStatus: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { returns: true } },
      payments: true,
    },
  });
  const allocatedPayments = orders.length ? await db.payment.findMany({
    where: { shopId, orderIds: { not: null }, OR: orders.map((order) => ({ orderIds: { contains: order.id } })) },
  }) : [];

  const invoices = orders.map((order) => {
    const effectiveAmount = effectiveOrderTotal(order);
    const entries = orderPaymentEntries(order.id, order.payments, allocatedPayments)
      .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime() || a.id.localeCompare(b.id));
    const paid = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const outstanding = Math.max(0, effectiveAmount - paid);
    const lastReturnAt = order.items.flatMap((item) => item.returns.map((entry) => entry.createdAt))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    let runningPaid = 0;
    let finalPaidAt: Date | null = null;
    for (const entry of entries) {
      const wasSettled = runningPaid >= effectiveAmount;
      runningPaid += entry.amount;
      if (!wasSettled && runningPaid >= effectiveAmount) finalPaidAt = entry.paidAt;
      else if (wasSettled && runningPaid < effectiveAmount) finalPaidAt = null;
    }
    if (outstanding === 0 && lastReturnAt && (!finalPaidAt || lastReturnAt > finalPaidAt)) finalPaidAt = lastReturnAt;
    if (outstanding > 0) finalPaidAt = null;

    let status: "OPEN" | "OVERDUE" | "ON_TIME" | "LATE" | "LEGACY" = "LEGACY";
    let daysLate = 0;
    if (order.paymentTracking && order.dueAt) {
      if (outstanding > 0) {
        status = now > order.dueAt ? "OVERDUE" : "OPEN";
        if (status === "OVERDUE") daysLate = delayDays(order.dueAt, now);
      } else {
        status = finalPaidAt && finalPaidAt > order.dueAt ? "LATE" : "ON_TIME";
        if (status === "LATE") daysLate = delayDays(order.dueAt, finalPaidAt!);
      }
    }
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      effectiveAmount,
      outstanding,
      dueAt: order.dueAt,
      finalPaidAt,
      status,
      daysLate,
      paymentTracking: order.paymentTracking,
      lastPaymentAt: entries.filter((entry) => entry.amount > 0).at(-1)?.paidAt ?? null,
    };
  });
  const tracked = invoices.filter((invoice) => invoice.paymentTracking && invoice.dueAt);
  const late = tracked.filter((invoice) => invoice.status === "LATE");
  const overdue = tracked.filter((invoice) => invoice.status === "OVERDUE");
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0);

  return {
    effectiveCreditLimit: limit,
    outstanding,
    availableCredit: Math.max(0, limit - outstanding),
    overdueAmount: overdue.reduce((sum, invoice) => sum + invoice.outstanding, 0),
    creditInvoices: tracked.length,
    paidOnTime: tracked.filter((invoice) => invoice.status === "ON_TIME").length,
    paidLate: late.length,
    currentlyOverdue: overdue.length,
    averageDaysLate: late.length ? late.reduce((sum, invoice) => sum + invoice.daysLate, 0) / late.length : 0,
    longestDelay: Math.max(0, ...late.map((invoice) => invoice.daysLate), ...overdue.map((invoice) => invoice.daysLate)),
    lastPayment: invoices.filter((invoice) => invoice.paymentTracking).map((invoice) => invoice.lastPaymentAt).filter((value): value is Date => value !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    recentInvoices: invoices.filter((invoice) => invoice.paymentTracking).slice(0, 10).map(({ paymentTracking: _paymentTracking, lastPaymentAt: _lastPaymentAt, ...invoice }) => invoice),
  };
}
