import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.JWT_SECRET = "manager-approval-test-secret-at-least-32-characters";
  return { assertShopAccess: vi.fn(), hasShopPermission: vi.fn() };
});
vi.mock("./shop-access.js", () => ({
  assertShopAccess: mocks.assertShopAccess,
  hasShopPermission: mocks.hasShopPermission,
}));

import { approvalAuditMetadata, authorizeSensitiveAction, signManagerApproval } from "./manager-approval.js";

const access = { shopId: "shop-1", role: "CASHIER", permissions: [], isOwner: false };
const claims = {
  kind: "manager-approval" as const,
  requesterId: "cashier-1",
  approverId: "manager-1",
  approverRole: "MANAGER" as const,
  shopId: "shop-1",
  action: "payment.refund" as const,
  permission: "payment.refund" as const,
  targetId: "order-1",
  reason: "Customer request",
};

describe("manager approval authorization", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.assertShopAccess.mockResolvedValue(access);
    mocks.hasShopPermission.mockReturnValue(false);
  });

  afterEach(() => vi.useRealTimers());

  it("keeps direct permission authorization unchanged", async () => {
    mocks.hasShopPermission.mockReturnValue(true);

    await expect(authorizeSensitiveAction({ requesterId: "manager-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", approvalToken: undefined })).resolves.toEqual({
      actorRole: "CASHIER",
      authorizationMode: "direct",
    });
  });

  it("accepts a same-Shop Manager approval bound to the requester, action, and target", async () => {
    const token = signManagerApproval(claims);

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", approvalToken: token })).resolves.toEqual({
      actorRole: "CASHIER",
      authorizationMode: "manager-override",
      approvedById: "manager-1",
      approvedByRole: "MANAGER",
      reason: "Customer request",
    });
  });

  it("stores the actor and approver in audit metadata", () => {
    expect(approvalAuditMetadata({ actorRole: "CASHIER", authorizationMode: "manager-override", approvedById: "manager-1", approvedByRole: "MANAGER", reason: "Customer request" })).toEqual({
      actorRole: "CASHIER",
      authorizationMode: "manager-override",
      approvedById: "manager-1",
      approvedByRole: "MANAGER",
      approvalReason: "Customer request",
    });
  });

  it("rejects approval for another action, target, Shop, or requester", async () => {
    const token = signManagerApproval(claims);

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "order.cancel", targetId: "order-1", approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-2", approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-2", action: "payment.refund", targetId: "order-1", approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(authorizeSensitiveAction({ requesterId: "cashier-2", shopId: "shop-1", action: "payment.refund", targetId: "order-1", approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("rejects an expired approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
    const token = signManagerApproval(claims);
    vi.setSystemTime(new Date("2026-09-10T00:02:00.000Z"));

    await expect(authorizeSensitiveAction({ requesterId: "cashier-1", shopId: "shop-1", action: "payment.refund", targetId: "order-1", approvalToken: token })).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
