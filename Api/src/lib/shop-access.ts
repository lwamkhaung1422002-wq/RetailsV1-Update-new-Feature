import { prisma } from "./prisma.js";

export const SHOP_ROLES = ["OWNER", "MANAGER", "CASHIER", "STOCK_STAFF"] as const;
export const STAFF_ROLES = ["MANAGER", "CASHIER", "STOCK_STAFF"] as const;
export type ShopRole = typeof SHOP_ROLES[number];
export type StaffRole = typeof STAFF_ROLES[number];

export const SHOP_PERMISSIONS = [
  "sale.create",
  "order.view",
  "order.fulfill",
  "order.cancel",
  "payment.view",
  "payment.receive",
  "payment.refund",
  "payment.void",
  "stock.view",
  "stock.receive",
  "stock.adjust",
  "product.view",
  "product.manage",
  "price.view",
  "price.edit",
  "supplier.view",
  "supplier.manage",
  "supplier.pay",
  "purchase.view",
  "purchase.manage",
  "expense.view",
  "expense.manage",
  "report.viewSales",
  "report.viewCost",
  "report.viewProfit",
  "audit.view",
  "settings.manage",
  "staff.manage",
  "branch.manage",
] as const;
export type ShopPermission = typeof SHOP_PERMISSIONS[number];

const permissionSet = new Set<string>(SHOP_PERMISSIONS);

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, readonly ShopPermission[]> = {
  MANAGER: SHOP_PERMISSIONS.filter((permission) => !["staff.manage", "branch.manage"].includes(permission)),
  CASHIER: [
    "sale.create",
    "order.view",
    "order.fulfill",
    "payment.view",
    "payment.receive",
    "stock.view",
    "product.view",
    "price.view",
    "report.viewSales",
  ],
  STOCK_STAFF: [
    "order.view",
    "stock.view",
    "stock.receive",
    "stock.adjust",
    "product.view",
    "product.manage",
    "supplier.view",
    "purchase.view",
    "purchase.manage",
  ],
};

export type ShopAccess = {
  shopId: string;
  role: ShopRole;
  permissions: ShopPermission[];
  isOwner: boolean;
};

export function publicShop<T extends { approvalPinHash?: unknown }>(shop: T): Omit<T, "approvalPinHash"> {
  const { approvalPinHash, ...details } = shop;
  void approvalPinHash;
  return details;
}

function notFound(): Error {
  return Object.assign(new Error("Shop not found."), { name: "NotFoundError" });
}

function forbidden(): Error {
  return Object.assign(new Error("You do not have permission for this action."), { name: "ForbiddenError" });
}

function policyPermissions(value: unknown, fallback: readonly ShopPermission[]): ShopPermission[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((entry): entry is ShopPermission => typeof entry === "string" && permissionSet.has(entry)))];
}

export function permissionsForRole(role: StaffRole, value?: unknown): ShopPermission[] {
  return policyPermissions(value, DEFAULT_ROLE_PERMISSIONS[role]);
}

export async function getAccessibleShops(userId: string) {
  const shops = await prisma.shop.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId, active: true } } },
      ],
    },
    include: {
      setting: true,
      members: { where: { userId, active: true }, select: { role: true } },
      rolePolicies: { select: { role: true, permissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return shops.map((shop) => {
    const { members, rolePolicies, ...privateDetails } = shop;
    const details = publicShop(privateDetails);
    if (shop.ownerId === userId) {
      return { ...details, role: "OWNER" as const, permissions: [...SHOP_PERMISSIONS], isOwner: true };
    }
    const member = members[0];
    if (!member || !STAFF_ROLES.includes(member.role as StaffRole)) return null;
    const role = member.role as StaffRole;
    const policy = rolePolicies.find((entry) => entry.role === role);
    return { ...details, role, permissions: permissionsForRole(role, policy?.permissions), isOwner: false };
  }).filter((shop) => shop !== null);
}

export async function getShopAccess(userId: string, shopId: string): Promise<ShopAccess | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
  if (!shop) return null;
  if (shop.ownerId === userId) {
    return { shopId, role: "OWNER", permissions: [...SHOP_PERMISSIONS], isOwner: true };
  }

  const member = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId, userId } },
    select: { role: true, active: true },
  });
  if (!member?.active || !STAFF_ROLES.includes(member.role as StaffRole)) return null;

  const role = member.role as StaffRole;
  const policy = await prisma.shopRolePolicy.findUnique({
    where: { shopId_role: { shopId, role } },
    select: { permissions: true },
  });
  return {
    shopId,
    role,
    permissions: permissionsForRole(role, policy?.permissions),
    isOwner: false,
  };
}

export async function assertShopAccess(userId: string, shopId: string): Promise<ShopAccess> {
  const access = await getShopAccess(userId, shopId);
  if (!access) throw notFound();
  return access;
}

export function hasShopPermission(access: ShopAccess, permission: ShopPermission): boolean {
  return access.isOwner || access.permissions.includes(permission);
}

export async function assertShopPermission(
  userId: string,
  shopId: string,
  permission: ShopPermission,
): Promise<ShopAccess> {
  const access = await assertShopAccess(userId, shopId);
  if (!hasShopPermission(access, permission)) throw forbidden();
  return access;
}

export async function userOwnsShop(userId: string, shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findFirst({ where: { id: shopId, ownerId: userId }, select: { id: true } });
  return Boolean(shop);
}

export async function assertShopOwner(userId: string, shopId: string): Promise<void> {
  if (!await userOwnsShop(userId, shopId)) throw notFound();
}

export async function assertUserOwnsShop(userId: string, shopId: string): Promise<void> {
  await assertShopAccess(userId, shopId);
}
