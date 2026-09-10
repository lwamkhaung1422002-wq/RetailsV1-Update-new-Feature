import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const productReportsRouter = Router();
productReportsRouter.use(requireAuth);
const params = z.object({ shopId: z.string().min(1) });
const querySchema = z.object({ categoryId: z.string().optional(), search: z.string().trim().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

productReportsRouter.get("/:shopId/product-report", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const query = querySchema.parse(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const products = await prisma.product.findMany({ where: { shopId, isActive: true, ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { sku: { contains: query.search, mode: "insensitive" } }] } : {}) }, include: { category: true, barcodes: { where: { status: "ACTIVE" }, select: { value: true } }, balances: { select: { onHand: true } }, inventory: { select: { quantity: true, baseQuantity: true } } }, orderBy: { name: "asc" } });
    const inclusiveTo = query.to ? new Date(query.to.getTime() + 86_400_000 - 1) : undefined;
    const sales = await prisma.orderItem.groupBy({ by: ["productId"], where: { order: { shopId, fulfillmentStatus: { not: "cancelled" }, ...(query.from || inclusiveTo ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(inclusiveTo ? { lte: inclusiveTo } : {}) } } : {}) } }, _sum: { quantity: true, lineTotal: true } });
    const sold = new Map(sales.map((row) => [row.productId, { quantity: row._sum.quantity || 0, sales: row._sum.lineTotal || 0 }]));
    const rows = products.map((product) => { const ledgerStock = product.balances.reduce((sum, balance) => sum + Number(balance.onHand), 0); const legacyStock = product.inventory.reduce((sum, batch) => sum + Number(batch.baseQuantity ?? batch.quantity), 0); const stock = product.balances.length ? ledgerStock : legacyStock; const sale = sold.get(product.id) || { quantity: 0, sales: 0 }; return { id: product.id, name: product.name, sku: product.sku, category: product.category, barcode: product.barcodes[0]?.value || null, currentStock: stock, averageCost: product.cost || 0, sellingPrice: product.price, stockValue: stock * (product.cost || 0), minimumStock: product.minimumStock, soldQuantity: sale.quantity, salesAmount: sale.sales, status: stock === 0 ? "OUT_OF_STOCK" : stock <= product.minimumStock ? "LOW_STOCK" : "IN_STOCK" }; });
    const soldProducts = rows.filter((row) => row.soldQuantity > 0);
    const topSellers = [...soldProducts].sort((a, b) => b.soldQuantity - a.soldQuantity).slice(0, 10);
    const slowSellers = [...soldProducts].sort((a, b) => a.soldQuantity - b.soldQuantity).slice(0, 10);
    const noSales = rows.filter((row) => row.soldQuantity === 0);
    response.json({ summary: { totalProducts: rows.length, totalQuantity: rows.reduce((sum, row) => sum + row.currentStock, 0), stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0), lowStockCount: rows.filter((row) => row.status === "LOW_STOCK").length, outOfStockCount: rows.filter((row) => row.status === "OUT_OF_STOCK").length }, products: rows, topSellers, slowSellers, noSales });
  } catch (error) { next(error); }
});
