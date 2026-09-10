import { describe, expect, it } from "vitest";
import { selectAccessibleShop } from "./active-shop";

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
});
