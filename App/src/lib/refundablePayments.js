export function refundableSalePayments(payments = []) {
  const refunded = new Map();
  for (const payment of payments) {
    if (Number(payment.amount) >= 0 || !payment.originalPaymentId) continue;
    refunded.set(payment.originalPaymentId, (refunded.get(payment.originalPaymentId) || 0) + Math.abs(Number(payment.amount)));
  }
  return payments
    .filter((payment) => Number(payment.amount) > 0)
    .map((payment) => ({ ...payment, refundableAmount: Math.max(0, Number(payment.amount) - (refunded.get(payment.id) || 0)) }))
    .filter((payment) => payment.refundableAmount > 0);
}
