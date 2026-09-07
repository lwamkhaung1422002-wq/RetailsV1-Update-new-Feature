import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const dashboardRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const salesReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  trend: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily"),
  payment: z.string().trim().min(1).optional(),
  comparison: z.enum(["period", "month"]).default("period"),
});

const yangonTimeZone = "Asia/Yangon";

type SalesMetrics = {
  totalSales: number;
  orders: number;
  itemsSold: number;
  totalCostPrice: number;
  grossProfit: number;
};

type SalesOrder = {
  id: string;
  total: number;
  fulfillmentStatus: string;
  completedAt: Date | null;
  items: Array<{
    quantity: number;
    unitCost: number;
    lineTotal: number;
    recognizedAt: Date | null;
    product: { category: { name: string } | null };
  }>;
};

type ReportPayment = {
  id: string;
  orderId: string | null;
  orderIds: string | null;
  allocations: string | null;
  originalPaymentId: string | null;
  type: string;
  scope: string | null;
  method: string;
  amount: number;
  paidAt: Date;
};

type DashboardOrder = {
  id: string; orderNumber: string | null; total: number; fulfillmentStatus: string; paymentStatus: string;
  completedAt: Date | null; createdAt: Date;
  customer: { name: string } | null;
  items: Array<{ quantity: number; unitCost: number; recognizedAt: Date | null }>;
};
type DashboardPayment = ReportPayment;
type DashboardExpense = { amount: number };
type DashboardPurchase = {
  id: string; total: number; paidAmount: number; status: string; expectedAt: Date; purchaseNumber: string;
  supplier: { name: string };
  payments: Array<{ amount: number; paidAt: Date; reversedAt: Date | null }>;
};
type DashboardBalance = {
  productId: string; onHand: unknown; reserved: unknown;
  product: { sku: string | null; name: string; minimumStock: number; cost: number | null };
};

function yangonDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: yangonTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function yangonStart(key: string): Date {
  return new Date(`${key}T00:00:00.000+06:30`);
}

function yangonEnd(key: string): Date {
  return new Date(`${key}T23:59:59.999+06:30`);
}

function addCalendarDays(key: string, days: number): string {
  const date = yangonStart(key);
  date.setUTCDate(date.getUTCDate() + days);
  return yangonDateKey(date);
}

function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function startOfWeek(key: string): string {
  const weekday = yangonStart(key).getUTCDay();
  return addCalendarDays(key, -((weekday + 6) % 7));
}

function previousMonthStart(key: string): string {
  const thisMonth = yangonStart(startOfMonth(key));
  thisMonth.setUTCMonth(thisMonth.getUTCMonth() - 1);
  return yangonDateKey(thisMonth);
}

function previousMonthEnd(key: string): string {
  return addCalendarDays(startOfMonth(key), -1);
}

function selectedReportRange(input: z.infer<typeof salesReportQuerySchema>) {
  const today = yangonDateKey(new Date());
  const from = input.from ?? startOfMonth(today);
  const to = input.to ?? today;
  const start = yangonStart(from);
  const end = yangonEnd(to);
  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start.getTime() - 1);
  const previousFrom =
    input.comparison === "month"
      ? previousMonthStart(from)
      : yangonDateKey(
          new Date(previousEnd.getTime() - (days - 1) * 86_400_000),
        );
  const previousTo =
    input.comparison === "month" ? previousMonthEnd(from) : yangonDateKey(previousEnd);
  const previousStart = yangonStart(previousFrom);
  const normalizedPreviousEnd = yangonEnd(previousTo);
  return {
    from,
    to,
    start,
    end,
    previous: {
      from: previousFrom,
      to: previousTo,
      start: previousStart,
      end: normalizedPreviousEnd,
    },
  };
}

function isDateWithin(value: Date | null, start: Date, end: Date): boolean {
  return Boolean(value && value >= start && value <= end);
}

function reportMetrics(orders: SalesOrder[]): SalesMetrics {
  const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
  const itemsSold = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const totalCostPrice = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.unitCost * item.quantity, 0), 0);
  return {
    totalSales,
    orders: orders.length,
    itemsSold,
    totalCostPrice,
    grossProfit: totalSales - totalCostPrice,
  };
}

