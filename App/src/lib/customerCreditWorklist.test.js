import { describe, expect, it } from "vitest";
import { creditDueState, customerCreditSummary, filterCustomerCredit, isActiveCustomerCredit } from "./customerCreditWorklist";

const today = "2026-09-26";
const sale = (id, changes = {}) => ({ id, apiId: id, kind: "sale", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true, remainingAmount: 300, status: "Partial", dueAt: "2026-09-24T17:30:00.000Z", ...changes });
const records = [
  sale("INV-OVERDUE"),
  sale("INV-TODAY", { customerId: "customer-2", customerName: "Day Shop", status: "Unpaid", remainingAmount: 200, dueAt: "2026-09-25T17:30:00.000Z" }),
  sale("INV-SOON", { remainingAmount: 100, dueAt: "2026-10-02T17:30:00.000Z" }),
  sale("INV-LATER", { remainingAmount: 50, dueAt: "2026-10-03T17:30:00.000Z" }),
  sale("INV-NODUE", { remainingAmount: 25, dueAt: null }),
  sale("INV-PAID", { status: "Paid", remainingAmount: 0 }),
  sale("INV-GUEST", { customerId: null }),
  sale("INV-UNTRACKED", { paymentTracking: false }),
  sale("INV-CANCEL", { status: "Cancel" }),
  { ...sale("SUPPLIER"), kind: "supplier-delivery" },
  { ...sale("EXPENSE"), kind: "expense" },
  { ...sale("REFUND"), kind: "sale-payment-refund" },
];

describe("customer credit worklist", () => {
  it("selects only active tracked customer sales with a balance", () => {
    expect(records.filter(isActiveCustomerCredit).map((record) => record.id)).toEqual(["INV-OVERDUE", "INV-TODAY", "INV-SOON", "INV-LATER", "INV-NODUE"]);
  });

  it("keeps payment status separate from Yangon due state and sums unique customers", () => {
    expect(records[0].status).toBe("Partial");
    expect(creditDueState(records[0], today)).toBe("Overdue");
    expect(customerCreditSummary(records, today)).toEqual({ outstanding: 675, overdue: 300, dueSoon: 300, customers: 2 });
    expect(creditDueState(sale("OLD", { dueAt: "2026-09-24T17:30:00.000Z" }), today)).toBe("Overdue");
    expect(creditDueState(records[4], today)).toBe("Open");
  });

  it("filters All, Overdue, Due Soon, Open and searches customer or invoice", () => {
    expect(filterCustomerCredit(records, { today }).map((record) => record.id)).toHaveLength(5);
    expect(filterCustomerCredit(records, { today, filter: "Overdue" }).map((record) => record.id)).toEqual(["INV-OVERDUE"]);
    expect(filterCustomerCredit(records, { today, filter: "Due Soon" }).map((record) => record.id)).toEqual(["INV-TODAY", "INV-SOON"]);
    expect(filterCustomerCredit(records, { today, filter: "Open" }).some((record) => record.id === "INV-OVERDUE")).toBe(false);
    expect(filterCustomerCredit(records, { today, search: "day shop" }).map((record) => record.id)).toEqual(["INV-TODAY"]);
    expect(filterCustomerCredit(records, { today, search: "inv-soon" }).map((record) => record.id)).toEqual(["INV-SOON"]);
  });
});
