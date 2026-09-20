import { describe, expect, it } from "vitest";
import { mapPaymentWorklistRecords } from "./paymentWorklist";

describe("payment worklist mapping", () => {
  it("preserves worklist fields while adding the existing display values", () => {
    const [record] = mapPaymentWorklistRecords({
      records: [{
        id: "PAY-1",
        occurredAt: "2026-09-02T01:00:00.000Z",
        status: "Partial",
        method: "Cash",
        amount: 12_000,
      }],
    });

    expect(record).toMatchObject({
      id: "PAY-1",
      method: "Cash",
      status: "Partial",
      dateLabel: "Partial",
      isoDate: record.date,
    });
    expect(record.sortAt).toBe(new Date("2026-09-02T01:00:00.000Z").getTime());
  });

  it("sorts outstanding work before settled history with the required age order", () => {
    const records = mapPaymentWorklistRecords({ records: [
      { id: "paid-new", occurredAt: "2026-09-05T00:00:00.000Z", status: "Paid" },
      { id: "unpaid-new", occurredAt: "2026-09-04T00:00:00.000Z", status: "Unpaid" },
      { id: "partial-new", occurredAt: "2026-09-03T00:00:00.000Z", status: "Partial" },
      { id: "cancel-old", occurredAt: "2026-09-01T00:00:00.000Z", status: "Cancelled" },
      { id: "partial-old", occurredAt: "2026-09-02T00:00:00.000Z", status: "Partial" },
      { id: "refund-new", occurredAt: "2026-09-06T00:00:00.000Z", status: "Refund" },
    ] });

    expect(records.map((record) => record.id)).toEqual([
      "partial-old", "partial-new", "unpaid-new", "refund-new", "paid-new", "cancel-old",
    ]);
  });
});
