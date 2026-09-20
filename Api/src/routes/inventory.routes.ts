import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { approvalAccessToken, approvalAuditMetadata, authorizeSensitiveAction, consumeManagerApproval } from "../lib/manager-approval.js";
import { recordInventoryMovement } from "../lib/inventory-domain.js";
import { refreshProductWeightedCost } from "../lib/costing.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const inventoryRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().positive();
// Inventory mutations can touch batches, movements, balances, and audit records together.
const INVENTORY_MUTATION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

const createInventoryBatchSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0."),
  unitCost: moneySchema,
  deliveryCost: moneySchema.optional(),
  deliveryMethod: z.string().trim().optional(),
  receivedAt: z.coerce.date().optional(),
  supplierName: z.string().trim().max(160).optional(),
  invoiceReference: z.string().trim().max(160).optional(),
  note: z.string().trim().optional(),
});

const updateInventoryBatchSchema = z.object({
  unitCost: moneySchema.optional(),
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().optional(),
  supplierName: z.string().trim().max(160).nullable().optional(),
  invoiceReference: z.string().trim().max(160).nullable().optional(),
});

const adjustmentSchema = z.object({
  action: z.enum(["ADD", "REMOVE", "SUB", "SET"]),
  quantity: z.coerce.number().int().nonnegative(),
  reason: z.string().trim().min(1, "Reason is required."),
});

inventoryRouter.use(requireAuth);

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}

async function assertProductBelongsToShop(productId: string, shopId: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, isActive: true },
  });

  if (!product) {
    throw notFound("Product not found.");
  }

  if (!product.isActive) {
    throw badRequest("Product has been removed from active selling.");
  }
}

async function assertVariantBelongsToProduct(
  variantId: string | undefined,
  productId: string,
): Promise<void> {
  if (!variantId) return;

  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      productId,
    },
    select: { id: true, isActive: true, archivedAt: true },
  });

  if (!variant) {
    throw notFound("Product variant not found.");
  }

  if (!variant.isActive || variant.archivedAt) {
    throw badRequest("Product variant is archived and cannot receive new stock.");
  }
}

inventoryRouter.get("/:shopId/inventory", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const inventory = await prisma.inventoryBatch.findMany({
      where: { shopId },
      include: {
        product: true,
        variant: true,
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    });

    response.status(200).json({ inventory });
  } catch (error) {
    next(error);
  }
});

const costPriceDecreaseSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  variantId: z.string().trim().optional(),
  unitCost: z.coerce.number().int().positive("Cost price must be greater than 0."),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0."),
  reason: z.string().trim().min(1, "Reason is required."),
});

