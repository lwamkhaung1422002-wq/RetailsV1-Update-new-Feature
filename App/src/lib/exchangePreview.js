export function previewReturnedValue(order, quantities) {
  const gross = (order.items || []).reduce((sum, item) => {
    const returnedQuantity = Number(quantities[item.id] || 0);
    const soldQuantity = Number(item.baseQuantity ?? item.quantity ?? 0);
    if (returnedQuantity <= 0 || soldQuantity <= 0) return sum;
    return sum + Number(item.lineTotal || 0) * returnedQuantity / soldQuantity;
  }, 0);
  const subtotal = Number(order.subtotal || 0);
  if (subtotal <= 0) return 0;
  const merchandiseValue = Math.max(0, subtotal - Number(order.discount || 0));
  return Math.round(gross * merchandiseValue / subtotal);
}

export function previewExchangeDifference(returnedValue, replacementValue) {
  return Number(replacementValue || 0) - Number(returnedValue || 0);
}
