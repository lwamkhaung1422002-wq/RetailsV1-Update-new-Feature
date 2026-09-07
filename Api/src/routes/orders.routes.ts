import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { recordInventoryMovement, setInventoryReservation } from "../lib/inventory-domain.js";
import { prisma } from "../lib/prisma.js";
import { resolvePrice } from "../lib/pricing-domain.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { assertCapability } from "../lib/store-capabilities.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const ordersRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});
const orderListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort: z.enum(["createdAt", "completedAt", "total"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
  // Existing callers retain the full representation. The Orders screen can
  // explicitly ask for a smaller list projection and load details on demand.
  view: z.enum(["summary", "full"]).default("full"),
});

const moneySchema = z.coerce.number().int().nonnegative();
const quantitySchema = z.coerce.number().positive("Quantity must be greater than 0.");
const QUANTITY_SCALE = 3;
// Order lifecycle operations can update allocations, batches, serials, payments, and audit data
// atomically.  Keep their production transaction budget consistent without changing any order rule.
const ORDER_LIFECYCLE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

function quantityDecimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0).toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

function compatibilityQuantity(value: string | number | Prisma.Decimal): number {
  return quantityDecimal(value).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function storedItemBaseQuantity(item: { quantity: number; baseQuantity?: unknown }): Prisma.Decimal {
  return quantityDecimal(item.baseQuantity == null ? item.quantity : String(item.baseQuantity));
}

function storedAllocationBaseQuantity(allocation: { quantity: number; baseQuantity?: unknown }): Prisma.Decimal {
  return quantityDecimal(allocation.baseQuantity == null ? allocation.quantity : String(allocation.baseQuantity));
}

const orderItemSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  variantId: z.string().trim().optional(),
  quantity: quantitySchema,
  unitPrice: moneySchema.optional(),
  discount: moneySchema.optional(),
  deductionType: z.enum(["discount", "advance-payment"]).default("discount"),
  serialIds: z.array(z.string().min(1)).optional(),
  unitId: z.string().min(1).optional(),
  lotId: z.string().min(1).optional(),
  lotOverrideReason: z.string().trim().optional(),
  modifierOptionIds: z.array(z.string().min(1)).default([]),
});

const embeddedCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const initialPaymentSchema = z.object({
  method: z.string().trim().min(1, "Payment method is required."),
  amount: z.coerce.number().int().positive("Initial payment must be greater than 0."),
  note: z.string().trim().optional(),
});

const createOrderSchema = z.object({
  customerId: z.string().trim().optional(),
  customer: embeddedCustomerSchema.optional(),
  orderNumber: z.string().trim().optional(),
  fulfillmentStatus: z.enum(["new", "confirmed", "preparing", "ready", "reserved", "preorder"]).default("reserved"),
  discount: moneySchema.optional(),
  deliveryFee: moneySchema.optional(),
  source: z.string().trim().optional(),
  note: z.string().trim().optional(),
  initialPayment: initialPaymentSchema.optional(),
  items: z.array(orderItemSchema).min(1, "At least one order item is required."),
});

const updateStatusSchema = z.object({
  fulfillmentStatus: z.enum(["confirmed", "preparing", "ready", "reserved", "completed"]),
});

const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, "Cancel reason is required."),
});
const productReturnSchema = z.object({
  items: z.array(z.object({
    orderItemId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    condition: z.enum(["SELLABLE", "DAMAGED"]),
    reason: z.string().trim().min(1),
    serialIds: z.array(z.string().min(1)).optional(),
  })).min(1),
});

ordersRouter.use(requireAuth);

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

ordersRouter.get("/:shopId/orders/next-number", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    await assertUserOwnsShop(authUser.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { saleSequence: true } });
    response.json({ orderNumber: String(shop.saleSequence + 1).padStart(5, "0") });
  } catch (error) { next(error); }
});

