import { Router } from "express";
import { z } from "zod";

import { assertShopAccess, assertShopPermission, assertUserOwnsShop, hasShopPermission } from "../lib/shop-access.js";
import type { ShopAccess, ShopPermission } from "../lib/shop-access.js";
import { effectiveOrderTotal } from "../lib/order-return-refund.js";
import { orderPaymentEntries } from "../lib/order-payment-balance.js";
import { effectiveCustomerCredit, loadCustomerCredit } from "../lib/customer-credit.js";
import { prisma } from "../lib/prisma.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const customersRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().optional(),
  email: z.email().trim().toLowerCase().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  creditLimitOverride: z.number().int().min(0).nullable().optional(),
  paymentTermsDaysOverride: z.number().int().min(0).max(3650).nullable().optional(),
});

const updateCustomerSchema = customerSchema.partial();
const customerView = <T extends { creditLimitOverride?: number | null; paymentTermsDaysOverride?: number | null; _count?: { orders: number } }>(customer: T, settings: { defaultCreditLimit?: number; defaultPaymentTermsDays?: number } | null) => {
  const { _count, ...details } = customer;
  return {
    ...details,
    ...effectiveCustomerCredit(customer, settings),
    hasHistory: (_count?.orders ?? 0) > 0,
  };
};
function requirePermission(access: ShopAccess, permission: ShopPermission) {
  if (hasShopPermission(access, permission)) return;
  throw Object.assign(new Error("You do not have permission for this action."), { name: "ForbiddenError" });
}
function assertCustomerFields(access: ShopAccess, input: z.infer<typeof updateCustomerSchema>) {
  if (["name", "phone", "email", "address", "city", "notes"].some((field) => field in input)) requirePermission(access, "sale.create");
  if ("creditLimitOverride" in input || "paymentTermsDaysOverride" in input) requirePermission(access, "settings.manage");
}
const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(["createdAt", "name"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
  includeStats: z.enum(["true", "false"]).default("false"),
});

customersRouter.use(requireAuth);

customersRouter.get("/:shopId/customers", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);

    const where = { shopId, ...(query.search ? { OR: [
      { name: { contains: query.search, mode: "insensitive" as const } },
      { phone: { contains: query.search, mode: "insensitive" as const } },
      { email: { contains: query.search, mode: "insensitive" as const } },
    ] } : {}) };
    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({ where, include: { priceGroup: true, _count: { select: { orders: true } } }, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.customer.count({ where }),
    ]);
    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });

    let customersWithStats = customers;
    if (query.includeStats === "true" && customers.length) {
      const whereOrders = {
        shopId,
        customerId: { in: customers.map((customer) => customer.id) },
        fulfillmentStatus: "completed",
        cancelledAt: null,
      };
      const [totals, returnedOrders] = await Promise.all([
        prisma.order.groupBy({ by: ["customerId"], where: whereOrders, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.findMany({
          where: { ...whereOrders, items: { some: { returns: { some: {} } } } },
          select: {
            customerId: true, total: true, subtotal: true, discount: true, deliveryFee: true,
            items: { select: { id: true, quantity: true, baseQuantity: true, lineTotal: true, returns: { select: { quantity: true } } } },
          },
        }),
      ]);
      const stats = new Map(totals.map((row) => [row.customerId, {
        visitCount: row._count._all,
        totalAmount: row._sum.total ?? 0,
      }]));
      for (const order of returnedOrders) {
        const customerStats = stats.get(order.customerId);
        if (customerStats) customerStats.totalAmount -= order.total - effectiveOrderTotal(order);
      }
      customersWithStats = customers.map((customer) => ({
        ...customer,
        visitCount: stats.get(customer.id)?.visitCount ?? 0,
        totalAmount: stats.get(customer.id)?.totalAmount ?? 0,
      }));
    }

    response.status(200).json({
      customers: customersWithStats.map((customer) => customerView(customer, settings)),
      totalCount: total,
      pagination: { page: query.page, pageSize: query.pageSize, total },
    });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/:shopId/customers", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = customerSchema.parse(request.body);

    const access = await assertShopPermission(authUser.id, shopId, "sale.create");
    assertCustomerFields(access, input);

    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });
    const data = {
      name: input.name,
      shopId,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.creditLimitOverride !== undefined ? { creditLimitOverride: input.creditLimitOverride } : {}),
      ...(input.paymentTermsDaysOverride !== undefined ? { paymentTermsDaysOverride: input.paymentTermsDaysOverride } : {}),
    };

    const customer = await prisma.customer.create({
      data,
      include: { priceGroup: true, _count: { select: { orders: true } } },
    });

    response.status(201).json({ customer: customerView(customer, settings) });
  } catch (error) {
    next(error);
  }
});

