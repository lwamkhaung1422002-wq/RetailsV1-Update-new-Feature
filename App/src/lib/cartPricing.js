export const toPricedCartItem = (product, quantity, pricing) => ({
  ...product,
  price: Number(pricing.regularUnitPrice ?? product.price ?? 0),
  quantity,
  promotion: pricing.promotionId
    ? { type: "discount", value: Number(pricing.promotionDiscount || 0) * quantity, text: `Promotion${pricing.promotionName ? `: ${pricing.promotionName}` : ""}` }
    : { type: "regular", text: "Regular price" },
});
