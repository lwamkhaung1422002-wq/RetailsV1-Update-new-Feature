import { effectiveOrderTotal, remainingRefundablePayments, type RefundablePayment } from "./order-return-refund.js";

type PaymentStateOrder = {
  total: number;
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  fulfillmentStatus: string;
  items: Array<{ id: string; quantity: number; baseQuantity?: unknown; lineTotal: number; returns?: Array<{ quantity: unknown }> }>;
  payments: RefundablePayment[];
};

export function currentSalePaymentState(order: PaymentStateOrder) {
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const payableTotal = effectiveOrderTotal(order);
  const remainingAmount = Math.max(0, payableTotal - paid);
  const refundablePayments = remainingRefundablePayments(order.payments);
  const latestCollection = [...order.payments].filter((payment) => payment.amount > 0).sort((left, right) => Number(new Date(right.paidAt ?? right.createdAt ?? 0)) - Number(new Date(left.paidAt ?? left.createdAt ?? 0)))[0];
  return {
    paid,
    payableTotal,
    remainingAmount,
    refundablePayments,
    status: order.fulfillmentStatus === "cancelled" ? "Cancel" : paid >= payableTotal && payableTotal > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
    currentMethod: paid > 0 ? latestCollection?.method || "" : "",
    occurredAt: latestCollection?.paidAt || latestCollection?.createdAt,
  };
}