function growth(current: number, previous: number) {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    percentage: previous === 0 ? null : Number(((change / previous) * 100).toFixed(1)),
  };
}

function dateRange(input: z.infer<typeof querySchema>) {
  if (!input.from && !input.to) return undefined;

  const endOfDay = input.to ? new Date(input.to) : undefined;
  endOfDay?.setHours(23, 59, 59, 999);

  return {
    ...(input.from ? { gte: input.from } : {}),
    ...(endOfDay ? { lte: endOfDay } : {}),
  };
}

function isRecognizedSale(order: {
  fulfillmentStatus: string;
}): boolean {
  return order.fulfillmentStatus === "completed";
}

function recognizedAt(order: {
  completedAt: Date | null;
  items: Array<{ recognizedAt: Date | null }>;
}): Date | null {
  return order.completedAt
    ?? order.items.map((item) => item.recognizedAt).find((value): value is Date => Boolean(value))
    ?? null;
}

function isInRange(value: Date | null, range: ReturnType<typeof dateRange>): boolean {
  if (!value) return false;
  return (!range?.gte || value >= range.gte) && (!range?.lte || value <= range.lte);
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function paidAmountForOrder(orderId: string, payments: Array<{
  orderId: string | null;
  orderIds: string | null;
  allocations: string | null;
  amount: number;
  type: string;
  scope: string | null;
}>): number {
  return payments.reduce((sum, payment) => {
    if (payment.type === "refund" || payment.scope === "cod-settlement-void") {
      return sum;
    }

    if (payment.orderId === orderId) {
      return sum + payment.amount;
    }

    const orderIds = parseJsonArray(payment.orderIds).filter((entry): entry is string => typeof entry === "string");
    if (!orderIds.includes(orderId)) return sum;

    const allocations = parseJsonArray(payment.allocations);
    const allocation = allocations.find((entry) => {
      return typeof entry === "object" && entry !== null && "orderId" in entry && entry.orderId === orderId;
    });

    if (
      typeof allocation === "object" &&
      allocation !== null &&
      "amount" in allocation &&
      typeof allocation.amount === "number"
    ) {
      return sum + allocation.amount;
    }

    return sum;
  }, 0);
}

dashboardRouter.get("/:shopId/dashboard", requireAuth, async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);

    // The home screen is explicitly a *today* dashboard. Keep the date
    // boundary on the server so every client gets the same Yangon business day
    // and cannot accidentally receive all-time financial totals.
    const todayKey = yangonDateKey(new Date());
    const todayRange = { gte: yangonStart(todayKey), lte: yangonEnd(todayKey) };
    const recognitionRange = dateRange(query) ?? todayRange;
    const orderCreatedRange = dateRange(query) ?? todayRange;
    const expenseSpentAt = dateRange(query) ?? todayRange;

    const [rawOrders, rawPayments, rawExpenses, customersCount, productsCount, categoriesCount, rawPurchases, rawBalances] = await Promise.all([
      prisma.order.findMany({
        where: { shopId },
        include: {
          items: true,
          customer: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({ where: { shopId } }),
      prisma.expense.findMany({
        where: {
          shopId,
          ...(expenseSpentAt ? { spentAt: expenseSpentAt } : {}),
          cancelledAt: null,
        },
      }),
      prisma.customer.count({ where: { shopId } }),
      prisma.product.count({ where: { shopId, isActive: true } }),
      prisma.category.count({ where: { shopId } }),
      prisma.purchase.findMany({
        where: { shopId },
        include: { payments: true, supplier: true },
        orderBy: { expectedAt: "asc" },
      }),
      prisma.inventoryBalance.findMany({ where: { shopId }, include: { product: true } }),
    ] as const);
    const orders = rawOrders as DashboardOrder[];
    const payments = rawPayments as DashboardPayment[];
    const expenses = rawExpenses as DashboardExpense[];
    const purchases = rawPurchases as DashboardPurchase[];
    const balances = rawBalances as DashboardBalance[];

    const recognizedOrders = orders.filter((order) =>
      isRecognizedSale(order) && isInRange(recognizedAt(order), recognitionRange),
    );
    const todaySalesOrders = orders.filter((order) =>
      order.fulfillmentStatus !== "cancelled" && isInRange(order.createdAt, orderCreatedRange),
    );
    const todaySales = todaySalesOrders.reduce((sum, order) => sum + order.total, 0);
    // Home's Today Sales is based on orders created during the Yangon business
    // day. Keep Today Profit on that identical order scope, so cancelling an
    // order removes both its revenue and COGS from the two Home metrics.
    // Financial recognition metrics below intentionally retain their existing
    // completed-order/payment scope for reports and other consumers.
    const todayCostOfGoods = todaySalesOrders.reduce(
      (sum, order) =>
        sum + order.items.reduce(
          (itemSum, item) => itemSum + item.unitCost * item.quantity,
          0,
        ),
      0,
    );
    const periodPayments = payments.filter((payment) => isInRange(payment.paidAt, recognitionRange));
    // Refund payments are stored as negative cash movements. Dashboard totals
    // expose refunds as a positive deduction so they reduce revenue/profit and
    // increase cash out instead of being added back in.
    const refunds = periodPayments
      .filter((payment) => payment.type === "refund")
      .reduce((sum, payment) => sum + Math.abs(payment.amount), 0);
    const revenue = recognizedOrders.reduce((sum, order) => sum + order.total, 0) - refunds;
    const costOfGoods = recognizedOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.unitCost * item.quantity,
          0,
        ),
      0,
    );
    const grossProfit = revenue - costOfGoods;
    const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const netProfit = grossProfit - operatingExpenses;
    const todayProfit = todaySales - todayCostOfGoods - operatingExpenses;
    const unpaidTotal = orders
      .filter((order) => isRecognizedSale(order))
      .reduce((sum, order) => sum + Math.max(0, order.total - paidAmountForOrder(order.id, payments)), 0);
    const cashReceived = periodPayments
      .filter((payment) => payment.type === "payment" && payment.scope !== "cod-settlement-void")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const purchasePayments = purchases.flatMap((purchase) => purchase.payments)
      .filter((payment) => !payment.reversedAt && isInRange(payment.paidAt, recognitionRange))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const supplierPayable = purchases.reduce((sum, purchase) => sum + Math.max(0, purchase.total - purchase.paidAmount), 0);
    const inventoryValuation = balances.reduce((sum, balance) =>
      sum + Number(balance.onHand) * Number(balance.product.cost ?? 0), 0);
    const cashBalance = cashReceived - refunds - purchasePayments - operatingExpenses;
    const cashOut = purchasePayments + operatingExpenses + refunds;
    const stockUnits = balances.reduce((sum, balance) => sum + Math.max(0, Number(balance.onHand)), 0);

    // A product can have several receipt batches and locations. Low-stock is a
    // product-level decision, therefore aggregate its available stock first
    // and use the product's configured minimum instead of a hard-coded 5 pcs.
    const stockByProduct = new Map<string, {
      productId: string;
      productCode: string | null;
      productName: string;
      minimumStock: number;
      availableQuantity: number;
    }>();
    for (const balance of balances) {
      const current = stockByProduct.get(balance.productId) ?? {
        productId: balance.productId,
        productCode: balance.product.sku,
        productName: balance.product.name,
        minimumStock: balance.product.minimumStock,
        availableQuantity: 0,
      };
      current.availableQuantity += Math.max(0, Number(balance.onHand) - Number(balance.reserved));
      stockByProduct.set(balance.productId, current);
    }
    const lowStock = [...stockByProduct.values()]
      .filter((product) => product.availableQuantity > 0 && product.availableQuantity <= product.minimumStock)
      .sort((a, b) => a.availableQuantity - b.availableQuantity);

    const paymentMethodForOrder = (orderId: string) => payments
      .filter((payment) => {
        if (payment.type !== "payment" || payment.scope === "cod-settlement-void") return false;
        if (payment.orderId === orderId) return true;
        return parseJsonArray(payment.orderIds).some((entry) => entry === orderId);
      })
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0]?.method ?? "ငွေသား";

    const recentSales = todaySalesOrders
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((order) => ({
        id: order.id,
        invoiceNumber: order.orderNumber ?? order.id.slice(-6).toUpperCase(),
        customerName: order.customer?.name ?? "လမ်းလျှောက်ဝယ်သူ",
        amount: order.total,
        paymentStatus: order.paymentStatus,
        paymentMethod: paymentMethodForOrder(order.id),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        completedAt: recognizedAt(order) ?? order.createdAt,
      }));

    const upcomingPayables = purchases
      .filter((purchase) => purchase.status !== "cancelled" && purchase.total > purchase.paidAmount)
      .slice(0, 6)
      .map((purchase) => ({
        id: purchase.id,
        supplierName: purchase.supplier.name,
        amount: Math.max(0, purchase.total - purchase.paidAmount),
        dueDate: purchase.expectedAt,
        purchaseNumber: purchase.purchaseNumber,
      }));

    response.status(200).json({
      summary: {
        revenue,
        todaySales,
        todayProfit,
        costOfGoods,
        grossProfit,
        operatingExpenses,
        netProfit,
        unpaidTotal,
        customerReceivables: unpaidTotal,
        supplierPayables: supplierPayable,
        cashReceived,
        purchasePayments,
        refunds,
        cashOut,
        cashBalance,
        inventoryValuation,
        salesCount: recognizedOrders.length,
        ordersCount: orders.length,
        customersCount,
        activeProductsCount: productsCount,
        categoriesCount,
        stockUnits,
      },
      lowStock,
      recentSales,
      upcomingPayables,
    });
  } catch (error) {
    next(error);
  }
});

