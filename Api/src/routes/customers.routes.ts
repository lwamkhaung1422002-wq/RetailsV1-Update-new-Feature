import { Router } from "express";
import { z } from "zod";

import { assertUserOwnsShop } from "../lib/shop-access.js";
import { effectiveOrderTotal } from "../lib/order-return-refund.js";
import { customerPricing, ensureWholesalePriceGroup } from "../lib/customer-pricing.js";
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
  pricingType: z.enum(["RETAIL", "WHOLESALE"]).optional(),
  creditLimitOverride: z.number().int().min(0).nullable().optional(),
  paymentTermsDaysOverride: z.number().int().min(0).max(3650).nullable().optional(),
});

const updateCustomerSchema = customerSchema.partial();
const customerView = <T extends { priceGroupId: string | null; priceGroup?: { name: string; isActive: boolean } | null; creditLimitOverride?: number | null; paymentTermsDaysOverride?: number | null }>(customer: T, settings: { defaultCreditLimit?: number; defaultPaymentTermsDays?: number } | null) => ({
  ...customer,
  ...customerPricing(customer),
  ...effectiveCustomerCredit(customer, settings),
});
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
      prisma.customer.findMany({ where, include: { priceGroup: true }, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
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

    await assertUserOwnsShop(authUser.id, shopId);

    const wholesaleGroup = input.pricingType === "WHOLESALE" ? await ensureWholesalePriceGroup(prisma, shopId) : null;
    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });
    const data = {
      name: input.name,
      shopId,
      ...(wholesaleGroup ? { priceGroupId: wholesaleGroup.id } : {}),
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
      include: { priceGroup: true },
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

    await assertUserOwnsShop(authUser.id, shopId);

    const existingCustomer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true },
    });

    if (!existingCustomer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const wholesaleGroup = input.pricingType === "WHOLESALE" ? await ensureWholesalePriceGroup(prisma, shopId) : null;
    const settings = await prisma.shopSetting.findUnique({ where: { shopId } });
    const data = {
      ...(input.pricingType !== undefined ? { priceGroupId: wholesaleGroup?.id ?? null } : {}),
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
      include: { priceGroup: true },
    });

    response.status(200).json({ customer: customerView(customer, settings) });
  } catch (error) {
    next(error);
  }
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

customersRouter.delete("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);

    await assertUserOwnsShop(authUser.id, shopId);

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
      const report = await loadCustomerCredit(tx, shopId, customerId, 0);
      if (report.outstanding > 0) {
        const error = new Error(`Customer has ${report.outstanding.toLocaleString()} outstanding and cannot be deleted.`);
        error.name = "ConflictError";
        throw error;
      }
      await tx.customer.delete({ where: { id: customerId } });
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
