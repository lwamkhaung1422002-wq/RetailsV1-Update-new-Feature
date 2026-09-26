export const sellableUnits = (product) => (product.units || []).filter((unit) => unit.canSell && unit.unit?.isActive !== false);

export const selectedSellingUnit = (product) => sellableUnits(product).find((unit) => unit.id === product.productUnitId)
  || sellableUnits(product).find((unit) => unit.isBase)
  || sellableUnits(product)[0];

export const unitStockLimit = (product) => Math.floor(Number(product.stock || 0) / Number(selectedSellingUnit(product)?.conversionFactor || 1));

export const toPricedCartItem = (product, quantity, pricing) => ({
  ...product,
  price: Number(pricing.tierUnitPrice ?? pricing.regularUnitPrice ?? product.price ?? 0),
  quantity,
  promotion: pricing.promotionId
    ? { type: "discount", value: Number(pricing.promotionDiscount || 0) * quantity, text: `Promotion${pricing.promotionName ? `: ${pricing.promotionName}` : ""}` }
    : { type: "regular", text: "Regular price" },
});
