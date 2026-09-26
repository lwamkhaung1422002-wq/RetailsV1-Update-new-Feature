import { describe, expect, it } from "vitest";
import { selectedSellingUnit, sellableUnits, toPricedCartItem, unitStockLimit } from "./cartPricing";

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

  it("uses a selected-unit tier price without multiplying it again", () => {
    expect(toPricedCartItem({ id: "p1", price: 1000 }, 5, { regularUnitPrice: 24_000, tierUnitPrice: 20_000, finalUnitPrice: 20_000 })).toMatchObject({ price: 20_000, quantity: 5 });
  });

  it("defaults to base unit and limits entered cartons by base stock", () => {
    const units = [
      { id: "piece-product-unit", unitId: "piece", isBase: true, canSell: true, conversionFactor: 1, unit: { name: "Piece" } },
      { id: "carton-product-unit", unitId: "carton", isBase: false, canSell: true, conversionFactor: 24, unit: { name: "Carton" } },
    ];
    const product = { stock: 120, units };
    expect(sellableUnits(product)).toHaveLength(2);
    expect(selectedSellingUnit(product)?.unitId).toBe("piece");
    expect(unitStockLimit({ ...product, productUnitId: "carton-product-unit" })).toBe(5);
  });
});
