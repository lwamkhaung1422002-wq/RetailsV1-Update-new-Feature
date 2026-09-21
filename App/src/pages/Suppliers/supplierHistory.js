const historyTimestamp = (record) => {
  const value = new Date(record.receivedAt || record.createdAt || record.updatedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

export function buildSupplierHistoryOptions(records = []) {
  const sorted = [...records].sort((left, right) => {
    const byDate = historyTimestamp(right) - historyTimestamp(left);
    return byDate || String(right.id || "").localeCompare(String(left.id || ""));
  });
  const byName = new Map();
  for (const record of sorted) {
    const name = String(record.supplierName || record.supplier?.name || "").trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const phone = String(record.supplierPhone || record.supplier?.phone || "").trim();
    const existing = byName.get(key);
    if (!existing) byName.set(key, { name, phone });
    else if (!existing.phone && phone) existing.phone = phone;
  }
  return [...byName.values()];
}
