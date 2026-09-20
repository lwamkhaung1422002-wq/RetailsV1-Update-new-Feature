export function resolveCheckoutPayment({ paymentMethod, otherPayment, cashAmount, total }) {
  const received = Math.max(0, Number(cashAmount) || 0);
  const isPartial = paymentMethod === "other" && otherPayment === "partial";
  if (paymentMethod === "cash" && received > 0 && received < total) {
    return { error: "Amount received must be at least the total amount.", initialPaymentAmount: 0, change: 0 };
  }
  if (isPartial && !(received > 0 && received < total)) {
    return { error: "Partial payment must be greater than zero and less than the total amount.", initialPaymentAmount: 0, change: 0 };
  }
  const amountReceived = paymentMethod === "other" && otherPayment === "unpaid"
    ? 0
    : paymentMethod === "cash"
      ? received <= 0 ? total : received
      : isPartial
        ? received
        : total;
  return {
    error: "",
    initialPaymentAmount: Math.min(amountReceived, total),
    change: Math.max(0, amountReceived - total),
  };
}
