export const yangonDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const sevenDaysAfter = (today) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
};

export const isActiveCustomerCredit = (record) => record.kind === "sale"
  && Boolean(record.customerId)
  && record.paymentTracking === true
  && Number(record.remainingAmount) > 0
  && !["Cancel", "Cancelled"].includes(record.status);

export const creditDueState = (record, today = yangonDateKey()) => {
  if (!record.dueAt) return "Open";
  const due = yangonDateKey(record.dueAt);
  if (due < today) return "Overdue";
  return due <= sevenDaysAfter(today) ? "Due Soon" : "Open";
};

export function customerCreditSummary(records, today = yangonDateKey()) {
  const active = records.filter(isActiveCustomerCredit);
  return {
    outstanding: active.reduce((sum, record) => sum + Number(record.remainingAmount), 0),
    overdue: active.filter((record) => creditDueState(record, today) === "Overdue").reduce((sum, record) => sum + Number(record.remainingAmount), 0),
    dueSoon: active.filter((record) => creditDueState(record, today) === "Due Soon").reduce((sum, record) => sum + Number(record.remainingAmount), 0),
    customers: new Set(active.map((record) => record.customerId)).size,
  };
}

export function filterCustomerCredit(records, { search = "", filter = "All", today = yangonDateKey() } = {}) {
  const query = search.trim().toLowerCase();
  return records.filter((record) => {
    if (!isActiveCustomerCredit(record)) return false;
    const dueState = creditDueState(record, today);
    return (!query || [record.customerName, record.id].some((value) => String(value || "").toLowerCase().includes(query)))
      && (filter === "All" || (filter === "Open" ? dueState !== "Overdue" : dueState === filter));
  });
}
