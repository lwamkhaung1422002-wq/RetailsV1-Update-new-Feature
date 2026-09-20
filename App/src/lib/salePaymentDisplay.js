export function salePaymentDisplay(payments, effectiveTotal) {
  const entries = payments || [];
  const paidAmount = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const remainingAmount = Math.max(0, Number(effectiveTotal || 0) - paidAmount);
  const latestMethod = [...entries]
    .filter((entry) => Number(entry.amount || 0) > 0)
    .sort((left, right) => new Date(right.paidAt || right.createdAt || 0) - new Date(left.paidAt || left.createdAt || 0))[0]?.method;
  if (paidAmount <= 0) return { status: "Unpaid", label: "Unpaid", paidAmount, remainingAmount };
  if (remainingAmount > 0) return { status: "Partial", label: "Partial", paidAmount, remainingAmount };
  return { status: "Paid", label: latestMethod || "Paid", paidAmount, remainingAmount };
}

export function sumActiveSaleAmounts(orders) {
  return (orders || [])
    .filter((order) => order.status !== "Cancel")
    .reduce((total, order) => total + Number(order.amount || 0), 0);
}
