import { Router } from "express";
import { z } from "zod";

import { assertUserOwnsShop } from "../lib/shop-access.js";
import { effectiveOrderTotal } from "../lib/order-return-refund.js";
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
});

const updateCustomerSchema = customerSchema.partial();
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
      prisma.customer.findMany({ where, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.customer.count({ where }),
    ]);

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
      customers: customersWithStats,
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

    const data = {
      name: input.name,
      shopId,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const customer = await prisma.customer.create({
      data,
    });

    response.status(201).json({ customer });
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

    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data,
    });

    response.status(200).json({ customer });
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

    await prisma.customer.delete({ where: { id: customerId } });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
