const statusRank = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "partial") return 0;
  if (["unpaid", "credit"].includes(normalized)) return 1;
  if (["paid", "refund", "refunded"].includes(normalized)) return 2;
  if (["cancel", "cancelled", "canceled"].includes(normalized)) return 3;
  return 2;
};

export function comparePaymentWorklistRecords(left, right) {
  const leftRank = statusRank(left.status);
  const rightRank = statusRank(right.status);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const direction = leftRank < 2 ? 1 : -1;
  return direction * ((left.sortAt ?? 0) - (right.sortAt ?? 0)) || String(left.id).localeCompare(String(right.id));
}

export function mapPaymentWorklistRecords(result) {
  return (result.records || []).map((record) => {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Yangon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date(record.occurredAt))
      .replace(/\//g, "-");
    return {
      ...record,
      method: record.method || "",
      date,
      isoDate: date,
      dateLabel:
        record.status === "Paid"
          ? "Paid"
          : record.status === "Partial"
            ? "Partial"
            : "Due",
      sortAt: new Date(record.occurredAt).getTime(),
    };
  }).sort(comparePaymentWorklistRecords);
}
