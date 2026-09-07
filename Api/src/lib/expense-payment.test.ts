import { describe, expect, it } from "vitest";
import { expenseHistoryRecords, expenseWorklistRecord } from "./expense-payment.js";

describe.each(["income", "expense"])("%s cancellation records", (category) => {
  const expense = { id: "entry-1", title: "Entry", category, amount: 4500, method: "Cash", spentAt: new Date("2026-09-01"), createdAt: new Date("2026-09-01"), cancelledAt: null };
  it("retains the original type and paid entry", () => {
    expect(expenseWorklistRecord(expense)).toMatchObject({ kind: category, status: "Paid", amount: 4500 });
    expect(expenseHistoryRecords(expense)).toHaveLength(1);
  });
  it("keeps a cancelled worklist record and both history events", () => {
    const cancelledAt = new Date("2026-09-05");
    const cancelled = { ...expense, cancelledAt };
    expect(expenseWorklistRecord(cancelled)).toMatchObject({ kind: category, status: "Cancelled", amount: 4500, occurredAt: cancelledAt });
    const records = expenseHistoryRecords(cancelled);
    expect(records.map((record) => record.status)).toEqual(["Paid", "Cancelled"]);
    expect(new Set(records.map((record) => record.id)).size).toBe(2);
    expect(records[0]?.occurredAt).toEqual(expense.createdAt);
    expect(records[1]?.occurredAt).toEqual(cancelledAt);
  });
});
