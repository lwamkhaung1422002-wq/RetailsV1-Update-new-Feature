type DecimalValue = { toString(): string } | number | string;

export type FinancialOrderItem = {
  unitCost: number;
  quantity: number;
  baseQuantity?: DecimalValue | null;
};

export type FinancialOrder = {
  total: number;
  items: FinancialOrderItem[];
};

export type FinancialPayment = {
  amount: number;
  type?: string | null;
  scope?: string | null;
};

export type FinancialExpense = {
  amount: number;
  category?: string | null;
  cancelledAt?: Date | null;
};

export type FinancialMetrics = {
  recognizedSalesBeforeRefunds: number;
  refunds: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
};

function roundedInteger(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function itemCogs(item: FinancialOrderItem): number {
  const text = String(item.baseQuantity ?? item.quantity);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid stored base quantity: ${text}`);

  const [, sign, whole, fractional = ""] = match;
  const quantity = BigInt(`${sign}${whole}${fractional}`);
  const scale = 10n ** BigInt(fractional.length);
  return Number(roundedInteger(BigInt(item.unitCost) * quantity, scale));
}

export function isFinancialRefund(payment: FinancialPayment): boolean {
  return payment.scope === "refund" || payment.type === "refund";
}

export function normalizedRefundAmount(payment: FinancialPayment): number {
  return isFinancialRefund(payment) ? Math.abs(payment.amount) : 0;
}

export function recognizedSalesBeforeRefunds(orders: FinancialOrder[]): number {
  return orders.reduce((total, order) => total + order.total, 0);
}

export function financialRefunds(payments: FinancialPayment[]): number {
  return payments.reduce((total, payment) => total + normalizedRefundAmount(payment), 0);
}

export function costOfGoodsSold(orders: FinancialOrder[]): number {
  return orders.reduce(
    (total, order) => total + order.items.reduce((orderTotal, item) => orderTotal + itemCogs(item), 0),
    0,
  );
}

export function isOperatingExpense(expense: FinancialExpense): boolean {
  return !expense.cancelledAt && expense.category?.trim().toLowerCase() !== "income";
}

export function operatingExpenses(expenses: FinancialExpense[]): number {
  return expenses
    .filter(isOperatingExpense)
    .reduce((total, expense) => total + expense.amount, 0);
}

export function calculateFinancialMetrics(input: {
  recognizedOrders: FinancialOrder[];
  payments: FinancialPayment[];
  expenses: FinancialExpense[];
}): FinancialMetrics {
  const recognizedSales = recognizedSalesBeforeRefunds(input.recognizedOrders);
  const refunds = financialRefunds(input.payments);
  const netRevenue = recognizedSales - refunds;
  const costOfGoods = costOfGoodsSold(input.recognizedOrders);
  const grossProfit = netRevenue - costOfGoods;
  const expenseTotal = operatingExpenses(input.expenses);

  return {
    recognizedSalesBeforeRefunds: recognizedSales,
    refunds,
    netRevenue,
    costOfGoods,
    grossProfit,
    operatingExpenses: expenseTotal,
    netProfit: grossProfit - expenseTotal,
  };
}