function lineTotal(
  quantity: string | number | Prisma.Decimal,
  unitPrice: number,
  discount = 0,
  deductionType = "discount",
): number {
  const lineDiscount = deductionType === "discount" ? discount : 0;
  return Prisma.Decimal.max(0, quantityDecimal(quantity).mul(unitPrice).minus(lineDiscount))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

type IngredientRequirement = { productId: string; quantity: string; sourceId: string };

function recipeIngredientRequirements(item: {
  id: string;
  quantity: number;
  baseQuantity?: unknown;
  product: {
    recipe: null | {
      id: string;
      yieldQuantity: unknown;
      components: Array<{ id: string; ingredientProductId: string; quantity: unknown }>;
    };
  };
  modifierSelections?: Array<{ id: string; ingredientDelta: unknown }>;
}): IngredientRequirement[] {
  const recipe = item.product.recipe;
  if (!recipe) return [];
  const requirements = recipe.components.map((component) => ({
    productId: component.ingredientProductId,
    quantity: quantityDecimal(component.quantity as string)
      .mul(storedItemBaseQuantity(item))
      .div(quantityDecimal(recipe.yieldQuantity as string))
      .toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
      .toString(),
    sourceId: `${item.id}:${component.id}`,
  }));
  for (const selection of item.modifierSelections || []) {
    const deltas = Array.isArray(selection.ingredientDelta) ? selection.ingredientDelta : [];
    for (const raw of deltas) {
      if (!raw || typeof raw !== "object") continue;
      const delta = raw as { productId?: unknown; quantity?: unknown };
      if (typeof delta.productId !== "string" || !Number.isFinite(Number(delta.quantity))) continue;
      requirements.push({
        productId: delta.productId,
        quantity: quantityDecimal(delta.quantity as string)
          .mul(storedItemBaseQuantity(item))
          .toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
          .toString(),
        sourceId: `${item.id}:modifier:${selection.id}:${delta.productId}`,
      });
    }
  }
  return requirements;
}

const allowedStatusTransitions: Record<string, string[]> = {
  new: ["confirmed"],
  confirmed: ["preparing"],
  preparing: ["ready"],
  ready: ["completed"],
  preorder: ["reserved"],
  reserved: ["completed"],
};

function fefoEligibleBatches<T extends {
  id: string;
  quantity: number;
  baseQuantity?: unknown;
  reservedQuantity: number;
  unitCost: number;
  receivedAt: Date;
  createdAt: Date;
  lots: Array<{ expiresAt: Date | null; status: string; quantity: unknown }>;
}>(batches: T[], now = new Date()): T[] {
  return batches
    .filter((batch) => !batch.lots.some((lot) => lot.status === "ACTIVE" && lot.expiresAt && lot.expiresAt <= now))
    .sort((left, right) => {
      const leftExpiry = left.lots.find((lot) => lot.status === "ACTIVE")?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightExpiry = right.lots.find((lot) => lot.status === "ACTIVE")?.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftExpiry - rightExpiry || left.receivedAt.getTime() - right.receivedAt.getTime() || left.createdAt.getTime() - right.createdAt.getTime();
    });
}

async function reserveOrderInventory(
  tx: any,
  shopId: string,
  orderId: string,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, shopId },
    include: {
      items: { include: { allocations: true, product: true, variant: true } },
    },
  });

  if (!order) throw notFound("Order not found.");
  if (order.fulfillmentStatus === "cancelled") {
    throw badRequest("Cancelled orders cannot be fulfilled.");
  }
  if (order.fulfillmentStatus !== "preorder") {
    throw badRequest("Only preorders can be fulfilled through this endpoint.");
  }

  for (const item of order.items) {
    if (item.allocations.length > 0) {
      throw badRequest("Order already has reserved inventory allocations.");
    }

    const batches = fefoEligibleBatches(await tx.inventoryBatch.findMany({
      where: {
        shopId,
        productId: item.productId,
        variantId: item.variantId ?? null,
      },
      include: { lots: { where: { status: "ACTIVE" } } },
    }));

    let remaining = storedItemBaseQuantity(item);
    const allocations: Array<{ inventoryBatchId: string; quantity: number; baseQuantity: string; unitCost: number }> = [];

    for (const batch of batches) {
      if (!remaining.greaterThan("0.0005")) break;

      const batchAvailable = quantityDecimal(
        batch.baseQuantity == null ? batch.quantity : String(batch.baseQuantity),
      ).minus(batch.reservedQuantity);
      const lotAvailable = batch.lots.reduce(
        (sum, lot) => sum.plus(quantityDecimal(String(lot.quantity))),
        new Prisma.Decimal(0),
      );
      const available = item.product.trackingMode === "LOT"
        ? Prisma.Decimal.min(batchAvailable, lotAvailable)
        : batchAvailable;
      const take = Prisma.Decimal.min(available, remaining);

      if (!take.greaterThan(0)) continue;

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { reservedQuantity: batch.reservedQuantity + compatibilityQuantity(take) },
      });

      allocations.push({
        inventoryBatchId: batch.id,
        quantity: compatibilityQuantity(take),
        baseQuantity: take.toString(),
        unitCost: batch.unitCost,
      });

      remaining = remaining.minus(take);
    }

    if (remaining.greaterThan("0.0005")) {
      throw badRequest(
        `${item.productName}${item.variantName ? ` / ${item.variantName}` : ""} is short by ${remaining.toString()}.`,
      );
    }

    const totalCost = allocations.reduce(
      (sum, allocation) => sum.plus(quantityDecimal(allocation.baseQuantity).mul(allocation.unitCost)),
      new Prisma.Decimal(0),
    );
    const itemBaseQuantity = storedItemBaseQuantity(item);

    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        unitCost: itemBaseQuantity.greaterThan(0)
          ? totalCost.div(itemBaseQuantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber()
          : item.unitCost,
        allocations: { create: allocations },
      },
    });
    await setInventoryReservation(tx, {
      shopId, productId: item.productId, variantId: item.variantId,
      sourceType: "OrderItem", sourceId: item.id, quantity: itemBaseQuantity.toString(),
    });
  }

  return tx.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus: "reserved", completedAt: null },
    include: {
      customer: true,
      items: {
        include: {
          product: true,
          variant: true,
          allocations: { include: { inventoryBatch: true } },
          serialAllocations: { include: { serial: true } },
          modifierSelections: true,
        },
      },
      payments: true,
    },
  });
}

