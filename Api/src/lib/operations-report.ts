export const OPERATION_GROUPS = ["Sales", "Inventory", "Supplier/Payments", "Staff Activity", "Sensitive Actions"] as const;
export type OperationGroup = typeof OPERATION_GROUPS[number];

export function operationGroup(action: string, authorizationMode?: unknown): OperationGroup {
  if (authorizationMode === "manager-override" || /(?:refund|cancel|reverse|adjust)/i.test(action)) return "Sensitive Actions";
  if (action.startsWith("order.")) return "Sales";
  if (action.startsWith("inventory.") || action.startsWith("product.")) return "Inventory";
  if (action.startsWith("staff.") || action.startsWith("role.") || action.startsWith("branch.")) return "Staff Activity";
  return "Supplier/Payments";
}

export function operationSummary(logs: Array<{ action: string; metadata: unknown }>) {
  const managerApproval = (metadata: unknown) => typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && "authorizationMode" in metadata && metadata.authorizationMode === "manager-override";
  return {
    orders: logs.filter((log) => log.action === "order.create").length,
    cancelled: logs.filter((log) => log.action === "order.cancel").length,
    refunds: logs.filter((log) => log.action === "payment.refund").length,
    stockAdjustments: logs.filter((log) => log.action === "inventory.adjust").length,
    paymentReversals: logs.filter((log) => log.action.includes("payment.reverse") || log.action === "payment.codSettlementVoid").length,
    managerApprovals: logs.filter((log) => managerApproval(log.metadata)).length,
  };
}