export async function salesReportHandler(request: Parameters<typeof dashboardRouter.get>[1] extends (...args: infer Args) => unknown ? Args[0] : never, response: Parameters<typeof dashboardRouter.get>[1] extends (...args: infer Args) => unknown ? Args[1] : never, next: Parameters<typeof dashboardRouter.get>[1] extends (...args: infer Args) => unknown ? Args[2] : never) {
  try {
    const { shopId } = paramsSchema.parse(request.params);
    const query = salesReportQuerySchema.parse(request.query);
    const isLocalDemoRequest = process.env.NODE_ENV !== "production"
      && shopId === "sales-analytics-demo-shop"
      && request.query.demo === "true";

    if (!isLocalDemoRequest) {
      const authUser = getAuthUser(request);
      await assertUserOwnsShop(authUser.id, shopId);
    }

    const range = selectedReportRange(query);

    const [rawOrders, rawPayments] = await Promise.all([
      prisma.order.findMany({
      where: { shopId },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({ where: { shopId } }),
    ] as const);
    const orders = rawOrders as SalesOrder[];
    const payments = rawPayments as ReportPayment[];

    const completedOrders = orders.filter((order) => isRecognizedSale(order));
    const completedOrderIds = new Set(completedOrders.map((order) => order.id));
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const paymentOrderIds = (payment: ReportPayment): string[] => {
      if (payment.orderId) return [payment.orderId];
      const allocationIds = parseJsonArray(payment.allocations)
        .flatMap((entry) => typeof entry === "object" && entry !== null && "orderId" in entry && typeof entry.orderId === "string" ? [entry.orderId] : []);
      if (allocationIds.length) return allocationIds;
      return parseJsonArray(payment.orderIds).filter((entry): entry is string => typeof entry === "string");
    };
    const matchingOrderIdsForMethod = new Set(
      payments
        .filter((payment) => payment.type === "payment" && payment.scope !== "cod-settlement-void" && (!query.payment || payment.method === query.payment))
        .flatMap((payment) => paymentOrderIds(payment as ReportPayment)),
    );
    const inRange = (order: SalesOrder, start: Date, end: Date) => isDateWithin(recognizedAt(order), start, end);
    const selectOrders = (start: Date, end: Date) => completedOrders.filter((order) =>
      inRange(order, start, end) && (!query.payment || matchingOrderIdsForMethod.has(order.id)),
    );
    const currentOrders = selectOrders(range.start, range.end);
    const previousOrders = selectOrders(range.previous.start, range.previous.end);
    const currentMetrics = reportMetrics(currentOrders);
    const previousMetrics = reportMetrics(previousOrders);

    const trendKey = (date: Date): string => {
      const key = yangonDateKey(date);
      if (query.trend === "daily") return key;
      if (query.trend === "weekly") return startOfWeek(key);
      if (query.trend === "monthly") return key.slice(0, 7);
      return key.slice(0, 4);
    };
    const trend = [...currentOrders.reduce((buckets, order) => {
      const recognized = recognizedAt(order);
      if (!recognized) return buckets;
      const key = trendKey(recognized);
      const current = buckets.get(key) ?? { key, sales: 0, orders: 0 };
      current.sales += order.total;
      current.orders += 1;
      buckets.set(key, current);
      return buckets;
    }, new Map<string, { key: string; sales: number; orders: number }>()).values()].sort((left, right) => left.key.localeCompare(right.key));

    const categories = [...currentOrders.flatMap((order) => order.items).reduce((groups, item) => {
      const name = item.product.category?.name ?? "Uncategorized";
      groups.set(name, (groups.get(name) ?? 0) + item.lineTotal);
      return groups;
    }, new Map<string, number>()).entries()]
      .map(([name, amount]) => ({ name, amount, percentage: currentMetrics.totalSales === 0 ? 0 : Number(((amount / currentMetrics.totalSales) * 100).toFixed(1)) }))
      .sort((left, right) => right.amount - left.amount);

    const paymentCollections = [...payments.reduce((groups, payment) => {
      if (payment.scope === "cod-settlement-void" || !isDateWithin(payment.paidAt, range.start, range.end)) return groups;
      const linkedOrderIds = paymentOrderIds(payment as ReportPayment).filter((orderId) => completedOrderIds.has(orderId));
      const method = payment.type === "refund"
        ? paymentById.get(payment.originalPaymentId ?? "")?.method ?? payment.method
        : payment.method;
      if (!linkedOrderIds.length || (query.payment && method !== query.payment)) return groups;
      const sign = payment.type === "refund" ? -1 : payment.type === "payment" ? 1 : 0;
      if (sign === 0) return groups;
      groups.set(method, (groups.get(method) ?? 0) + sign * payment.amount);
      return groups;
    }, new Map<string, number>()).entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([method, amount]) => ({ method, amount }))
      .sort((left, right) => right.amount - left.amount);
    const collectionTotal = paymentCollections.reduce((sum, entry) => sum + entry.amount, 0);

    const todayKey = yangonDateKey(new Date());
    const weekStart = startOfWeek(todayKey);
    const lastWeekEnd = addCalendarDays(weekStart, -1);
    const lastWeekStart = addCalendarDays(lastWeekEnd, -6);
    const monthStart = startOfMonth(todayKey);
    const lastMonthStart = previousMonthStart(todayKey);
    const lastMonthEnd = previousMonthEnd(todayKey);
    const summaryRange = (label: string, from: string, to: string) => ({
      label,
      ...reportMetrics(selectOrders(yangonStart(from), yangonEnd(to))),
    });
    const salesSummary = [
      summaryRange("Today", todayKey, todayKey),
      summaryRange("This Week", weekStart, todayKey),
      summaryRange("Last Week", lastWeekStart, lastWeekEnd),
      summaryRange("This Month", monthStart, todayKey),
      summaryRange("Last Month", lastMonthStart, lastMonthEnd),
    ];
    const comparison = [
      ["Total Sales", currentMetrics.totalSales, previousMetrics.totalSales],
      ["Orders", currentMetrics.orders, previousMetrics.orders],
      ["Items Sold", currentMetrics.itemsSold, previousMetrics.itemsSold],
      ["Total Cost Price", currentMetrics.totalCostPrice, previousMetrics.totalCostPrice],
      ["Gross Profit", currentMetrics.grossProfit, previousMetrics.grossProfit],
    ].map(([metric, current, previous]) => ({
      metric,
      ...growth(current as number, previous as number),
    }));

    response.status(200).json({
      range: {
        from: range.from,
        to: range.to,
        previous: { from: range.previous.from, to: range.previous.to },
      },
      summary: Object.fromEntries(Object.entries(currentMetrics).map(([key, value]) => [key, growth(value, previousMetrics[key as keyof SalesMetrics])])),
      trend,
      categories,
      paymentCollections: paymentCollections.map((entry) => ({
        ...entry,
        percentage: collectionTotal === 0 ? 0 : Number(((entry.amount / collectionTotal) * 100).toFixed(1)),
      })),
      collectionTotal,
      salesSummary,
      comparison,
    });
  } catch (error) {
    next(error);
  }
}

dashboardRouter.get("/:shopId/reports/sales", requireAuth, salesReportHandler);
