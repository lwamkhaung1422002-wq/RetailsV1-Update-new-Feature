import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, uniqueStaffRows } from "./staffAccessModel";

const repositoryPermissionKeys = [
  "sale.create", "order.view", "order.fulfill", "order.cancel",
  "payment.view", "payment.receive", "payment.refund", "payment.void",
  "stock.view", "stock.receive", "stock.adjust", "product.view", "product.manage",
  "price.view", "price.edit", "supplier.view", "supplier.manage", "supplier.pay",
  "purchase.view", "purchase.manage", "expense.view", "expense.manage",
  "report.viewSales", "report.viewCost", "report.viewProfit", "audit.view",
  "settings.manage", "staff.manage", "branch.manage",
];

describe("Staff & Access model", () => {
  it("renders every real repository permission exactly once", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    expect([...ALL_PERMISSION_KEYS].sort()).toEqual([...repositoryPermissionKeys].sort());
  });

  it("keeps every role default within the real permission set", () => {
    const realPermissions = new Set(repositoryPermissionKeys);
    Object.values(DEFAULT_ROLE_PERMISSIONS).flat().forEach((permission) => expect(realPermissions.has(permission)).toBe(true));
  });

  it("shows an owner once across branches and protects its all-branch identity", () => {
    const owner = { id: "owner:user-1", role: "OWNER", active: true, user: { id: "user-1", name: "Owner" } };
    const staff = { id: "member-1", role: "CASHIER", active: true, user: { id: "user-2", name: "Cashier" }, branch: { id: "branch-1", name: "Main" } };
    const rows = uniqueStaffRows([
      { ...owner, branch: { id: "branch-1", name: "Main" } },
      { ...owner, branch: { id: "branch-2", name: "Second" } },
      staff,
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: "OWNER", branch: { id: "all", name: "All Branches" } });
    expect(rows[1]).toEqual(staff);
  });
});