customersRouter.patch("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);
    const input = updateCustomerSchema.parse(request.body);

    const access = await assertShopAccess(authUser.id, shopId);
    assertCustomerFields(access, input);

    const existingCustomer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true },
    });

    if (!existingCustomer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.creditLimitOverride !== undefined ? { creditLimitOverride: input.creditLimitOverride } : {}),
      ...(input.paymentTermsDaysOverride !== undefined ? { paymentTermsDaysOverride: input.paymentTermsDaysOverride } : {}),
    };

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data,
      include: { priceGroup: true, _count: { select: { orders: true } } },
    });

    response.status(200).json({ customer: customerView(customer, settings) });
  } catch (error) {
    next(error);
  }
});
const transactionReportQuerySchema = z.object({
  search: z.string().trim().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const dayStart = (value: string) => new Date(`${value}T00:00:00+06:30`);

customersRouter.get("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);
    await assertUserOwnsShop(authUser.id, shopId);
    const [customer, settings] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, shopId }, include: { priceGroup: true, _count: { select: { orders: true } } } }),
      prisma.shopSetting.findUnique({ where: { shopId } }),
    ]);
    if (!customer) throw Object.assign(new Error("Customer not found."), { name: "NotFoundError" });
    response.status(200).json({ customer: customerView(customer, settings) });
  } catch (error) { next(error); }
});

customersRouter.get("/:shopId/customers/:customerId/credit-report", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);
    await assertUserOwnsShop(authUser.id, shopId);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }
    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });
    const { effectiveCreditLimit } = effectiveCustomerCredit(customer, settings);
    const report = await loadCustomerCredit(prisma, shopId, customerId, effectiveCreditLimit);
    response.status(200).json({ report });
  } catch (error) {
    next(error);
  }
});

customersRouter.get("/:shopId/customers/:customerId/transaction-report", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);
    const query = transactionReportQuerySchema.parse(request.query);
    if (query.from && query.to && query.from > query.to) throw Object.assign(new Error("From date must be on or before To date."), { name: "BadRequestError" });
    await assertUserOwnsShop(authUser.id, shopId);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId }, select: { id: true, name: true } });
    if (!customer) throw Object.assign(new Error("Customer not found."), { name: "NotFoundError" });
    const toExclusive = query.to ? new Date(dayStart(query.to).getTime() + 86_400_000) : undefined;
    const orders = await prisma.order.findMany({
      where: {
        shopId, customerId,
        ...(query.search ? { OR: [{ orderNumber: { contains: query.search, mode: "insensitive" } }, { id: { contains: query.search, mode: "insensitive" } }] } : {}),
        ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: dayStart(query.from) } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, orderNumber: true, createdAt: true, dueAt: true, paymentStatus: true, fulfillmentStatus: true, cancelledAt: true,
        total: true, subtotal: true, discount: true, deliveryFee: true,
        items: { select: { id: true, quantity: true, baseQuantity: true, lineTotal: true, returns: { select: { quantity: true } } } },
        payments: { select: { id: true, amount: true, type: true, scope: true, paidAt: true } },
      },
    });
    const allocatedPayments = orders.length ? await prisma.payment.findMany({
      where: { shopId, orderIds: { not: null }, OR: orders.map((order) => ({ orderIds: { contains: order.id } })) },
      select: { id: true, amount: true, type: true, scope: true, allocations: true, paidAt: true },
    }) : [];
    const invoices = orders.map((order) => {
      const effectiveAmount = effectiveOrderTotal(order);
      const entries = orderPaymentEntries(order.id, order.payments, allocatedPayments);
      const paidAmount = entries.reduce((sum, payment) => sum + payment.amount, 0);
      const cancelled = Boolean(order.cancelledAt) || order.fulfillmentStatus === "cancelled";
      return {
        orderId: order.id, orderNumber: order.orderNumber, date: order.createdAt,
        effectiveAmount, paidAmount, remainingAmount: Math.max(0, effectiveAmount - paidAmount),
        dueAt: order.dueAt,
        paymentStatus: cancelled ? "Cancelled" : paidAmount <= 0 ? "Unpaid" : paidAmount >= effectiveAmount ? "Paid" : "Partial",
        fulfillmentStatus: order.fulfillmentStatus, cancelledAt: order.cancelledAt,
        paymentCount: entries.length,
      };
    });
    const active = invoices.filter((invoice) => !invoice.cancelledAt && invoice.fulfillmentStatus !== "cancelled");
    response.json({
      customer,
      summary: {
        totalPurchases: active.reduce((sum, invoice) => sum + invoice.effectiveAmount, 0),
        totalPaid: active.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
        outstanding: active.reduce((sum, invoice) => sum + invoice.remainingAmount, 0),
        invoiceCount: invoices.length,
      },
      invoices,
    });
  } catch (error) { next(error); }
});

customersRouter.delete("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);

    await assertShopPermission(authUser.id, shopId, "settings.manage");

    const existingCustomer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true },
    });

    if (!existingCustomer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "shopId" = ${shopId} FOR UPDATE`;
      const history = await tx.order.findFirst({ where: { shopId, customerId }, select: { id: true } });
      if (history) {
        const error = new Error("Customer has transaction history and cannot be deleted.");
        error.name = "ConflictError";
        throw error;
      }
      await tx.customer.delete({ where: { id: customerId } });
    });

    response.status(204).send();
  } catch (error) {
    if ((error as { code?: string }).code === "P2003") {
      next(Object.assign(new Error("Customer has transaction history and cannot be deleted."), { name: "ConflictError" }));
    } else next(error);
  }
});
