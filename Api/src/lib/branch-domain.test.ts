import { describe, expect, it } from "vitest";
import { branchProductGroupKey, summarizeBranchInventory } from "./branch-domain.js";

describe("branch inventory identity", () => {
  it("groups only exact non-empty SKUs across branches", () => {
    const first = { shopId: "shop-1", productId: "p-1", product: { name: "Cola", sku: "SKU-1" } };
    const second = { shopId: "shop-2", productId: "p-2", product: { name: "Cola", sku: "SKU-1" } };
    expect(branchProductGroupKey(first)).toBe(branchProductGroupKey(second));
  });

  it("never merges same-name products without a reliable SKU", () => {
    const first = { shopId: "shop-1", productId: "p-1", product: { name: "Cola", sku: null } };
    const second = { shopId: "shop-2", productId: "p-2", product: { name: "Cola", sku: null } };
    expect(branchProductGroupKey(first)).not.toBe(branchProductGroupKey(second));
  });

  it("keeps inventory totals isolated by branch and product", () => {
    const rows = summarizeBranchInventory([
      { shopId: "shop-1", productId: "p-1", onHand: 5, reserved: 1, product: { name: "Cola", sku: "SKU-1", minimumStock: 2, cost: 100 } },
      { shopId: "shop-2", productId: "p-2", onHand: 3, reserved: 0, product: { name: "Cola", sku: "SKU-1", minimumStock: 2, cost: 120 } },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.shopId, row.onHand, row.stockValue])).toEqual([["shop-1", 5, 500], ["shop-2", 3, 360]]);
  });
});
