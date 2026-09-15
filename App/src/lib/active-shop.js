export function selectAccessibleShop(shops = [], storedId, fallback) {
  return shops.find((entry) => entry.id === storedId) || fallback || shops[0];
}

export function isShopOwner(shop, userId) {
  return Boolean(
    shop && (
      shop.isOwner === true
      || shop.role === "OWNER"
      || (userId && shop.ownerId === userId)
    )
  );
}

export function normalizeShopAccess(shop, userId) {
  if (!shop) return shop;
  return isShopOwner(shop, userId) ? { ...shop, role: "OWNER", isOwner: true } : shop;
}
