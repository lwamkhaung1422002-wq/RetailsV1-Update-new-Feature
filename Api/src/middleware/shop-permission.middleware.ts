import type { NextFunction, Request, Response } from "express";

import { assertShopAccess, assertShopPermission, type ShopPermission } from "../lib/shop-access.js";
import { getAuthUser } from "./auth.middleware.js";

export function permissionForRequest(method: string, path: string): ShopPermission | null {
  const write = method !== "GET" && method !== "HEAD";
  if (path === "staff" || path.startsWith("staff/") || path === "role-policies" || path.startsWith("role-policies/")) return "staff.manage";
  if (path === "audit-logs" || path.startsWith("audit-logs/") || path === "operations") return "audit.view";
  if (path === "dashboard" || path === "reports/sales" || path === "product-report") return "report.viewSales";
  if (path === "settings") return write ? "settings.manage" : null;
  if (path.startsWith("orders")) {
    if (!write) return "order.view";
    if (/^orders\/[^/]+\/fulfill$/.test(path) || /^orders\/[^/]+\/status$/.test(path)) return "order.fulfill";
    if (/^orders\/[^/]+\/cancel$/.test(path) || (/^orders\/[^/]+$/.test(path) && method === "DELETE")) return "order.cancel";
    if (/^orders\/[^/]+\/payments$/.test(path)) return "payment.receive";
    if (/^orders\/[^/]+\/refunds$/.test(path)) return "payment.refund";
    return "sale.create";
  }
  if (path === "payments" || path.startsWith("payments/") || path === "payment-history") {
    if (!write) return "payment.view";
    if (path.endsWith("/void")) return "payment.void";
    return "payment.receive";
  }
  if (path === "inventory" || path.startsWith("inventory/") || path === "inventory-adjustments" || path === "inventory-movements") {
    if (!write) return "stock.view";
    if (path.includes("adjustment")) return "stock.adjust";
    return "stock.receive";
  }
  if (path === "products" || path.startsWith("products/") || path === "categories" || path.startsWith("categories/")) return write ? "product.manage" : "product.view";
  if (path.startsWith("pricing") || path === "prices" || path.startsWith("prices/") || path.startsWith("promotions") || path.startsWith("promotion-") || path.startsWith("barcodes") || path.startsWith("barcode-")) return write ? "price.edit" : "price.view";
  if (path === "suppliers" || path.startsWith("suppliers/") || path.startsWith("supplier-delivery")) {
    if (write && (path.includes("/payments") || path.endsWith("/payable-purchase"))) return "supplier.pay";
    return write ? "supplier.manage" : "supplier.view";
  }
  if (path === "purchases" || path.startsWith("purchases/")) {
    if (write && path.includes("/payments")) return "supplier.pay";
    return write ? "purchase.manage" : "purchase.view";
  }
  if (path === "expenses" || path.startsWith("expenses/")) return write ? "expense.manage" : "expense.view";
  if (path === "customers" || path.startsWith("customers/")) return write ? "sale.create" : "order.view";
  if (path.startsWith("notifications")) return "order.view";
  if (path.startsWith("store-config") || path.startsWith("capabilities") || path.startsWith("units") || path.startsWith("locations") || path.startsWith("lots") || path.startsWith("serials") || path.startsWith("recipes") || path.startsWith("warranties")) return write ? "product.manage" : "product.view";
  return "settings.manage";
}

export async function enforceShopPermission(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const segments = request.path.split("/").filter(Boolean);
    if (!segments.length) {
      next();
      return;
    }
    const [shopId, ...resourceSegments] = segments;
    if (!shopId) {
      next();
      return;
    }
    const auth = getAuthUser(request);
    const permission = permissionForRequest(request.method, resourceSegments.join("/"));
    if (permission) await assertShopPermission(auth.id, shopId, permission);
    else await assertShopAccess(auth.id, shopId);
    next();
  } catch (error) {
    next(error);
  }
}
