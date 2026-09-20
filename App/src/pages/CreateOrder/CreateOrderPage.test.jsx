import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopOrderItem } from "./CreateOrderPage";

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