inventoryRouter.get("/:shopId/inventory-movements", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = z.object({ productId: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    await assertUserOwnsShop(authUser.id, shopId);
    const movements = await prisma.inventoryMovement.findMany({
      where: { shopId, ...(query.productId ? { productId: query.productId } : {}) },
      include: {
        product: { include: { barcodes: { where: { status: "ACTIVE" } } } },
        variant: true,
        inventoryBatch: { select: { supplierName: true, invoiceReference: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: query.limit,
    });
    const allocationIds = movements
      .filter((movement) => movement.sourceType === "OrderItemAllocation")
      .map((movement) => movement.sourceId?.split(":")[0])
      .filter((value): value is string => Boolean(value));
    const customerReturnIds = movements
      .filter((movement) => movement.type === "CUSTOMER_RETURN" && movement.sourceType === "CustomerReturn")
      .map((movement) => movement.sourceId?.split(":")[0])
      .filter((value): value is string => Boolean(value));
    const allocations = allocationIds.length ? await prisma.orderItemAllocation.findMany({
      where: { id: { in: allocationIds } },
    }) : [];
    const orderItems = allocations.length ? await prisma.orderItem.findMany({ where: { id: { in: allocations.map((allocation) => allocation.orderItemId) } }, select: { id: true, orderId: true } }) : [];
    const customerReturns = customerReturnIds.length ? await prisma.customerReturn.findMany({ where: { id: { in: customerReturnIds } }, select: { id: true, orderId: true } }) : [];
    const orderIds = [...new Set([...orderItems.map((item) => item.orderId), ...customerReturns.map((entry) => entry.orderId)])];
    const orders = orderIds.length ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];
    const orderIdByItemId = new Map(orderItems.map((item) => [item.id, item.orderId]));
    const invoiceByOrderId = new Map(orders.map((order) => [order.id, order.orderNumber || order.id]));
    const invoiceByAllocationId = new Map(allocations.map((allocation) => [allocation.id, invoiceByOrderId.get(orderIdByItemId.get(allocation.orderItemId) || "")]));
    const invoiceByReturnId = new Map(customerReturns.map((entry) => [entry.id, invoiceByOrderId.get(entry.orderId)]));
    response.status(200).json({ movements: movements.map(({ inventoryBatch, ...movement }) => ({
      ...movement,
      supplierName: inventoryBatch?.supplierName ?? null,
      invoiceReference: inventoryBatch?.invoiceReference ?? null,
      invoiceNumber: movement.sourceType === "OrderItemAllocation" && movement.sourceId
        ? invoiceByAllocationId.get(movement.sourceId.split(":")[0] ?? "") ?? null
        : movement.type === "CUSTOMER_RETURN" && movement.sourceType === "CustomerReturn" && movement.sourceId
          ? invoiceByReturnId.get(movement.sourceId.split(":")[0] ?? "") ?? null
          : null,
    })) });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post("/:shopId/inventory", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = createInventoryBatchSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(input.productId, shopId);
    await assertVariantBelongsToProduct(input.variantId, input.productId);

    const data: Prisma.InventoryBatchUncheckedCreateInput = {
      shopId,
      productId: input.productId,
      quantity: input.quantity,
      unitCost: input.unitCost,
      ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
      ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
      ...(input.supplierName ? { supplierName: input.supplierName } : {}),
      ...(input.invoiceReference ? { invoiceReference: input.invoiceReference } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const inventoryBatch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.inventoryBatch.create({
        data,
        include: {
          product: true,
          variant: true,
        },
      });

      if (input.deliveryCost && input.deliveryCost > 0) {
        await tx.expense.create({
          data: {
            shopId,
            title: `Stock delivery - ${createdBatch.product.name}`,
            category: "Stock Delivery",
            method: input.deliveryMethod ?? "Other",
            amount: input.deliveryCost,
            spentAt: input.receivedAt ?? new Date(),
            note: `Auto-recorded from inventory batch ${createdBatch.id}.`,
          },
        });
      }

      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "inventory.create",
        entity: "InventoryBatch",
        entityId: createdBatch.id,
        metadata: {
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          unitCost: input.unitCost,
          supplierName: input.supplierName || null,
          invoiceReference: input.invoiceReference || null,
          deliveryCost: input.deliveryCost ?? 0,
        },
      });
      const movement = await recordInventoryMovement(tx, {
        shopId, productId: createdBatch.productId, variantId: createdBatch.variantId,
        inventoryBatchId: createdBatch.id, type: "OPENING", direction: "IN",
        quantity: createdBatch.quantity, unitCost: createdBatch.unitCost,
        sourceType: "InventoryBatch", sourceId: createdBatch.id,
        idempotencyKey: String(request.header("Idempotency-Key") || `inventory.create:${createdBatch.id}`),
        ...(input.note ? { reason: input.note } : {}),
        occurredAt: createdBatch.receivedAt,
      });
      const averageCost = await refreshProductWeightedCost(tx, shopId, input.productId);
      if (movement) {
        await tx.inventoryMovement.update({ where: { id: movement.id }, data: { averageCostAfter: averageCost } });
      }

      return createdBatch;
    }, INVENTORY_MUTATION_TRANSACTION_OPTIONS);

    response.status(201).json({ inventoryBatch });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.patch("/:shopId/inventory/:inventoryBatchId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const inventoryBatchId = z.string().min(1).parse(request.params.inventoryBatchId);
    const input = updateInventoryBatchSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingBatch = await prisma.inventoryBatch.findFirst({
      where: { id: inventoryBatchId, shopId },
      select: { id: true, supplierName: true, invoiceReference: true },
    });

    if (!existingBatch) {
      throw notFound("Inventory batch not found.");
    }

    const data: Prisma.InventoryBatchUncheckedUpdateInput = {
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.supplierName !== undefined ? { supplierName: input.supplierName || null } : {}),
      ...(input.invoiceReference !== undefined ? { invoiceReference: input.invoiceReference || null } : {}),
    };

    const inventoryBatch = await prisma.$transaction(async (tx) => {
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: inventoryBatchId },
        data,
        include: {
          product: true,
          variant: true,
        },
      });

      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "inventory.update",
        entity: "InventoryBatch",
        entityId: inventoryBatchId,
        metadata: {
          previousSupplierName: existingBatch.supplierName,
          supplierName: input.supplierName,
          previousInvoiceReference: existingBatch.invoiceReference,
          invoiceReference: input.invoiceReference,
        },
      });

      return updatedBatch;
    }, INVENTORY_MUTATION_TRANSACTION_OPTIONS);

    response.status(200).json({ inventoryBatch });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.delete("/:shopId/inventory/:inventoryBatchId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    z.string().min(1).parse(request.params.inventoryBatchId);

    await assertUserOwnsShop(authUser.id, shopId);
    throw badRequest(
      "Inventory records cannot be deleted. Use an adjustment, return, quarantine, or reversal so the audit trail is preserved.",
    );
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post("/:shopId/inventory/adjustments/by-cost", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = costPriceDecreaseSchema.parse(request.body);
    const actor = await prisma.user.findUnique({ where: { id: authUser.id }, select: { name: true } });
    const staffName = actor?.name || authUser.email;
    const authorization = await authorizeSensitiveAction({
      requesterId: authUser.id,
      shopId,
      action: "stock.adjust",
      targetId: input.productId,
      payload: { mode: "by-cost", ...input, action: "SUB" },
      approvalToken: approvalAccessToken(request.headers),
    });
    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(input.productId, shopId);
    await assertVariantBelongsToProduct(input.variantId, input.productId);

    const result = await prisma.$transaction(async (tx) => {
      await consumeManagerApproval(tx, authorization);
      const batches = await tx.inventoryBatch.findMany({
        where: { shopId, productId: input.productId, variantId: input.variantId ?? null, unitCost: input.unitCost },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      });
      const availableQuantity = batches.reduce((sum, batch) => sum + Math.max(0, batch.quantity - batch.reservedQuantity), 0);
      if (input.quantity > availableQuantity) {
        throw Object.assign(new Error(`Insufficient stock at cost price ${input.unitCost}. Available: ${availableQuantity}`), { name: "ConflictError" });
      }
      const beforeQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
      let remaining = input.quantity;
      const deductions: Array<{ batch: typeof batches[number]; quantity: number }> = [];
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deducted = Math.min(remaining, Math.max(0, batch.quantity - batch.reservedQuantity));
        if (!deducted) continue;
        await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - deducted } });
        deductions.push({ batch, quantity: deducted });
        remaining -= deducted;
      }
      const adjustment = await tx.stockAdjustment.create({
        data: {
          shopId, productId: input.productId, selectedUnitCost: input.unitCost, action: "SUB", quantity: input.quantity,
          beforeQuantity, afterQuantity: beforeQuantity - input.quantity, reason: input.reason, staffName,
        },
      });
      await tx.stockAdjustmentAllocation.createMany({
        data: deductions.map(({ batch, quantity }) => ({ stockAdjustmentId: adjustment.id, inventoryBatchId: batch.id, quantity })),
      });
      const movements = [];
      for (const { batch, quantity } of deductions) {
        const movement = await recordInventoryMovement(tx, {
          shopId, productId: batch.productId, variantId: batch.variantId, inventoryBatchId: batch.id,
          type: "ADJUSTMENT_OUT", direction: "OUT", quantity, unitCost: batch.unitCost,
          sourceType: "StockAdjustment", sourceId: adjustment.id,
          idempotencyKey: `inventory.adjust.cost:${adjustment.id}:${batch.id}`,
          reason: input.reason, staffName,
        });
        if (movement) movements.push(movement);
      }
      await writeAuditLog(tx, {
        shopId, actorId: authUser.id, action: "inventory.adjust", entity: "StockAdjustment", entityId: adjustment.id,
        metadata: { productId: input.productId, unitCost: input.unitCost, quantity: input.quantity, availableQuantity, allocations: deductions.map(({ batch, quantity }) => ({ inventoryBatchId: batch.id, quantity })), reason: input.reason, staffName, ...approvalAuditMetadata(authorization) },
      });
      const averageCost = await refreshProductWeightedCost(tx, shopId, input.productId);
      await Promise.all(movements.map((movement) => tx.inventoryMovement.update({ where: { id: movement.id }, data: { averageCostAfter: averageCost } })));
      return { adjustment, availableQuantity, allocations: deductions.map(({ batch, quantity }) => ({ inventoryBatchId: batch.id, quantity })) };
    }, INVENTORY_MUTATION_TRANSACTION_OPTIONS);
    response.status(201).json(result);
  } catch (error) { next(error); }
});

