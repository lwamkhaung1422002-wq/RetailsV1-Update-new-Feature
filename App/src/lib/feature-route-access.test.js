import { describe, expect, it } from "vitest";

import { canAccessFeatureRoute } from "./feature-route-access";

describe("feature route access", () => {
  const cashier = { role: "CASHIER", permissions: ["report.viewSales"] };

  it("keeps Staff & Access limited to owners and managers", () => {
    expect(canAccessFeatureRoute({ isOwner: true, role: "OWNER", permissions: [] }, "staff-access")).toBe(true);
    expect(canAccessFeatureRoute({ role: "OWNER", permissions: [] }, "staff-access")).toBe(true);
    expect(canAccessFeatureRoute({ isOwner: false, role: "MANAGER", permissions: [] }, "staff-access")).toBe(true);
    expect(canAccessFeatureRoute(cashier, "staff-access")).toBe(false);
  });

  it("keeps branch management owner-only", () => {
    expect(canAccessFeatureRoute({ isOwner: true, role: "OWNER", permissions: [] }, "branches")).toBe(true);
    expect(canAccessFeatureRoute({ role: "OWNER", permissions: [] }, "branches")).toBe(true);
    expect(canAccessFeatureRoute({ isOwner: false, role: "MANAGER", permissions: ["branch.manage"] }, "branches")).toBe(false);
  });

  it("uses report permissions for report routes", () => {
    expect(canAccessFeatureRoute(cashier, "report.viewSales")).toBe(true);
    expect(canAccessFeatureRoute(cashier, "audit.view")).toBe(false);
  });
});
