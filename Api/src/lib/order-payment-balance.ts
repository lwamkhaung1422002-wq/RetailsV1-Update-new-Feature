export type OrderPaymentEntry = {
  id?: string;
  amount: number;
  type?: string | null;
  scope?: string | null;
  method?: string;
  allocations?: string | null;
};

function parseAllocations(value?: string | null): Array<{ orderId?: unknown; amount?: unknown }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function orderPaymentEntries<D extends OrderPaymentEntry, A extends OrderPaymentEntry>(
  orderId: string,
  directPayments: D[],
  allocatedPayments: A[],
): Array<D | A> {
  const allocatedEntries = allocatedPayments.flatMap((payment) => {
    const allocation = parseAllocations(payment.allocations).find((entry) => entry.orderId === orderId);
    if (!allocation || typeof allocation.amount !== "number") return [];
    const scope = payment.scope ?? payment.type ?? "";
    const sign = payment.amount < 0 || scope.includes("void") ? -1 : 1;
    return [{ ...payment, amount: sign * allocation.amount }];
  });
  return [...directPayments, ...allocatedEntries];
}

export function orderPaidAmount<D extends OrderPaymentEntry, A extends OrderPaymentEntry>(
  orderId: string,
  directPayments: D[],
  allocatedPayments: A[],
): number {
  return orderPaymentEntries(orderId, directPayments, allocatedPayments)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function paymentSummary<T extends OrderPaymentEntry>(total: number, entries: T[]) {
  const paid = entries.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    entries,
    paid,
    outstanding: Math.max(0, total - paid),
    paymentStatus: paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial",
  };
}

export function historicalReceiptPaymentSummary<D extends OrderPaymentEntry, A extends OrderPaymentEntry>(
  total: number,
  orderId: string,
  directPayments: D[],
  allocatedPayments: A[],
) {
  const originalSettlements = orderPaymentEntries(orderId, directPayments, allocatedPayments)
    .filter((payment) => payment.amount > 0);
  return paymentSummary(total, originalSettlements);
}
