import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.JWT_SECRET = "manager-approval-test-secret-at-least-32-characters";
  return { assertShopAccess: vi.fn(), hasShopPermission: vi.fn(), consume: vi.fn() };
});
vi.mock("./shop-access.js", () => ({
  assertShopAccess: mocks.assertShopAccess,
  hasShopPermission: mocks.hasShopPermission,
}));

import {
  approvalAuditMetadata,
  approvalPayloadFingerprint,
  authorizeSensitiveAction,
  consumeManagerApproval,
  signManagerApproval,
  type ManagerApprovalAction,
} from "./manager-approval.js";

const access = { shopId: "shop-1", role: "CASHIER", permissions: [], isOwner: false };
const refundPayload = { orderId: "order-1", amount: 20_000, method: "Cash", originalPaymentId: "payment-1", note: "Customer request" };
const claimsFor = (action: ManagerApprovalAction, targetId: string, payload: unknown) => ({
  kind: "manager-approval" as const,
  requesterId: "cashier-1",
  approverId: "manager-1",
  approverRole: "MANAGER" as const,
  shopId: "shop-1",
  action,
  permission: ({
    "payment.refund": "payment.refund",
    "order.cancel": "order.cancel",
    "stock.adjust": "stock.adjust",
    "price.override": "price.edit",
    "supplier.payment.reverse": "supplier.pay",
  } as const)[action],
  targetId,
  payloadHash: approvalPayloadFingerprint(action, payload),
  reason: "Customer request",
  jti: "approval-1",
});

describe("manager approval authorization", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.assertShopAccess.mockResolvedValue(access);
    mocks.hasShopPermission.mockReturnValue(false);
    mocks.consume.mockResolvedValue({ count: 1 });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps direct permission authorization unchanged without consuming a token", async () => {
    mocks.hasShopPermission.mockReturnValue(true);
    const authorization = await authorizeSensitiveAction({ requesterId: "manager-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", payload: refundPayload, approvalToken: undefined });

    expect(authorization).toEqual({ actorRole: "CASHIER", authorizationMode: "direct" });
    await consumeManagerApproval({ managerApprovalToken: { updateMany: mocks.consume } } as never, authorization);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("accepts the same requester, Shop, action, target, and payload", async () => {
    const token = signManagerApproval(claimsFor("payment.refund", "order-1", refundPayload));

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", payload: { method: "Cash", amount: 20_000, note: "Customer request", orderId: "order-1", originalPaymentId: "payment-1" }, approvalToken: token })).resolves.toEqual({
      actorRole: "CASHIER",
      authorizationMode: "manager-override",
      approvedById: "manager-1",
      approvedByRole: "MANAGER",
      reason: "Customer request",
      approvalTokenId: "approval-1",
    });
  });

  it("rejects PINs and token-like secrets from approval fingerprints", () => {
    expect(() => approvalPayloadFingerprint("payment.refund", { ...refundPayload, pin: "123456" })).toThrow(/protected field/i);
    expect(() => approvalPayloadFingerprint("payment.refund", { ...refundPayload, approvalToken: "secret" })).toThrow(/protected field/i);
  });

  it.each([
    ["changed refund amount", "payment.refund" as const, "order-1", refundPayload, { ...refundPayload, amount: 30_000 }],
    ["changed stock quantity", "stock.adjust" as const, "product-1", { mode: "batch", productId: "product-1", inventoryBatchId: "batch-1", action: "SUB", quantity: 2, reason: "Damage", staffName: "Cashier" }, { mode: "batch", productId: "product-1", inventoryBatchId: "batch-1", action: "SUB", quantity: 3, reason: "Damage", staffName: "Cashier" }],
    ["changed price payload", "price.override" as const, "product-1", { productId: "product-1", unitPrice: 10_000, effectiveFrom: "2026-09-11T00:00:00.000Z", reason: "Price update" }, { productId: "product-1", unitPrice: 12_000, effectiveFrom: "2026-09-11T00:00:00.000Z", reason: "Price update" }],
  ])("rejects a %s", async (_label, action, targetId, approvedPayload, actualPayload) => {
    const token = signManagerApproval(claimsFor(action, targetId, approvedPayload));
    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action, targetId, payload: actualPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("rejects another action, target, Shop, or requester", async () => {
    const token = signManagerApproval(claimsFor("payment.refund", "order-1", refundPayload));

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "order.cancel", targetId: "order-1", payload: refundPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-2", payload: refundPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-2", action: "payment.refund", targetId: "order-1", payload: refundPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-2", shopId: "shop-1", action: "payment.refund", targetId: "order-1", payload: refundPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("rejects an expired approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    const token = signManagerApproval(claimsFor("payment.refund", "order-1", refundPayload));
    vi.setSystemTime(new Date("2026-09-11T00:02:00.000Z"));

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", payload: refundPayload, approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("consumes a manager approval once and rejects replay", async () => {
    const authorization = { actorRole: "CASHIER" as const, authorizationMode: "manager-override" as const, approvalTokenId: "approval-1" };
    const tx = { managerApprovalToken: { updateMany: mocks.consume } } as never;

    await expect(consumeManagerApproval(tx, authorization)).resolves.toBeUndefined();
    mocks.consume.mockResolvedValueOnce({ count: 0 });
    await expect(consumeManagerApproval(tx, authorization)).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("stores actor and approver details in AuditLog metadata", () => {
    expect(approvalAuditMetadata({ actorRole: "CASHIER", authorizationMode: "manager-override", approvedById: "manager-1", approvedByRole: "MANAGER", reason: "Customer request" })).toEqual({
      actorRole: "CASHIER",
      authorizationMode: "manager-override",
      approvedById: "manager-1",
      approvedByRole: "MANAGER",
      approvalReason: "Customer request",
    });
  });
});