inventoryRouter.post(
  "/:shopId/inventory/:inventoryBatchId/adjustments",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const inventoryBatchId = z.string().min(1).parse(request.params.inventoryBatchId);
      await assertUserOwnsShop(authUser.id, shopId);
      // Resolve the scoped resource before validating its mutation payload so a
      // foreign-shop batch cannot leak validation details.
      const scopedBatch = await prisma.inventoryBatch.findFirst({ where: { id: inventoryBatchId, shopId }, select: { id: true, productId: true } });
      if (!scopedBatch) throw notFound("Inventory batch not found.");
      const input = adjustmentSchema.parse(request.body);
      const actor = await prisma.user.findUnique({ where: { id: authUser.id }, select: { name: true } });
      const staffName = actor?.name || authUser.email;
      const normalizedAction = input.action === "REMOVE" ? "SUB" : input.action;
      const authorization = await authorizeSensitiveAction({
        requesterId: authUser.id,
        shopId,
        action: "stock.adjust",
        targetId: scopedBatch.productId,
        payload: { mode: "batch", productId: scopedBatch.productId, inventoryBatchId, ...input, action: normalizedAction },
        approvalToken: approvalAccessToken(request.headers),
      });

      if (input.action !== "SET" && input.quantity < 1) {
        throw badRequest("Quantity must be greater than 0.");
      }

      const result = await prisma.$transaction(async (tx) => {
        await consumeManagerApproval(tx, authorization);
        const batch = await tx.inventoryBatch.findFirst({
          where: { id: inventoryBatchId, shopId },
        });

        if (!batch) {
          throw notFound("Inventory batch not found.");
        }

        const beforeQuantity = batch.quantity;
        const action = normalizedAction;
        const afterQuantity =
          action === "ADD"
            ? beforeQuantity + input.quantity
            : action === "SUB"
              ? beforeQuantity - input.quantity
              : input.quantity;

        if (afterQuantity < 0) {
          throw badRequest("Inventory quantity cannot be negative.");
        }

        if (afterQuantity < batch.reservedQuantity) {
          throw badRequest(
            `Inventory quantity cannot be lower than reserved quantity (${batch.reservedQuantity}).`,
          );
        }

        const inventoryBatch = await tx.inventoryBatch.update({
          where: { id: inventoryBatchId },
          data: { quantity: afterQuantity },
          include: {
            product: true,
            variant: true,
          },
        });

        const adjustment = await tx.stockAdjustment.create({
          data: {
            shopId,
            productId: batch.productId,
            inventoryBatchId,
            action,
            quantity: input.quantity,
            beforeQuantity,
            afterQuantity,
            reason: input.reason,
            staffName,
          },
        });

        await writeAuditLog(tx, {
          shopId,
          actorId: authUser.id,
          action: "inventory.adjust",
          entity: "StockAdjustment",
          entityId: adjustment.id,
          metadata: {
            inventoryBatchId,
            action,
            quantity: input.quantity,
            beforeQuantity,
            afterQuantity,
            reason: input.reason,
            staffName,
            ...approvalAuditMetadata(authorization),
          },
        });
        const delta = afterQuantity - beforeQuantity;
        let movement;
        if (delta !== 0) {
          movement = await recordInventoryMovement(tx, {
            shopId, productId: batch.productId, variantId: batch.variantId,
            inventoryBatchId: batch.id,
            type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            direction: delta > 0 ? "IN" : "OUT", quantity: Math.abs(delta),
            unitCost: batch.unitCost, sourceType: "StockAdjustment", sourceId: adjustment.id,
            idempotencyKey: String(request.header("Idempotency-Key") || `inventory.adjust:${adjustment.id}`),
            reason: input.reason,
            staffName,
          });
        }
        const averageCost = await refreshProductWeightedCost(tx, shopId, batch.productId);
        if (movement) await tx.inventoryMovement.update({ where: { id: movement.id }, data: { averageCostAfter: averageCost } });

        return { inventoryBatch, adjustment };
      }, INVENTORY_MUTATION_TRANSACTION_OPTIONS);

      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get("/:shopId/inventory-adjustments", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { shopId },
      include: {
        inventoryBatch: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ adjustments });
  } catch (error) {
    next(error);
  }
});
