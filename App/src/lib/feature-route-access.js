export function canAccessFeatureRoute(shop, rule) {
  if (!shop) return false;
  const isOwner = shop.isOwner === true || shop.role === "OWNER";
  if (rule === "staff-access") return Boolean(isOwner || shop.role === "MANAGER");
  if (rule === "branches") return isOwner;
  return Boolean(isOwner || shop.permissions?.includes(rule));
}
