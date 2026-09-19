import { describe, expect, it } from "vitest";
import { toPricedCartItem } from "./cartPricing";

describe("desktop order cart pricing", () => {
  it("shows the normal selling price when no promotion applies", () => {
    expect(toPricedCartItem({ id: "p1", price: 1200 }, 2, { regularUnitPrice: 1200, finalUnitPrice: 1200 })).toMatchObject({
      price: 1200, quantity: 2, promotion: { type: "regular", text: "Regular price" },
    });
  });

  it("keeps the regular price visible and represents a promotion as a deduction", () => {
    expect(toPricedCartItem({ id: "p1", price: 1200 }, 2, { regularUnitPrice: 1200, finalUnitPrice: 1000, promotionId: "promo", promotionDiscount: 200 })).toMatchObject({
      price: 1200, promotion: { type: "discount", value: 400 },
    });
  });
});
