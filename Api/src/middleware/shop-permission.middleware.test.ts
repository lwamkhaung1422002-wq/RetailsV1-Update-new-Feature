import { describe, expect, it } from "vitest";

import { permissionForRequest } from "./shop-permission.middleware.js";

describe("Shop permission route mapping", () => {
  it("maps cashier and stock workflows to distinct permissions", () => {
    expect(permissionForRequest("POST", "orders")).toBe("sale.create");
    expect(permissionForRequest("POST", "orders/order-1/payments")).toBe("payment.receive");
    expect(permissionForRequest("POST", "orders/order-1/refunds")).toBe("payment.refund");
    expect(permissionForRequest("POST", "inventory/batch-1/adjustments")).toBe("stock.adjust");
    expect(permissionForRequest("POST", "inventory")).toBe("stock.receive");
  });

  it("keeps administrative and reporting routes behind their policies", () => {
    expect(permissionForRequest("GET", "staff")).toBe("staff.manage");
    expect(permissionForRequest("PUT", "role-policies/CASHIER")).toBe("staff.manage");
    expect(permissionForRequest("GET", "reports/sales")).toBe("report.viewSales");
    expect(permissionForRequest("GET", "audit-logs")).toBe("audit.view");
  });
});
