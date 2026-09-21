import { describe, expect, it } from "vitest";
import { getOrderReturnSummary } from "./orderSummary";
import { buildReturnActivity } from "../../lib/orderActivity";

describe("Order Details return summary", () => {
  it("keeps a non-returned order summary clean", () => {
    expect(getOrderReturnSummary({ total: 90_000, items: [] }, null)).toEqual({
      originalTotal: 90_000,
      effectiveTotal: 90_000,
      returnedSaleValue: 0,
    });
  });

  it("uses returned sale value and the authoritative effective total rather than refund cash", () => {
    const record = {
      total: 90_000,
      effectiveTotal: 60_000,
      payments: [{ amount: -10_000 }],
      items: [{ id: "item-1", quantity: 3, lineTotal: 90_000, returns: [{ quantity: 1 }] }],
    };
    expect(getOrderReturnSummary(record, null)).toEqual({
      originalTotal: 90_000,
      effectiveTotal: 60_000,
      returnedSaleValue: 30_000,
    });
  });

  it("keeps detailed return activity as its own item-level history", () => {
    const activity = buildReturnActivity({
      returns: [{ id: "return-1", orderItemId: "item-1", itemName: "Coffee", quantity: 1, reason: "Damaged" }],
      exchanges: [],
    });
    expect(activity).toEqual([expect.objectContaining({ itemName: "Coffee", quantity: 1, reason: "Damaged" })]);
  });
});
