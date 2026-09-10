import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  shopFindFirst: vi.fn(),
  shopFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  policyFindUnique: vi.fn(),
}));
vi.mock("./prisma.js", () => ({
  prisma: {
    shop: {
      findUnique: mocks.shopFindUnique,
      findFirst: mocks.shopFindFirst,
      findMany: mocks.shopFindMany,
    },
    shopMember: { findUnique: mocks.memberFindUnique },
    shopRolePolicy: { findUnique: mocks.policyFindUnique },
  },
}));

import {
  SHOP_PERMISSIONS,
  assertShopAccess,
  assertShopPermission,
  getShopAccess,
} from "./shop-access.js";

describe("shop access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shopFindUnique.mockResolvedValue({ ownerId: "owner-1" });
    mocks.memberFindUnique.mockResolvedValue(null);
    mocks.policyFindUnique.mockResolvedValue(null);
  });

  it("keeps the owner authoritative with full immutable access", async () => {
    const access = await getShopAccess("owner-1", "shop-1");

    expect(access).toEqual({
      shopId: "shop-1",
      role: "OWNER",
      permissions: [...SHOP_PERMISSIONS],
      isOwner: true,
    });
    expect(mocks.memberFindUnique).not.toHaveBeenCalled();
  });

  it("allows an active assigned member using the Shop role policy", async () => {
    mocks.memberFindUnique.mockResolvedValue({ role: "CASHIER", active: true });
    mocks.policyFindUnique.mockResolvedValue({ permissions: ["sale.create", "payment.receive"] });

    await expect(assertShopPermission("cashier-1", "shop-1", "sale.create")).resolves.toMatchObject({
      role: "CASHIER",
      permissions: ["sale.create", "payment.receive"],
      isOwner: false,
    });
    await expect(assertShopPermission("cashier-1", "shop-1", "payment.refund")).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("denies inactive and unrelated users without exposing the Shop", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "MANAGER", active: false }).mockResolvedValueOnce(null);

    await expect(assertShopAccess("inactive-1", "shop-1")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(assertShopAccess("unrelated-1", "shop-1")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("uses the updated member role on the next access check", async () => {
    mocks.memberFindUnique
      .mockResolvedValueOnce({ role: "CASHIER", active: true })
      .mockResolvedValueOnce({ role: "STOCK_STAFF", active: true });

    await expect(getShopAccess("staff-1", "shop-1")).resolves.toMatchObject({ role: "CASHIER" });
    await expect(getShopAccess("staff-1", "shop-1")).resolves.toMatchObject({ role: "STOCK_STAFF" });
  });

  it("applies the fixed default role boundaries", async () => {
    mocks.memberFindUnique
      .mockResolvedValueOnce({ role: "MANAGER", active: true })
      .mockResolvedValueOnce({ role: "CASHIER", active: true })
      .mockResolvedValueOnce({ role: "STOCK_STAFF", active: true });

    const manager = await getShopAccess("manager-1", "shop-1");
    const cashier = await getShopAccess("cashier-1", "shop-1");
    const stockStaff = await getShopAccess("stock-1", "shop-1");

    expect(manager?.permissions).toContain("payment.refund");
    expect(manager?.permissions).not.toContain("staff.manage");
    expect(cashier?.permissions).toContain("payment.receive");
    expect(cashier?.permissions).not.toContain("payment.refund");
    expect(stockStaff?.permissions).toContain("stock.adjust");
    expect(stockStaff?.permissions).not.toContain("sale.create");
  });
});
