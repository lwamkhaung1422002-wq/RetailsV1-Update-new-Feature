import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";

import type { Prisma } from "../generated/prisma/client.js";
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
  payloadHash: string;
  reason: string;
  jti: string;
};

export type ActionAuthorization = {
  actorRole: ShopRole;
  authorizationMode: "direct" | "manager-override";
  approvedById?: string;
  approvedByRole?: ShopRole;
  reason?: string;
  approvalTokenId?: string;
};

function approvalSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) throw new Error("JWT_SECRET is not defined.");
  return secret;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { name: "ForbiddenError" });
}

const forbiddenPayloadKeys = new Set(["pin", "password", "secret", "token", "approvaltoken"]);

function canonicalPayload(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw forbidden("Approval payload is invalid.");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => {
        if (forbiddenPayloadKeys.has(key.toLowerCase())) throw forbidden("Approval payload contains a protected field.");
        return [key, canonicalPayload(entry)];
      }));
  }
  throw forbidden("Approval payload is invalid.");
}

export function approvalPayloadFingerprint(action: ManagerApprovalAction, payload: unknown): string {
  return createHash("sha256").update(JSON.stringify({ action, payload: canonicalPayload(payload) })).digest("hex");
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
  payload: unknown;
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
    || claims.payloadHash !== approvalPayloadFingerprint(input.action, input.payload)
  ) throw forbidden("Approval does not match this action.");
  return {
    actorRole: access.role,
    authorizationMode: "manager-override",
    approvedById: claims.approverId,
    approvedByRole: claims.approverRole,
    reason: claims.reason,
    approvalTokenId: claims.jti,
  };
}

export async function consumeManagerApproval(
  tx: Pick<Prisma.TransactionClient, "managerApprovalToken">,
  authorization: ActionAuthorization,
): Promise<void> {
  if (authorization.authorizationMode === "direct") return;
  if (!authorization.approvalTokenId) throw forbidden("Approval is invalid or expired.");
  const consumed = await tx.managerApprovalToken.updateMany({
    where: { id: authorization.approvalTokenId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw forbidden("Approval has already been used or expired.");
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
