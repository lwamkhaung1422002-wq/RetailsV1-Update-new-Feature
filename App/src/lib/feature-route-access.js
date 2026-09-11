export function canAccessFeatureRoute(shop, rule) {
  if (!shop) return false;
  if (rule === "staff-access") return Boolean(shop.isOwner || shop.role === "MANAGER");
  if (rule === "branches") return Boolean(shop.isOwner);
  return Boolean(shop.isOwner || shop.permissions?.includes(rule));
}
