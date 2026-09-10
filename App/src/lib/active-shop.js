export function selectAccessibleShop(shops = [], storedId, fallback) {
  return shops.find((entry) => entry.id === storedId) || fallback || shops[0];
}
