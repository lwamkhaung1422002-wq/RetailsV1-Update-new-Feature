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

export function stockInReceiptPayload({ productId, quantity, cost, notes, supplierName, invoiceReference }) {
  return {
    productId,
    quantity: Number(quantity),
    unitCost: Number(cost),
    note: notes.trim(),
    ...optionalSourceFields(supplierName, invoiceReference),
  };
}
