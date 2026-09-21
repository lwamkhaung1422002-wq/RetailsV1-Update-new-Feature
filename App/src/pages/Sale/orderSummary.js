import { previewReturnedValue } from "../../lib/exchangePreview";

export function getOrderReturnSummary(record, receipt) {
  const returnedQuantities = Object.fromEntries((record.items || []).map((item) => [
    item.id,
    (item.returns || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
  ]));
  const originalTotal = Number(record.total || 0);
  const effectiveTotal = Number(
    record.effectiveTotal ??
    receipt?.effectiveTotal ??
    Math.max(0, originalTotal - previewReturnedValue(record, returnedQuantities)),
  );
  return {
    originalTotal,
    effectiveTotal,
    returnedSaleValue: Math.max(0, originalTotal - effectiveTotal),
  };
}
