export function formatEnteredUnit(item) {
  const quantity = Number(item.enteredQuantity ?? item.quantity ?? 0);
  const symbol = item.unitSymbol || item.pricingSnapshot?.unitSymbol;
  return `${quantity}${symbol ? ` ${symbol}` : ""}`;
}
