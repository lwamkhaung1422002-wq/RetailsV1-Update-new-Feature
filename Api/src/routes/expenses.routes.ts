import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const expensesRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().nonnegative();

const expenseSchema = z.object({
  title: z.string().trim().min(1, "Expense title is required."),
  category: z.string().trim().optional(),
  method: z.string().trim().optional(),
  transactionId: z.string().trim().optional(),
  amount: moneySchema,
  spentAt: z.coerce.date().optional(),
  note: z.string().trim().optional(),
});

const updateExpenseSchema = expenseSchema.partial();

function requiresTransactionId(method?: string): boolean {
  return Boolean(method && !["cash", "ငွေသား"].includes(method.toLowerCase()));
}

expensesRouter.use(requireAuth);

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

expensesRouter.get("/:shopId/expenses", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const expenses = await prisma.expense.findMany({
      where: { shopId, cancelledAt: null },
      orderBy: { spentAt: "desc" },
    });

    response.status(200).json({ expenses });
  } catch (error) {
    next(error);
  }
});

expensesRouter.post("/:shopId/expenses", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = expenseSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const data: Prisma.ExpenseUncheckedCreateInput = {
      shopId,
      title: input.title,
      amount: input.amount,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
      ...(input.spentAt !== undefined ? { spentAt: input.spentAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const expense = await prisma.$transaction(async (tx) => {
      const createdExpense = await tx.expense.create({ data });
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "expense.create",
        entity: "Expense",
        entityId: createdExpense.id,
        metadata: { amount: input.amount, category: input.category ?? null, method: input.method ?? null },
      });
      return createdExpense;
    });

    response.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
});

expensesRouter.patch("/:shopId/expenses/:expenseId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const expenseId = z.string().min(1).parse(request.params.expenseId);
    const input = updateExpenseSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingExpense = await prisma.expense.findFirst({
      where: { id: expenseId, shopId, cancelledAt: null },
      select: { id: true },
    });

    if (!existingExpense) throw notFound("Expense not found.");

    const data: Prisma.ExpenseUncheckedUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.spentAt !== undefined ? { spentAt: input.spentAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const expense = await prisma.$transaction(async (tx) => {
      const updatedExpense = await tx.expense.update({
        where: { id: expenseId, cancelledAt: null },
        data,
      });
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "expense.update",
        entity: "Expense",
        entityId: expenseId,
      });
      return updatedExpense;
    });

    response.status(200).json({ expense });
  } catch (error) {
    next(error);
  }
});

expensesRouter.delete("/:shopId/expenses/:expenseId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const expenseId = z.string().min(1).parse(request.params.expenseId);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingExpense = await prisma.expense.findFirst({
      where: { id: expenseId, shopId },
      select: { id: true },
    });

    if (!existingExpense) throw notFound("Expense not found.");

    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.expense.updateMany({
        where: { id: expenseId, shopId, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (!cancelled.count) return;
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "expense.cancel",
        entity: "Expense",
        entityId: expenseId,
      });
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
