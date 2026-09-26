function optionalSourceFields(supplierName, invoiceReference) {
  const supplier = String(supplierName || "").trim();
  const invoice = String(invoiceReference || "").trim();
  return {
    ...(supplier ? { supplierName: supplier } : {}),
    ...(invoice ? { invoiceReference: invoice } : {}),
  };
}

export function initialStockReceiptPayload({ productId, stock, cost, supplierName, invoiceReference }) {
  if (Number(stock) <= 0) return null;
  return {
    productId,
    quantity: Number(stock),
    unitCost: Number(cost),
    note: "Initial stock created with product.",
    ...optionalSourceFields(supplierName, invoiceReference),
  };
}

export function purchaseUnits(product) {
  return (product?.units || []).filter((unit) => unit.canPurchase && unit.unit?.isActive !== false);
}

export function stockInReceiptPayload({ productId, unitId, quantity, cost, notes, supplierName, invoiceReference }) {
  const note = String(notes || "").trim();
  return {
    productId,
    ...(unitId ? { unitId } : {}),
    quantity: Number(quantity),
    unitCost: Number(cost),
    ...(note ? { note } : {}),
    ...optionalSourceFields(supplierName, invoiceReference),
  };
}

export function supplierNameOptions(batches = [], productId) {
  const preferred = [];
  const other = [];
  const seen = new Set();
  for (const batch of batches) {
    const value = String(batch?.supplierName || "").trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    (productId && batch.productId === productId ? preferred : other).push(value);
  }
  return [...preferred, ...other];
}