ordersRouter.get("/:shopId/orders", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = orderListQuerySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);
    const where = {
      shopId,
      ...(query.status ? { fulfillmentStatus: query.status } : {}),
      ...(query.search ? {
        OR: [
          { orderNumber: { contains: query.search, mode: "insensitive" as const } },
          { customer: { is: { name: { contains: query.search, mode: "insensitive" as const } } } },
          { items: { some: { productName: { contains: query.search, mode: "insensitive" as const } } } },
        ],
      } : {}),
    };
    const orderListArgs = {
      where,
      orderBy: { [query.sort]: query.direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const ordersQuery = query.view === "summary"
      ? prisma.order.findMany({
        ...orderListArgs,
        select: {
          id: true,
          orderNumber: true,
          subtotal: true,
          discount: true,
          total: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          createdAt: true,
          items: { select: { id: true, quantity: true, productName: true } },
          payments: {
            select: { id: true, amount: true, method: true, paidAt: true, createdAt: true, originalPaymentId: true },
          },
        },
      })
      : prisma.order.findMany({
        ...orderListArgs,
        include: {
          customer: true,
          items: {
            include: {
              product: true,
              variant: true,
              allocations: { include: { inventoryBatch: true } },
              serialAllocations: { include: { serial: true } },
              modifierSelections: true,
            },
          },
          payments: true,
        },
      });
    const [orders, totalCount] = await prisma.$transaction([
      ordersQuery,
      prisma.order.count({ where }),
    ]);

    response.status(200).json({
      orders,
      totalCount,
      pagination: { page: query.page, pageSize: query.pageSize, total: totalCount },
    });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get("/:shopId/orders/:orderId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);

    await assertUserOwnsShop(authUser.id, shopId);
    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            variant: true,
            allocations: {
              include: { inventoryBatch: true },
            },
            modifierSelections: true,
          },
        },
        payments: true,
      },
    });

    if (!order) throw notFound("Order not found.");

    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = createOrderSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    if (["new", "confirmed", "preparing", "ready"].includes(input.fulfillmentStatus)) {
      await assertCapability(prisma, shopId, "restaurant.recipes");
    }

    if (input.customerId && input.customer) {
      throw badRequest("Use either customerId or customer, not both.");
    }

    if (input.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, shopId },
        select: { id: true },
      });
      if (!customer) throw notFound("Customer not found.");
    }

    const transactionStartedAt = Date.now();
    const order = await prisma.$transaction(async (tx) => {
      const preparedItems = [];
      let customerId = input.customerId;

      if (input.customer) {
        const customer = await tx.customer.create({
          data: {
            shopId,
            name: input.customer.name,
            ...(input.customer.phone !== undefined ? { phone: input.customer.phone } : {}),
            ...(input.customer.email !== undefined ? { email: input.customer.email } : {}),
            ...(input.customer.address !== undefined ? { address: input.customer.address } : {}),
            ...(input.customer.city !== undefined ? { city: input.customer.city } : {}),
            ...(input.customer.notes !== undefined ? { notes: input.customer.notes } : {}),
          },
        });

        customerId = customer.id;
      }

      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, shopId },
          include: {
            variants: true,
            units: { include: { unit: true } },
            priceTiers: true,
            recipe: { include: { components: true, modifierGroups: { include: { options: true } } } },
          },
        });

        if (!product) throw notFound("Product not found.");
        if (!product.isActive) {
          throw badRequest("Product has been removed from active selling.");
        }

        const variant = item.variantId
          ? product.variants.find((entry) => entry.id === item.variantId)
          : null;

        if (item.variantId && !variant) {
          throw notFound("Product variant not found.");
        }

        if (variant && (!variant.isActive || variant.archivedAt)) {
          throw badRequest("Product variant is archived and cannot be sold.");
        }
        const selectedModifierIds = [...new Set(item.modifierOptionIds)];
        const modifierGroups = product.recipe?.modifierGroups || [];
        const selectedModifiers = modifierGroups.flatMap((group) =>
          group.options.filter((option) => selectedModifierIds.includes(option.id))
            .map((option) => ({ ...option, group })),
        );
        if (selectedModifiers.length !== selectedModifierIds.length) {
          throw badRequest("A selected modifier is inactive or belongs to another menu item.");
        }
        for (const group of modifierGroups) {
          const count = selectedModifiers.filter((option) => option.modifierGroupId === group.id).length;
          const minimum = Math.max(group.required ? 1 : 0, group.minSelect);
          if (count < minimum || count > group.maxSelect) {
            throw badRequest(`${group.name} requires between ${minimum} and ${group.maxSelect} selection(s).`);
          }
        }
        if (selectedModifierIds.length && !product.recipe) {
          throw badRequest("Modifiers are only supported for recipe menu items.");
        }
        const productUnit = item.unitId
          ? product.units.find((entry) => entry.unitId === item.unitId && entry.canSell)
          : product.units.find((entry) => entry.isBase);
        if (item.unitId && !productUnit) throw badRequest("Selling unit is not enabled for this product.");
        const rawEnteredQuantity = new Prisma.Decimal(item.quantity);
        const enteredQuantity = quantityDecimal(rawEnteredQuantity);
        const unitPrecision = productUnit?.unit.precision ?? product.quantityPrecision;
        if (rawEnteredQuantity.decimalPlaces() > unitPrecision) {
          throw badRequest(`This selling unit accepts at most ${unitPrecision} decimal places.`);
        }
        const conversionFactor = new Prisma.Decimal(productUnit?.conversionFactor ?? 1);
        const baseQuantity = enteredQuantity
          .mul(conversionFactor)
          .toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
        if (productUnit?.minimumOrderQty && enteredQuantity.lessThan(productUnit.minimumOrderQty)) {
          throw badRequest(`Minimum order quantity is ${productUnit.minimumOrderQty} ${productUnit.unit.symbol}.`);
        }
        if (product.trackingMode === "SERIAL") {
          if (!baseQuantity.isInteger() || item.serialIds?.length !== baseQuantity.toNumber()) {
            throw badRequest(`${product.name} requires one selected serial for every sold base unit.`);
          }
          const serialCount = await tx.inventorySerial.count({
            where: {
              shopId, productId: product.id, variantId: variant?.id ?? null,
              id: { in: item.serialIds }, status: "IN_STOCK",
            },
          });
          if (serialCount !== baseQuantity.toNumber()) throw badRequest("A selected serial is unavailable or belongs to another product.");
        } else if (item.serialIds?.length) {
          throw badRequest("Serial selection is only supported for serial-tracked products.");
        }
        let lotOverride = null;
        if (item.lotId) {
          if (product.trackingMode !== "LOT") {
            throw badRequest("Manual lot selection is only supported for lot-tracked products.");
          }
          if (!item.lotOverrideReason) {
            throw badRequest("A reason is required when overriding FEFO lot allocation.");
          }
          lotOverride = await tx.inventoryLot.findFirst({
            where: {
              id: item.lotId, shopId, productId: product.id,
              variantId: variant?.id ?? null, status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            include: { inventoryBatch: { include: { lots: { where: { status: "ACTIVE" } } } } },
          });
          if (!lotOverride?.inventoryBatch) {
            throw badRequest("Selected lot is unavailable, expired, or belongs to another product.");
          }
          const batchAvailable = lotOverride.inventoryBatch.quantity - lotOverride.inventoryBatch.reservedQuantity;
          if (quantityDecimal(lotOverride.quantity).lessThan(baseQuantity) ||
              quantityDecimal(batchAvailable).lessThan(baseQuantity)) {
            throw badRequest("Selected lot does not have enough available quantity.");
          }
        } else if (item.lotOverrideReason) {
          throw badRequest("A lot override reason cannot be supplied without selecting a lot.");
        }
        const customer = customerId
          ? await tx.customer.findFirst({ where: { id: customerId, shopId }, select: { priceGroupId: true } })
          : null;
        const manualDiscount = item.deductionType === "discount" ? item.discount ?? 0 : 0;
        const pricing = await resolvePrice(tx, shopId, {
          productId: product.id,
          variantId: variant?.id,
          productUnitId: productUnit?.id,
          priceGroupId: customer?.priceGroupId,
          quantity: baseQuantity,
          channel: input.source?.toUpperCase() || "ALL",
          manualDiscount,
        });
        const appliedTier = pricing.appliedTierId
          ? product.priceTiers.find((tier) => tier.id === pricing.appliedTierId) ?? null
          : null;
        const modifierPrice = selectedModifiers.reduce((sum, option) => sum + option.priceDelta, 0);
        const unitPrice = pricing.finalUnitPrice + modifierPrice;
        const discount = item.discount ?? 0;

        preparedItems.push({
          input: item,
          product,
          variant,
          quantity: baseQuantity,
          enteredQuantity,
          conversionFactor,
          productUnit,
          appliedTier,
          pricing,
          unitPrice,
          discount,
          deductionType: item.deductionType,
          serialIds: item.serialIds ?? [],
          lotOverride,
          lotOverrideReason: item.lotOverrideReason,
          selectedModifiers,
          lineTotal: lineTotal(enteredQuantity, unitPrice, 0, item.deductionType),
        });
      }

      const subtotal = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const orderDiscount = Math.min(input.discount ?? 0, subtotal);
      const deliveryFee = input.deliveryFee ?? 0;
      const total = Math.max(0, subtotal - orderDiscount + deliveryFee);
      const initialPaymentAmount = input.initialPayment?.amount ?? 0;
      if (initialPaymentAmount > total) {
        throw badRequest("Initial payment cannot exceed the order total.");
      }
      const paymentStatus = initialPaymentAmount >= total
        ? "paid"
        : initialPaymentAmount > 0
          ? "partial"
          : "unpaid";
      const nextSequence = await tx.shop.update({
        where: { id: shopId },
        data: { saleSequence: { increment: 1 } },
        select: { saleSequence: true },
      });
      const generatedOrderNumber = String(nextSequence.saleSequence).padStart(5, "0");

      const createdOrder = await tx.order.create({
        data: {
          shopId,
          subtotal,
          discount: orderDiscount,
          deliveryFee,
          total,
          fulfillmentStatus: input.fulfillmentStatus,
          paymentStatus,
          // This is an immutable lifecycle flag: it records whether the order
          // had an outstanding balance when it was created.
          paymentTracking: initialPaymentAmount < total,
          ...(customerId !== undefined ? { customerId } : {}),
          orderNumber: input.orderNumber || generatedOrderNumber,
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });

      for (const prepared of preparedItems) {
        const batches =
          input.fulfillmentStatus === "reserved" && !prepared.product.recipe
            ? prepared.lotOverride
              ? [prepared.lotOverride.inventoryBatch!]
              : fefoEligibleBatches(await tx.inventoryBatch.findMany({
                where: {
                  shopId,
                  productId: prepared.product.id,
                  variantId: prepared.variant?.id ?? null,
                },
                include: { lots: { where: { status: "ACTIVE" } } },
              }))
            : [];

        let remaining = prepared.quantity;
        const allocations: Array<{ inventoryBatchId: string; quantity: number; baseQuantity: string; unitCost: number }> =
          [];

        for (const batch of batches) {
          if (!remaining.greaterThan("0.0005")) break;

          const batchAvailable = quantityDecimal(batch.baseQuantity ?? batch.quantity)
            .minus(batch.reservedQuantity);
          const lotAvailable = batch.lots.reduce(
            (sum, lot) => sum.plus(quantityDecimal(String(lot.quantity))),
            new Prisma.Decimal(0),
          );
          const available = prepared.product.trackingMode === "LOT"
            ? Prisma.Decimal.min(batchAvailable, lotAvailable)
            : batchAvailable;
          const take = Prisma.Decimal.min(available, remaining);

          if (!take.greaterThan(0)) continue;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { reservedQuantity: batch.reservedQuantity + compatibilityQuantity(take) },
          });

          allocations.push({
            inventoryBatchId: batch.id,
            quantity: compatibilityQuantity(take),
            baseQuantity: take.toString(),
            unitCost: batch.unitCost,
          });

          remaining = remaining.minus(take);
        }

        if (input.fulfillmentStatus === "reserved" && !prepared.product.recipe && remaining.greaterThan("0.0005")) {
          throw badRequest(
            `${prepared.product.name}${prepared.variant ? ` / ${prepared.variant.name}` : ""} is short by ${remaining.toString()}.`,
          );
        }

        const totalCost = allocations.reduce(
          (sum, allocation) => sum.plus(quantityDecimal(allocation.baseQuantity).mul(allocation.unitCost)),
          new Prisma.Decimal(0),
        );
        const fallbackCost = prepared.variant?.cost ?? prepared.product.cost ?? 0;
        const unitCost =
          prepared.quantity.greaterThan(0) && allocations.length > 0
            ? totalCost.div(prepared.quantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber()
            : fallbackCost;

        const createdItem = await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: prepared.product.id,
            productName: prepared.product.name,
            quantity: compatibilityQuantity(prepared.quantity),
            enteredQuantity: prepared.enteredQuantity.toString(),
            conversionFactor: prepared.conversionFactor.toString(),
            baseQuantity: prepared.quantity.toString(),
            ...(prepared.productUnit ? { unitId: prepared.productUnit.unitId } : {}),
            ...(prepared.appliedTier ? {
              appliedTierId: prepared.appliedTier.id,
            } : {}),
            pricingSnapshot: {
              ...prepared.pricing,
              priceResolvedAt: prepared.pricing.priceResolvedAt.toISOString(),
              productUnitId: prepared.productUnit?.id ?? null,
            },
            regularUnitPrice: prepared.pricing.regularUnitPrice,
            tierUnitPrice: prepared.pricing.tierUnitPrice,
            promotionId: prepared.pricing.promotionId,
            promotionType: prepared.pricing.promotionType,
            promotionValue: prepared.pricing.promotionValue,
            promotionDiscount: prepared.pricing.promotionDiscount,
            manualDiscount: prepared.pricing.manualDiscount,
            finalUnitPrice: prepared.unitPrice,
            priceResolvedAt: prepared.pricing.priceResolvedAt,
            unitPrice: prepared.unitPrice,
            unitCost,
            discount: prepared.discount,
            deductionType: prepared.deductionType,
            lineTotal: prepared.lineTotal,
            ...(prepared.variant ? { variantId: prepared.variant.id, variantName: prepared.variant.name } : {}),
            allocations: {
              create: allocations,
            },
            ...(prepared.selectedModifiers.length ? { modifierSelections: {
              create: prepared.selectedModifiers.map((option) => ({
                modifierOptionId: option.id,
                groupName: option.group.name,
                optionName: option.name,
                priceDelta: option.priceDelta,
                ingredientDelta: (Array.isArray(option.ingredientDelta) ? option.ingredientDelta : []) as Prisma.InputJsonValue,
              })),
            } } : {}),
          },
        });
        if (prepared.serialIds.length) {
          await tx.orderItemSerialAllocation.createMany({
            data: prepared.serialIds.map((serialId: string) => ({ orderItemId: createdItem.id, serialId })),
          });
          await tx.inventorySerial.updateMany({
            where: { id: { in: prepared.serialIds }, shopId, status: "IN_STOCK" },
            data: { status: "RESERVED" },
          });
        }
        if (prepared.lotOverride) {
          await writeAuditLog(tx, {
            shopId, actorId: authUser.id, action: "inventory.lot_override",
            entity: "OrderItem", entityId: createdItem.id,
            metadata: {
              orderId: createdOrder.id, lotId: prepared.lotOverride.id,
              lotNumber: prepared.lotOverride.lotNumber,
              reason: prepared.lotOverrideReason,
              quantity: prepared.quantity.toString(),
            },
          });
        }
        if (input.fulfillmentStatus === "reserved" && !prepared.product.recipe) {
          await setInventoryReservation(tx, {
            shopId, productId: prepared.product.id,
            ...(prepared.variant?.id ? { variantId: prepared.variant.id } : {}),
            sourceType: "OrderItem", sourceId: createdItem.id, quantity: prepared.quantity.toString(),
          });
        }
      }

      if (input.initialPayment) {
        const payment = await tx.payment.create({
          data: {
            shopId,
            orderId: createdOrder.id,
            type: "payment",
            scope: "order-payment",
            method: input.initialPayment.method,
            amount: initialPaymentAmount,
            ...(input.initialPayment.note !== undefined ? { note: input.initialPayment.note } : {}),
          },
        });
        await writeAuditLog(tx, {
          shopId,
          actorId: authUser.id,
          action: "payment.receive",
          entity: "Payment",
          entityId: payment.id,
          metadata: { orderId: createdOrder.id, amount: initialPaymentAmount, method: input.initialPayment.method, initialPayment: true },
        });
      }

      const fullOrder = await tx.order.findUniqueOrThrow({
        where: { id: createdOrder.id },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
              variant: true,
              allocations: {
                include: { inventoryBatch: true },
              },
              modifierSelections: true,
            },
          },
          payments: true,
        },
      });

      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "order.create",
        entity: "Order",
        entityId: fullOrder.id,
        metadata: {
          total,
          initialPaymentAmount,
          paymentTracking: initialPaymentAmount < total,
          fulfillmentStatus: input.fulfillmentStatus,
          source: input.source ?? null,
          itemCount: preparedItems.length,
        },
      });

      return fullOrder;
    }, ORDER_LIFECYCLE_TRANSACTION_OPTIONS);

    request.log.info({ operation: "create", transactionDurationMs: Date.now() - transactionStartedAt }, "Order lifecycle transaction completed");
    response.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders/:orderId/fulfill", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);

    await assertUserOwnsShop(authUser.id, shopId);

    const transactionStartedAt = Date.now();
    const order = await prisma.$transaction(async (tx) => {
      const fulfilledOrder = await reserveOrderInventory(tx, shopId, orderId);
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "order.fulfill",
        entity: "Order",
        entityId: orderId,
      });
      return fulfilledOrder;
    }, ORDER_LIFECYCLE_TRANSACTION_OPTIONS);

    request.log.info({ operation: "fulfill", transactionDurationMs: Date.now() - transactionStartedAt }, "Order lifecycle transaction completed");
    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.patch("/:shopId/orders/:orderId/status", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = updateStatusSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      select: { id: true, fulfillmentStatus: true },
    });

    if (!existingOrder) throw notFound("Order not found.");
    if (existingOrder.fulfillmentStatus === "cancelled") {
      throw badRequest("Cancelled orders cannot be updated.");
    }
    if (existingOrder.fulfillmentStatus === "preorder") {
      throw badRequest("Preorders cannot be completed until converted in a future preorder flow.");
    }
    if (existingOrder.fulfillmentStatus === "completed" && input.fulfillmentStatus !== "completed") {
      throw badRequest("Completed sales cannot be reopened; use an explicit product return.");
    }
    if (!allowedStatusTransitions[existingOrder.fulfillmentStatus]?.includes(input.fulfillmentStatus)) {
      throw badRequest(`Invalid order transition: ${existingOrder.fulfillmentStatus} → ${input.fulfillmentStatus}.`);
    }

    const transactionStartedAt = Date.now();
    const order = await prisma.$transaction(async (tx) => {
      const operationalOrder = await tx.order.findFirstOrThrow({
        where: { id: orderId, shopId },
        include: {
          items: {
            include: {
              product: { include: { recipe: { include: { components: true } } } },
              allocations: true,
              modifierSelections: true,
            },
          },
        },
      });
      if (input.fulfillmentStatus === "confirmed" && existingOrder.fulfillmentStatus === "new") {
        for (const item of operationalOrder.items) {
          for (const requirement of recipeIngredientRequirements(item)) {
            await setInventoryReservation(tx, {
              shopId, productId: requirement.productId,
              sourceType: "RecipeOrderItem", sourceId: requirement.sourceId, quantity: requirement.quantity,
            });
          }
        }
      }
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: input.fulfillmentStatus,
          completedAt: input.fulfillmentStatus === "completed" ? new Date() : null,
        },
        include: {
          customer: true,
          items: { include: { product: true, variant: true, allocations: true, serialAllocations: true } },
          payments: true,
        },
      });
      if (input.fulfillmentStatus === "completed" && existingOrder.fulfillmentStatus !== "completed") {
        for (const item of updatedOrder.items) {
          const recipeItem = operationalOrder.items.find((entry) => entry.id === item.id);
          const recipe = recipeItem?.product.recipe;
          if (recipe) {
            for (const requirement of recipeIngredientRequirements(recipeItem!)) {
              await setInventoryReservation(tx, {
                shopId, productId: requirement.productId,
                sourceType: "RecipeOrderItem", sourceId: requirement.sourceId,
                quantity: requirement.quantity, release: true,
              });
              await recordInventoryMovement(tx, {
                shopId, productId: requirement.productId,
                type: "RECIPE_CONSUMPTION", direction: "OUT", quantity: requirement.quantity,
                sourceType: "RecipeOrderItem", sourceId: requirement.sourceId,
                idempotencyKey: request.header("Idempotency-Key")
                  ? `${request.header("Idempotency-Key")}:recipe:${requirement.sourceId}`
                  : `recipe.complete:${requirement.sourceId}`,
                occurredAt: updatedOrder.completedAt ?? new Date(),
              });
            }
            continue;
          }
          await setInventoryReservation(tx, {
            shopId, productId: item.productId, variantId: item.variantId,
            sourceType: "OrderItem", sourceId: item.id,
            quantity: storedItemBaseQuantity(item).toString(), release: true,
          });
          for (const allocation of item.allocations) {
            const lots = await tx.inventoryLot.findMany({
              where: { inventoryBatchId: allocation.inventoryBatchId, status: "ACTIVE" },
              orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }],
            });
            let remainingAllocation = storedAllocationBaseQuantity(allocation);
            if (lots.length) {
              for (const lot of lots) {
                if (!remainingAllocation.greaterThan("0.0005")) break;
                const take = Prisma.Decimal.min(quantityDecimal(lot.quantity), remainingAllocation);
                if (!take.greaterThan(0)) continue;
                const remainingLot = quantityDecimal(lot.quantity).minus(take);
                await tx.inventoryLot.update({
                  where: { id: lot.id },
                  data: { quantity: remainingLot.toString(), ...(remainingLot.isZero() ? { status: "DEPLETED" } : {}) },
                });
                await recordInventoryMovement(tx, {
                  shopId, productId: item.productId, variantId: item.variantId,
                  inventoryBatchId: allocation.inventoryBatchId, lotId: lot.id,
                  type: "SALE", direction: "OUT", quantity: take.toString(),
                  unitCost: allocation.unitCost, sourceType: "OrderItemAllocation", sourceId: `${allocation.id}:${lot.id}`,
                  idempotencyKey: request.header("Idempotency-Key")
                    ? `${request.header("Idempotency-Key")}:sale:${allocation.id}:${lot.id}`
                    : `sale:${allocation.id}:${lot.id}`,
                  occurredAt: updatedOrder.completedAt ?? new Date(),
                });
                remainingAllocation = remainingAllocation.minus(take);
              }
              if (remainingAllocation.greaterThan("0.0005")) throw badRequest("Lot balance is lower than the reserved sale allocation.");
            } else {
              await recordInventoryMovement(tx, {
                shopId, productId: item.productId, variantId: item.variantId,
                inventoryBatchId: allocation.inventoryBatchId,
                type: "SALE", direction: "OUT", quantity: remainingAllocation.toString(),
                unitCost: allocation.unitCost, sourceType: "OrderItemAllocation", sourceId: allocation.id,
                idempotencyKey: request.header("Idempotency-Key")
                  ? `${request.header("Idempotency-Key")}:sale:${allocation.id}`
                  : `sale:${allocation.id}`,
                occurredAt: updatedOrder.completedAt ?? new Date(),
              });
            }
          }
          if (item.serialAllocations.length) {
            await tx.inventorySerial.updateMany({
              where: { id: { in: item.serialAllocations.map((entry) => entry.serialId) }, shopId, status: "RESERVED" },
              data: { status: "SOLD", soldAt: updatedOrder.completedAt ?? new Date() },
            });
          }
        }
      }
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "order.status",
        entity: "Order",
        entityId: orderId,
        metadata: { fulfillmentStatus: input.fulfillmentStatus },
      });
      return updatedOrder;
    }, ORDER_LIFECYCLE_TRANSACTION_OPTIONS);

    request.log.info({ operation: "status-update", transactionDurationMs: Date.now() - transactionStartedAt }, "Order lifecycle transaction completed");
    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders/:orderId/cancel", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = cancelOrderSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const transactionStartedAt = Date.now();
    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: { id: orderId, shopId },
        include: {
          items: {
            include: {
              // Cancellation needs the batch's current reserved quantity. Load
              // it with the order instead of issuing one extra query per
              // allocation inside the lifecycle transaction.
              allocations: { include: { inventoryBatch: true } },
              serialAllocations: true,
              modifierSelections: true,
              product: { include: { recipe: { include: { components: true } } } },
            },
          },
          payments: true,
        },
      });

      if (!existingOrder) throw notFound("Order not found.");
      if (existingOrder.fulfillmentStatus === "cancelled") {
        throw badRequest("Order is already cancelled.");
      }
      const activePaymentRecords = existingOrder.payments.filter((payment) =>
        payment.amount > 0 && !existingOrder.payments.some((reversal) =>
          reversal.amount < 0 && reversal.originalPaymentId === payment.id,
        ),
      );
      if (activePaymentRecords.length > 0) {
        throw badRequest("Cancel active payment records before cancelling this order.");
      }

      for (const item of existingOrder.items) {
        for (const requirement of recipeIngredientRequirements(item)) {
          await setInventoryReservation(tx, {
            shopId, productId: requirement.productId,
            sourceType: "RecipeOrderItem", sourceId: requirement.sourceId,
            quantity: requirement.quantity, release: true,
          });
        }
        for (const allocation of item.allocations) {
          const batch = allocation.inventoryBatch;

          if (!batch) continue;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              reservedQuantity: Math.max(
                0,
                batch.reservedQuantity - compatibilityQuantity(storedAllocationBaseQuantity(allocation)),
              ),
            },
          });
          if (existingOrder.fulfillmentStatus === "completed") {
            const saleMovements = await tx.inventoryMovement.findMany({
              where: { shopId, sourceType: "OrderItemAllocation", sourceId: { startsWith: allocation.id }, direction: "OUT" },
            });
            const reversals = saleMovements.length ? saleMovements : [{
              inventoryBatchId: allocation.inventoryBatchId,
              lotId: null,
              baseQuantity: storedAllocationBaseQuantity(allocation),
              unitCost: allocation.unitCost,
            }];
            for (const [movementIndex, saleMovement] of reversals.entries()) {
              const quantity = storedItemBaseQuantity({ quantity: 0, baseQuantity: saleMovement.baseQuantity });
              if (saleMovement.lotId) {
                const lot = await tx.inventoryLot.findUnique({ where: { id: saleMovement.lotId } });
                if (lot) await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantity: quantityDecimal(lot.quantity).plus(quantity).toString(), status: "ACTIVE" } });
              }
              await recordInventoryMovement(tx, {
                shopId, productId: item.productId, variantId: item.variantId,
                inventoryBatchId: saleMovement.inventoryBatchId ?? allocation.inventoryBatchId,
                ...(saleMovement.lotId ? { lotId: saleMovement.lotId } : {}),
                type: "SALE_REVERSAL", direction: "IN", quantity: quantity.toString(), unitCost: saleMovement.unitCost ?? allocation.unitCost,
                sourceType: "OrderCancellation", sourceId: `${orderId}:${allocation.id}:${movementIndex}`,
                idempotencyKey: `order.cancel:${orderId}:${allocation.id}:${movementIndex}`,
                reason: input.reason,
              });
            }
          }
        }
        if (item.serialAllocations.length) {
          await tx.inventorySerial.updateMany({
            where: { id: { in: item.serialAllocations.map((entry) => entry.serialId) }, shopId, status: { in: ["RESERVED", "SOLD"] } },
            data: { status: "IN_STOCK", soldAt: null },
          });
        }
        await setInventoryReservation(tx, {
          shopId, productId: item.productId, variantId: item.variantId,
          sourceType: "OrderItem", sourceId: item.id,
          quantity: storedItemBaseQuantity(item).toString(), release: true,
        });
      }

      const cancelledOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: "cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason,
        },
        include: {
          customer: true,
          items: { include: { product: true, variant: true, allocations: true } },
          payments: true,
        },
      });

      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "order.cancel",
        entity: "Order",
        entityId: orderId,
        metadata: { reason: input.reason },
      });

      return cancelledOrder;
    }, ORDER_LIFECYCLE_TRANSACTION_OPTIONS);

    request.log.info({ operation: "cancel", transactionDurationMs: Date.now() - transactionStartedAt }, "Order lifecycle transaction completed");
    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders/:orderId/product-returns", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = productReturnSchema.parse(request.body);
    await assertUserOwnsShop(authUser.id, shopId);
    const transactionStartedAt = Date.now();
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, shopId, fulfillmentStatus: "completed" },
        include: {
          items: {
            include: {
              product: true,
              allocations: true,
              returns: true,
              serialAllocations: { include: { serial: true } },
            },
          },
        },
      });
      if (!order) throw badRequest("Only completed sales can receive product returns.");
      const requestKey = request.header("Idempotency-Key");
      if (requestKey) {
        const keys = input.items.map((entry) => `${requestKey}:${entry.orderItemId}`);
        const existingReturns = await tx.customerReturn.findMany({
          where: { shopId, idempotencyKey: { in: keys } },
        });
        if (existingReturns.length === keys.length) return { returns: existingReturns, duplicate: true };
        if (existingReturns.length) throw badRequest("The idempotency key was already used for a different return payload.");
      }
      const created = [];
      for (const requested of input.items) {
        const item = order.items.find((entry) => entry.id === requested.orderItemId);
        if (!item) throw notFound("Order item not found.");
        const requestedQuantity = quantityDecimal(requested.quantity);
        const alreadyReturned = item.returns.reduce(
          (sum, entry) => sum.plus(quantityDecimal(entry.quantity)),
          new Prisma.Decimal(0),
        );
        if (alreadyReturned.plus(requestedQuantity).greaterThan(storedItemBaseQuantity(item))) {
          throw badRequest(`Return quantity exceeds sold quantity for ${item.productName}.`);
        }
        if (item.product.trackingMode === "SERIAL") {
          if (!requestedQuantity.isInteger() || requested.serialIds?.length !== requestedQuantity.toNumber()) {
            throw badRequest(`${item.productName} requires the exact sold serial for every returned unit.`);
          }
          const soldSerialIds = new Set(
            item.serialAllocations
              .filter((entry) => entry.serial.status === "SOLD")
              .map((entry) => entry.serialId),
          );
          if (new Set(requested.serialIds).size !== requested.serialIds.length ||
              requested.serialIds.some((serialId) => !soldSerialIds.has(serialId))) {
            throw badRequest("A selected serial was not sold on this order or was already returned.");
          }
        } else if (requested.serialIds?.length) {
          throw badRequest("Serial selection is only valid for serial-tracked products.");
        }
        const customerReturn = await tx.customerReturn.create({
          data: {
            shopId, orderId, orderItemId: item.id, productId: item.productId,
            ...(item.variantId ? { variantId: item.variantId } : {}),
            quantity: requestedQuantity.toString(), condition: requested.condition, reason: requested.reason,
            ...(requestKey ? { idempotencyKey: `${requestKey}:${item.id}` } : {}),
          },
        });
        let locationId: string | undefined;
        if (requested.condition === "DAMAGED") {
          const quarantine = await tx.inventoryLocation.upsert({
            where: { shopId_name: { shopId, name: "Quarantine" } },
            update: {},
            create: { shopId, name: "Quarantine", type: "QUARANTINE" },
          });
          locationId = quarantine.id;
        } else {
          let remaining = requestedQuantity;
          for (const allocation of item.allocations) {
            if (!remaining.greaterThan("0.0005")) break;
            const batch = await tx.inventoryBatch.findUnique({ where: { id: allocation.inventoryBatchId } });
            if (!batch) continue;
            const restore = Prisma.Decimal.min(remaining, storedAllocationBaseQuantity(allocation));
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              // Legacy batches encode completed allocations in reservedQuantity.
              // A sellable return releases that sold allocation; the forward ledger
              // records the physical CUSTOMER_RETURN separately below.
              data: {
                reservedQuantity: Math.max(
                  0,
                  batch.reservedQuantity - compatibilityQuantity(restore),
                ),
              },
            });
            remaining = remaining.minus(restore);
          }
          if (remaining.greaterThan("0.0005")) {
            throw badRequest(`Original inventory allocation is incomplete for ${item.productName}.`);
          }
        }
        if (requested.serialIds?.length) {
          const updated = await tx.inventorySerial.updateMany({
            where: { id: { in: requested.serialIds }, shopId, status: "SOLD" },
            data: {
              status: requested.condition === "DAMAGED" ? "QUARANTINED" : "RETURNED",
              soldAt: null,
              ...(locationId ? { locationId } : {}),
            },
          });
          if (updated.count !== requested.serialIds.length) {
            throw badRequest("One or more serials changed state before the return completed.");
          }
        }
        await recordInventoryMovement(tx, {
          shopId, productId: item.productId, variantId: item.variantId,
          type: "CUSTOMER_RETURN", direction: "IN", quantity: requestedQuantity.toString(),
          unitCost: item.unitCost, sourceType: "CustomerReturn", sourceId: customerReturn.id,
          idempotencyKey: `${String(request.header("Idempotency-Key") || `customer.return:${customerReturn.id}`)}:${item.id}`,
          reason: `${requested.condition}: ${requested.reason}`,
          ...(locationId ? { locationId } : {}),
        });
        await writeAuditLog(tx, {
          shopId, actorId: authUser.id, action: "inventory.customer_return",
          entity: "CustomerReturn", entityId: customerReturn.id,
          metadata: {
            orderId, orderItemId: item.id, quantity: requestedQuantity.toString(),
            condition: requested.condition, serialIds: requested.serialIds ?? [],
            financialRefundCreated: false,
          },
        });
        created.push(customerReturn);
      }
      return { returns: created, duplicate: false };
    }, ORDER_LIFECYCLE_TRANSACTION_OPTIONS);
    request.log.info({ operation: "product-return", transactionDurationMs: Date.now() - transactionStartedAt }, "Order lifecycle transaction completed");
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

ordersRouter.delete("/:shopId/orders/:orderId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: { payments: true },
    });

    if (!existingOrder) throw notFound("Order not found.");
    throw badRequest("Sale records are retained for history and cannot be deleted. Cancel the sale with a reason instead.");
  } catch (error) {
    next(error);
  }
});
