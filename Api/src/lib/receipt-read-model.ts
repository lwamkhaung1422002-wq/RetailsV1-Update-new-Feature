import { exchangeDifference } from "./sale-exchange.js";

type ReceiptPayment = {
  id: string;
  amount: number;
  type?: string | null;
  scope?: string | null;
  method: string;
  originalPaymentId?: string | null;
  reason?: string | null;
  note?: string | null;
  paidAt: Date | string;
  allocations?: string | null;
};

type ReceiptItem = {
  id: string;
  productName: string;
  variantName?: string | null;
  quantity: number;
  enteredQuantity?: unknown;
  baseQuantity?: unknown;
  conversionFactor?: unknown;
  unitPrice: number;
  lineTotal: number;
  discount?: number;
  regularUnitPrice?: number | null;
  promotionDiscount?: number;
  manualDiscount?: number;
  pricingSnapshot?: unknown;
  returns?: Array<{
    id: string;
    quantity: unknown;
    condition: string;
    reason: string;
    createdAt: Date | string;
  }>;
};

type ReceiptOrderReference = {
  id: string;
  orderNumber?: string | null;
  total: number;
  items: ReceiptItem[];
};

type ReceiptExchange = {
  id: string;
  actorId: string;
  reason: string;
  createdAt: Date | string;
  originalOrder: ReceiptOrderReference;
  replacementOrder: ReceiptOrderReference;
  returns: Array<{ id: string; orderItemId: string; quantity: unknown; condition: string; reason: string }>;
  payments: ReceiptPayment[];
};

type ReceiptOrder = ReceiptOrderReference & {
  shop: { id: string; name: string; address?: string | null };
  customer?: { id: string; name: string } | null;
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: Date | string;
  completedAt?: Date | string | null;
  payments: ReceiptPayment[];
  sourceExchanges?: ReceiptExchange[];
  replacementExchange?: ReceiptExchange | null;
};

type ReceiptActor = { id: string; name: string };

function paymentReference(payment: ReceiptPayment) {
  return {
    id: payment.id,
    method: payment.method,
    amount: payment.amount,
    type: payment.type ?? null,
    scope: payment.scope ?? null,
    originalPaymentId: payment.originalPaymentId ?? null,
    reason: payment.reason ?? payment.note ?? null,
    paidAt: payment.paidAt,
  };
}

function exchangeReference(exchange: ReceiptExchange, actors: Map<string, ReceiptActor>) {
  const originalItems = new Map(exchange.originalOrder.items.map((item) => [item.id, item]));
  const returnedPayment = exchange.payments.find((payment) => payment.scope === "exchange-return");
  const returnedValue = Math.abs(returnedPayment?.amount ?? 0);
  const replacementValue = exchange.replacementOrder.total;
  const difference = exchangeDifference(returnedValue, replacementValue);
  const differencePayment = difference > 0
    ? exchange.payments.find((payment) => payment.scope === "exchange-difference")
    : difference < 0
      ? returnedPayment
      : null;
  return {
    id: exchange.id,
    reason: exchange.reason,
    createdAt: exchange.createdAt,
    cashier: actors.get(exchange.actorId) ?? null,
    originalInvoice: {
      orderId: exchange.originalOrder.id,
      invoiceNumber: exchange.originalOrder.orderNumber || exchange.originalOrder.id,
    },
    replacementInvoice: {
      orderId: exchange.replacementOrder.id,
      invoiceNumber: exchange.replacementOrder.orderNumber || exchange.replacementOrder.id,
    },
    returnedItems: exchange.returns.map((entry) => ({
      reference: entry.id,
      orderItemId: entry.orderItemId,
      name: originalItems.get(entry.orderItemId)?.productName ?? "Item",
      variantName: originalItems.get(entry.orderItemId)?.variantName ?? null,
      quantity: String(entry.quantity),
      condition: entry.condition,
    })),
    replacementItems: exchange.replacementOrder.items.map((item) => ({
      id: item.id,
      name: item.productName,
      variantName: item.variantName ?? null,
      quantity: item.enteredQuantity == null ? item.quantity : Number(item.enteredQuantity),
      baseQuantity: item.baseQuantity == null ? item.quantity : Number(item.baseQuantity),
      conversionFactor: item.conversionFactor == null ? 1 : Number(item.conversionFactor),
      unitSymbol: (item.pricingSnapshot as { unitSymbol?: string | null } | null)?.unitSymbol ?? null,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    returnedValue,
    replacementValue,
    difference,
    differenceType: difference > 0 ? "customer-payment" : difference < 0 ? "refund" : "even",
    differenceMethod: differencePayment?.method ?? null,
    differencePaymentReference: differencePayment?.id ?? null,
  };
}

export function buildReceiptReadModel(
  order: ReceiptOrder,
  paymentSummary: { entries: ReceiptPayment[]; paid: number; outstanding: number; paymentStatus: string },
  creatorId: string | null,
  actors: Map<string, ReceiptActor>,
) {
  const exchanges = [
    ...(order.sourceExchanges ?? []),
    ...(order.replacementExchange ? [order.replacementExchange] : []),
  ].filter((exchange, index, all) => all.findIndex((entry) => entry.id === exchange.id) === index);

  return {
    documentType: order.replacementExchange ? "exchange-replacement" : "invoice",
    orderId: order.id,
    invoiceNumber: order.orderNumber || order.id,
    transactionAt: order.createdAt,
    completedAt: order.completedAt ?? null,
    shop: order.shop,
    cashier: creatorId ? actors.get(creatorId) ?? null : null,
    customer: order.customer ?? null,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: paymentSummary.paymentStatus,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      variantName: item.variantName ?? null,
      quantity: item.enteredQuantity == null ? item.quantity : Number(item.enteredQuantity),
      baseQuantity: item.baseQuantity == null ? item.quantity : Number(item.baseQuantity),
      conversionFactor: item.conversionFactor == null ? 1 : Number(item.conversionFactor),
      unitSymbol: (item.pricingSnapshot as { unitSymbol?: string | null } | null)?.unitSymbol ?? null,
      unitPrice: item.unitPrice,
      regularUnitPrice: item.regularUnitPrice ?? null,
      lineTotal: item.lineTotal,
      itemDiscount: item.discount ?? 0,
      promotionDiscount: item.promotionDiscount ?? 0,
      manualDiscount: item.manualDiscount ?? 0,
      pricingSnapshot: item.pricingSnapshot ?? null,
    })),
    totals: {
      subtotal: order.subtotal,
      orderDiscount: order.discount,
      deliveryFee: order.deliveryFee ?? 0,
      total: order.total,
      paid: paymentSummary.paid,
      outstanding: paymentSummary.outstanding,
    },
    payments: paymentSummary.entries.map(paymentReference),
    returns: order.items.flatMap((item) => (item.returns ?? []).map((entry) => ({
      id: entry.id,
      orderItemId: item.id,
      itemName: item.productName,
      quantity: String(entry.quantity),
      condition: entry.condition,
      reason: entry.reason,
      createdAt: entry.createdAt,
    }))),
    refunds: order.payments
      .filter((payment) => payment.type === "refund" || payment.scope === "refund" || payment.scope === "exchange-return")
      .map(paymentReference),
    exchanges: exchanges.map((exchange) => exchangeReference(exchange, actors)),
  };
}
