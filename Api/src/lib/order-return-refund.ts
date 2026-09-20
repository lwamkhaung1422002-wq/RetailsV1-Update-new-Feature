import { historicalReturnedValue } from "./sale-exchange.js";

type ReturnEntry = { quantity: unknown };
type ReturnItem = {
  id: string;
  quantity: number;
  baseQuantity?: unknown;
  lineTotal: number;
  returns?: ReturnEntry[];
};

type ReturnAwareOrder = {
  total: number;
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  items: ReturnItem[];
};

export type RefundablePayment = {
  id: string;
  amount: number;
  method: string;
  originalPaymentId?: string | null;
  paidAt?: Date | string;
  createdAt?: Date | string;
};

export function effectiveOrderTotal(order: ReturnAwareOrder): number {
  const returnedItems = order.items.flatMap((item) => {
    const quantity = (item.returns ?? []).reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
    return quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
  });
  return Math.max(0, order.total - historicalReturnedValue(order as never, returnedItems));
}

export function remainingRefundablePayments(payments: RefundablePayment[]) {
  const refundedByOriginal = new Map<string, number>();
  for (const payment of payments) {
    if (payment.amount >= 0 || !payment.originalPaymentId) continue;
    refundedByOriginal.set(
      payment.originalPaymentId,
      (refundedByOriginal.get(payment.originalPaymentId) ?? 0) + Math.abs(payment.amount),
    );
  }
  return payments
    .filter((payment) => payment.amount > 0)
    .map((payment) => ({
      ...payment,
      refundableAmount: Math.max(0, payment.amount - (refundedByOriginal.get(payment.id) ?? 0)),
    }))
    .filter((payment) => payment.refundableAmount > 0)
    .sort((left, right) => {
      const time = Number(new Date(left.paidAt ?? left.createdAt ?? 0)) - Number(new Date(right.paidAt ?? right.createdAt ?? 0));
      return time || left.id.localeCompare(right.id);
    });
}

export function allocateRefund(payments: RefundablePayment[], requestedAmount: number) {
  let remaining = requestedAmount;
  const allocations: Array<{ originalPaymentId: string; method: string; amount: number }> = [];
  for (const payment of remainingRefundablePayments(payments)) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, payment.refundableAmount);
    allocations.push({ originalPaymentId: payment.id, method: payment.method, amount });
    remaining -= amount;
  }
  return { allocations, unallocatedAmount: remaining };
}

export function remainingCancellationSlices<T>(
  slices: T[],
  quantityOf: (slice: T) => unknown,
  alreadyReturned: unknown,
) {
  let returnedRemaining = Math.max(0, Number(alreadyReturned ?? 0));
  const remaining: Array<{ slice: T; quantity: number }> = [];
  for (const slice of slices) {
    const quantity = Math.max(0, Number(quantityOf(slice) ?? 0));
    const consumedByReturn = Math.min(returnedRemaining, quantity);
    returnedRemaining -= consumedByReturn;
    const cancelQuantity = quantity - consumedByReturn;
    if (cancelQuantity > 0.0005) remaining.push({ slice, quantity: cancelQuantity });
  }
  return remaining;
}
