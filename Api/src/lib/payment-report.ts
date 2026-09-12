import { isFinancialRefund, normalizedRefundAmount, type FinancialPayment } from "./financial-domain.js";

export type ReportablePayment = FinancialPayment & { method: string };

type ExchangeReportablePayment = ReportablePayment & {
  id: string;
  exchangeId?: string | null;
};

const EXCHANGE_SETTLEMENT_SCOPES = new Set(["exchange-return", "exchange-credit", "exchange-difference"]);

export function paymentReportCashMovements<T extends ExchangeReportablePayment>(payments: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const payment of payments) {
    if (payment.exchangeId && EXCHANGE_SETTLEMENT_SCOPES.has(payment.scope ?? "")) {
      const group = grouped.get(payment.exchangeId) ?? [];
      group.push(payment);
      grouped.set(payment.exchangeId, group);
    }
  }

  const normalizedBySourceId = new Map<string, T>();
  const omittedIds = new Set<string>();
  for (const group of grouped.values()) {
    group.forEach((payment) => omittedIds.add(payment.id));
    const amount = group.reduce((sum, payment) => sum + payment.amount, 0);
    if (amount === 0) continue;
    const source = amount > 0
      ? group.find((payment) => payment.scope === "exchange-difference")
      : group.find((payment) => payment.scope === "exchange-return");
    if (!source) {
      group.forEach((payment) => omittedIds.delete(payment.id));
      continue;
    }
    normalizedBySourceId.set(source.id, {
      ...source,
      amount,
      type: amount > 0 ? "payment" : "refund",
    });
  }

  return payments.flatMap((payment) => {
    const normalized = normalizedBySourceId.get(payment.id);
    if (normalized) return [normalized];
    return omittedIds.has(payment.id) ? [] : [payment];
  });
}

export function paymentReportMetrics(payments: ReportablePayment[]) {
  const collected = payments.reduce((sum, payment) => payment.type === "payment" && payment.scope !== "cod-settlement-void" ? sum + payment.amount : sum, 0);
  const refunds = payments.reduce((sum, payment) => sum + normalizedRefundAmount(payment), 0);
  const voids = payments.reduce((sum, payment) => payment.scope === "cod-settlement-void" ? sum + Math.abs(payment.amount) : sum, 0);
  return { collected, refunds, netCollected: collected - refunds - voids };
}

export function paymentMethodFor(payment: ReportablePayment & { originalPaymentId?: string | null }, byId: Map<string, ReportablePayment>): string {
  return isFinancialRefund(payment) ? byId.get(payment.originalPaymentId ?? "")?.method ?? payment.method : payment.method;
}
