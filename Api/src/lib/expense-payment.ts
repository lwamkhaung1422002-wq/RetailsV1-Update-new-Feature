type ExpensePayment = {
  id: string; title: string; category: string | null; amount: number;
  method: string | null; spentAt: Date; createdAt: Date; cancelledAt: Date | null;
  note?: string | null;
};

export function expenseWorklistRecord(expense: ExpensePayment) {
  return {
    id: expense.id, apiId: expense.id,
    kind: String(expense.category || "").toLowerCase() === "income" ? "income" : "expense",
    name: expense.title, status: expense.cancelledAt ? "Cancelled" : "Paid",
    amount: expense.amount, remainingAmount: 0, method: expense.method,
    occurredAt: expense.cancelledAt || expense.spentAt || expense.createdAt,
  };
}

export function expenseHistoryRecords(expense: ExpensePayment) {
  const base = { ...expenseWorklistRecord(expense), invoice: "", method: expense.method || "Cash" };
  return [
    { ...base, status: "Paid", occurredAt: expense.createdAt, reason: expense.note || undefined },
    ...(expense.cancelledAt ? [{ ...base, id: `cancel-${expense.id}`, status: "Cancelled", occurredAt: expense.cancelledAt, reason: `${base.kind === "income" ? "Income" : "Expense"} cancelled` }] : []),
  ];
}
