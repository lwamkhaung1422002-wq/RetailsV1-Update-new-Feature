import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopOrderItem } from "./CreateOrderPage";
import { calculateOrderTotals, checkoutCustomerError, checkoutOrderFields, filterCustomerOptions } from "./checkoutCustomer";

const item = {
  id: "product-1",
  name: "Coffee",
  description: "Fresh coffee",
  price: 10_000,
  quantity: 1,
  stock: 5,
  color: "#1976d2",
  icon: null,
};

afterEach(cleanup);

describe("desktop create-order item pricing row", () => {
  it("hides the regular-price row when no promotion is active", () => {
    render(<DesktopOrderItem item={{ ...item, promotion: { type: "regular", text: "Regular price" } }} onQuantityChange={vi.fn()} onQuantitySet={vi.fn()} />);
    expect(screen.queryByText("Regular price")).toBeNull();
  });

  it("keeps active promotion information", () => {
    render(<DesktopOrderItem item={{ ...item, promotion: { type: "discount", text: "Weekend promo", value: 1_000 } }} onQuantityChange={vi.fn()} onQuantitySet={vi.fn()} />);
    expect(screen.getByText(/Weekend promo/)).toBeTruthy();
    expect(screen.getByText(/Discount/)).toBeTruthy();
  });
});

describe("customer and logistic checkout rules", () => {
  it("adds Logistic Charge after discount and exposes one authoritative grand total", () => {
    expect(calculateOrderTotals([
      { price: 10_000, quantity: 2, promotion: { type: "discount", value: 1_500 } },
    ], 2_000)).toEqual({ quantity: 2, itemsTotal: 20_000, discount: 1_500, deliveryFee: 2_000, total: 20_500 });
  });

  it("keeps a paid walk-in valid and requires a saved customer for unpaid or partial sales", () => {
    expect(checkoutCustomerError("cash", "unpaid", null)).toBe("");
    expect(checkoutCustomerError("other", "unpaid", null)).toMatch(/select a customer/i);
    expect(checkoutCustomerError("other", "partial", null)).toMatch(/select a customer/i);
    expect(checkoutCustomerError("other", "partial", "customer-1")).toBe("");
  });

  it("sends deliveryFee and only sends customerId for a saved customer", () => {
    expect(checkoutOrderFields(null, 0)).toEqual({ deliveryFee: 0 });
    expect(checkoutOrderFields({ id: "customer-1", name: "Aye Aye" }, 2_000)).toEqual({ deliveryFee: 2_000, customerId: "customer-1" });
  });

  it("matches customer name or phone and ranks starts-with results first", () => {
    const customers = [
      { id: "1", name: "Ma Aye", phone: "09123" },
      { id: "2", name: "Aye Aye", phone: "09555" },
      { id: "3", name: "Ko Min", phone: "12345" },
    ];
    expect(filterCustomerOptions(customers, "aye").map((customer) => customer.id)).toEqual(["2", "1"]);
    expect(filterCustomerOptions(customers, "123").map((customer) => customer.id)).toEqual(["3", "1"]);
  });
});
