import { describe, expect, it } from "vitest";
import { operationGroup, operationSummary } from "./operations-report.js";

describe("operations reporting", () => {
  it("classifies operational and sensitive events", () => {
    expect(operationGroup("order.create")).toBe("Sales");
    expect(operationGroup("inventory.receive")).toBe("Inventory");
    expect(operationGroup("staff.add")).toBe("Staff Activity");
    expect(operationGroup("payment.refund", "manager-override")).toBe("Sensitive Actions");
  });

  it("counts manager-approved events from existing audit metadata", () => {
    expect(operationSummary([
      { action: "order.create", metadata: {} },
      { action: "order.cancel", metadata: { authorizationMode: "manager-override" } },
      { action: "payment.refund", metadata: { authorizationMode: "direct" } },
      { action: "inventory.adjust", metadata: {} },
      { action: "supplier.delivery.payment.reverse", metadata: {} },
    ])).toEqual({ orders: 1, cancelled: 1, refunds: 1, stockAdjustments: 1, paymentReversals: 1, managerApprovals: 1 });
  });
});
