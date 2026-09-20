import { describe, expect, it } from "vitest";
import { buildPaymentActivity, buildReturnActivity } from "./orderActivity";

describe("order activity read model", () => {
  it("shows payments and every refund scope once in chronological order", () => {
    const activity = buildPaymentActivity({
      payments: [{ id: "pay", amount: 100, createdAt: "2026-01-01" }],
      refunds: [
        { id: "standard", amount: -10, scope: "refund", createdAt: "2026-01-02" },
        { id: "return", amount: -20, scope: "product-return", createdAt: "2026-01-03" },
        { id: "exchange", amount: -30, scope: "exchange-return", createdAt: "2026-01-04" },
      ],
    });
    expect(activity.map((entry) => entry.id)).toEqual(["pay", "standard", "return", "exchange"]);
    expect(activity.filter((entry) => entry.amount < 0)).toHaveLength(3);
  });

  it("keeps non-financial return and historical exchange facts chronological", () => {
    expect(buildReturnActivity({
      returns: [{ id: "return", createdAt: "2026-01-02" }],
      exchanges: [{ id: "exchange", createdAt: "2026-01-01" }],
    }).map((entry) => [entry.activityType, entry.id])).toEqual([
      ["exchange", "exchange"], ["return", "return"],
    ]);
  });
});
