export type BranchInventoryBalance = {
  shopId: string;
  productId: string;
  onHand: unknown;
  reserved: unknown;
  product: { name: string; sku: string | null; minimumStock: number; cost: number | null };
};

export function branchProductGroupKey(balance: Pick<BranchInventoryBalance, "shopId" | "productId"> & { product: Pick<BranchInventoryBalance["product"], "name" | "sku"> }): string {
  const sku = balance.product.sku?.trim();
  return sku ? `sku:${sku}` : `product:${balance.shopId}:${balance.productId}`;
}

export function summarizeBranchInventory(balances: BranchInventoryBalance[]) {
  const products = new Map<string, {
    shopId: string;
    productId: string;
    name: string;
    sku: string | null;
    groupKey: string;
    onHand: number;
    available: number;
    minimumStock: number;
    stockValue: number;
  }>();
  for (const balance of balances) {
    const key = `${balance.shopId}:${balance.productId}`;
    const current = products.get(key) ?? {
      shopId: balance.shopId,
      productId: balance.productId,
      name: balance.product.name,
      sku: balance.product.sku,
      groupKey: branchProductGroupKey(balance),
      onHand: 0,
      available: 0,
      minimumStock: balance.product.minimumStock,
      stockValue: 0,
    };
    const onHand = Number(balance.onHand);
    current.onHand += onHand;
    current.available += Math.max(0, onHand - Number(balance.reserved));
    current.stockValue += onHand * Number(balance.product.cost ?? 0);
    products.set(key, current);
  }
  return [...products.values()];
}
