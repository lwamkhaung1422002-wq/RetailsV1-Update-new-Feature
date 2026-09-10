import { isFinancialRefund, normalizedRefundAmount, type FinancialPayment } from "./financial-domain.js";

export type ReportablePayment = FinancialPayment & { method: string };

export function paymentReportMetrics(payments: ReportablePayment[]) {
  const collected = payments.reduce((sum, payment) => payment.type === "payment" && payment.scope !== "cod-settlement-void" ? sum + payment.amount : sum, 0);
  const refunds = payments.reduce((sum, payment) => sum + normalizedRefundAmount(payment), 0);
  const voids = payments.reduce((sum, payment) => payment.scope === "cod-settlement-void" ? sum + Math.abs(payment.amount) : sum, 0);
  return { collected, refunds, netCollected: collected - refunds - voids };
}

export function paymentMethodFor(payment: ReportablePayment & { originalPaymentId?: string | null }, byId: Map<string, ReportablePayment>): string {
  return isFinancialRefund(payment) ? byId.get(payment.originalPaymentId ?? "")?.method ?? payment.method : payment.method;
}
