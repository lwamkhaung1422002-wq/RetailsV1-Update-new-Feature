import { describe, expect, it } from "vitest";
import { isShopOwner, normalizeShopAccess, selectAccessibleShop } from "./active-shop";

describe("active branch restoration", () => {
  const shops = [{ id: "main", role: "OWNER" }, { id: "hledan", role: "MANAGER" }];

  it("restores a branch only while it remains accessible", () => {
    expect(selectAccessibleShop(shops, "hledan")).toEqual(shops[1]);
    expect(selectAccessibleShop(shops, "removed")).toEqual(shops[0]);
  });

  it("preserves the role carried by each Shop", () => {
    expect(selectAccessibleShop(shops, "main").role).toBe("OWNER");
    expect(selectAccessibleShop(shops, "hledan").role).toBe("MANAGER");
  });

  it("recognizes owner access when older responses omit isOwner", () => {
    expect(isShopOwner({ role: "OWNER" })).toBe(true);
    expect(isShopOwner({ ownerId: "user-1" }, "user-1")).toBe(true);
    expect(isShopOwner({ role: "MANAGER", ownerId: "user-2" }, "user-1")).toBe(false);
  });

  it("normalizes owner shops for every owner-only UI check", () => {
    expect(normalizeShopAccess({ id: "main", role: "OWNER" })).toMatchObject({
      id: "main",
      role: "OWNER",
      isOwner: true,
    });
  });
});
