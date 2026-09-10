import jwt from "jsonwebtoken";

import { assertShopAccess, hasShopPermission, type ShopAccess, type ShopPermission, type ShopRole } from "./shop-access.js";

export const MANAGER_APPROVAL_ACTIONS = {
  "payment.refund": "payment.refund",
  "order.cancel": "order.cancel",
  "stock.adjust": "stock.adjust",
  "price.override": "price.edit",
  "supplier.payment.reverse": "supplier.pay",
} as const satisfies Record<string, ShopPermission>;
export type ManagerApprovalAction = keyof typeof MANAGER_APPROVAL_ACTIONS;

type ApprovalClaims = {
  kind: "manager-approval";
  requesterId: string;
  approverId: string;
  approverRole: ShopRole;
  shopId: string;
  action: ManagerApprovalAction;
  permission: ShopPermission;
  targetId: string;
  reason: string;
};

export type ActionAuthorization = {
  actorRole: ShopRole;
  authorizationMode: "direct" | "manager-override";
  approvedById?: string;
  approvedByRole?: ShopRole;
  reason?: string;
};

function approvalSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) throw new Error("JWT_SECRET is not defined.");
  return secret;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { name: "ForbiddenError" });
}

export function signManagerApproval(input: ApprovalClaims): string {
  return jwt.sign(input, approvalSecret(), { expiresIn: "90s", audience: "retail-manager-approval", issuer: "retail-v1" });
}

export function verifyManagerApproval(token: string): ApprovalClaims {
  const payload = jwt.verify(token, approvalSecret(), { audience: "retail-manager-approval", issuer: "retail-v1" });
  if (typeof payload !== "object" || payload === null || payload.kind !== "manager-approval") throw forbidden("Approval is invalid or expired.");
  return payload as ApprovalClaims;
}

export async function authorizeSensitiveAction(input: {
  requesterId: string;
  shopId: string;
  action: ManagerApprovalAction;
  targetId: string;
  approvalToken: string | undefined;
}): Promise<ActionAuthorization> {
  const access = await assertShopAccess(input.requesterId, input.shopId);
  const permission = MANAGER_APPROVAL_ACTIONS[input.action];
  if (hasShopPermission(access, permission)) return { actorRole: access.role, authorizationMode: "direct" };
  if (!input.approvalToken) throw forbidden("Manager approval is required.");

  let claims: ApprovalClaims;
  try {
    claims = verifyManagerApproval(input.approvalToken);
  } catch {
    throw forbidden("Approval is invalid or expired.");
  }
  if (
    claims.requesterId !== input.requesterId
    || claims.shopId !== input.shopId
    || claims.action !== input.action
    || claims.permission !== permission
    || claims.targetId !== input.targetId
  ) throw forbidden("Approval does not match this action.");
  return {
    actorRole: access.role,
    authorizationMode: "manager-override",
    approvedById: claims.approverId,
    approvedByRole: claims.approverRole,
    reason: claims.reason,
  };
}

export function approvalAuditMetadata(authorization: ActionAuthorization) {
  return {
    actorRole: authorization.actorRole,
    authorizationMode: authorization.authorizationMode,
    ...(authorization.approvedById ? { approvedById: authorization.approvedById } : {}),
    ...(authorization.approvedByRole ? { approvedByRole: authorization.approvedByRole } : {}),
    ...(authorization.reason ? { approvalReason: authorization.reason } : {}),
  };
}

export function approvalAccessToken(headers: Record<string, unknown>): string | undefined {
  const value = headers["x-manager-approval"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
