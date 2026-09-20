const activityTime = (entry) => new Date(entry.paidAt || entry.createdAt || 0).getTime();

export function buildPaymentActivity(receipt) {
  return [...new Map([
    ...(receipt?.payments || []),
    ...(receipt?.refunds || []),
  ].map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => activityTime(left) - activityTime(right));
}

export function buildReturnActivity(receipt) {
  return [
    ...(receipt?.returns || []).map((entry) => ({ ...entry, activityType: "return" })),
    ...(receipt?.exchanges || []).map((entry) => ({ ...entry, activityType: "exchange" })),
  ].sort((left, right) => activityTime(left) - activityTime(right));
}
