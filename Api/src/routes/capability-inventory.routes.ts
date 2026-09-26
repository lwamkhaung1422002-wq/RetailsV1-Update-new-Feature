import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { recordInventoryMovement } from "../lib/inventory-domain.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { assertCapability } from "../lib/store-capabilities.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const capabilityInventoryRouter = Router();
capabilityInventoryRouter.use(requireAuth);

const params = z.object({ shopId: z.string().min(1) });
// Lot, serial, and location operations are atomic inventory mutations in production.
const INVENTORY_OPERATION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const listQuery = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  location: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
const unitInput = z.object({ name: z.string().trim().min(1), symbol: z.string().trim().min(1), precision: z.number().int().min(0).max(3) });
const locationInput = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["SELLABLE", "QUARANTINE", "DAMAGED", "TRANSIT"]).default("SELLABLE"),
});
const operationInput = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  unitId: z.string().min(1),
  locationId: z.string().min(1),
  enteredQuantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().int().nonnegative(),
  reason: z.string().trim().min(1),
  lot: z.object({ lotNumber: z.string().trim().min(1), manufacturedAt: z.coerce.date().optional(), expiresAt: z.coerce.date().optional() }).optional(),
  serials: z.array(z.object({ serial: z.string().trim().min(1), imei: z.string().trim().min(1).optional() })).optional(),
});
const adjustmentOperationInput = z.object({
  balanceId: z.string().min(1),
  expectedVersion: z.coerce.number().int().nonnegative(),
  action: z.enum(["ADD", "REMOVE"]),
  quantity: z.union([z.string(), z.number()]).transform((value) => String(value)),
  reason: z.string().trim().min(1),
  unitCost: z.coerce.number().int().nonnegative().optional(),
});
const transferOperationInput = z.object({
  sourceBalanceId: z.string().min(1),
  expectedVersion: z.coerce.number().int().nonnegative(),
  targetLocationId: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).transform((value) => String(value)),
  reason: z.string().trim().min(1),
});
const serialDispositionInput = z.object({
  disposition: z.enum(["RESTOCK", "SUPPLIER_RETURN"]),
  reason: z.string().trim().min(1),
});

function badRequest(message: string) {
  return Object.assign(new Error(message), { name: "BadRequestError" });
}

async function unitInUse(db: Prisma.TransactionClient, unitId: string) {
  const references = await Promise.all([
    db.productUnit.findFirst({ where: { unitId }, select: { id: true } }),
    db.inventoryMovement.findFirst({ where: { unitId }, select: { id: true } }),
    db.orderItem.findFirst({ where: { unitId }, select: { id: true } }),
    db.purchaseItem.findFirst({ where: { unitId }, select: { id: true } }),
  ]);
  return references.some(Boolean);
}

function unitInUseConflict() {
  return Object.assign(new Error("This unit is already in use and cannot be deleted."), { name: "ConflictError" });
}

capabilityInventoryRouter.get("/:shopId/units", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const units = await prisma.unitOfMeasure.findMany({ where: { shopId }, orderBy: { name: "asc" } });
    response.json({ units: await Promise.all(units.map(async (unit) => ({ ...unit, canDelete: !(await unitInUse(prisma, unit.id)) }))) });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/units", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = unitInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId); await assertCapability(prisma, shopId, "catalog.units");
    const unit = await prisma.unitOfMeasure.create({ data: { shopId, ...input } });
    response.status(201).json({ unit: { ...unit, canDelete: true } });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.delete("/:shopId/units/:unitId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId, unitId } = params.extend({ unitId: z.string().min(1) }).parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    await assertCapability(prisma, shopId, "catalog.units");
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unitOfMeasure.findFirst({ where: { id: unitId, shopId }, select: { id: true } });
      if (!unit) throw Object.assign(new Error("Unit not found."), { name: "NotFoundError" });
      if (await unitInUse(tx, unitId)) throw unitInUseConflict();
      try {
        await tx.unitOfMeasure.delete({ where: { id: unitId } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw unitInUseConflict();
        throw error;
      }
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

capabilityInventoryRouter.get("/:shopId/locations", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    response.json({ locations: await prisma.inventoryLocation.findMany({ where: { shopId }, orderBy: { name: "asc" } }) });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/locations", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = locationInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const location = await prisma.inventoryLocation.create({ data: { shopId, ...input } });
    response.status(201).json({ location });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.get("/:shopId/inventory-balances", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const query = listQuery.parse(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const where = {
      shopId,
      ...(query.location ? { locationId: query.location } : {}),
      ...(query.search ? { OR: [
        { product: { name: { contains: query.search, mode: "insensitive" as const } } },
        { product: { sku: { contains: query.search, mode: "insensitive" as const } } },
        { product: { barcodes: { some: { status: "ACTIVE", OR: [
          { value: { contains: query.search, mode: "insensitive" as const } },
          { normalizedValue: { contains: query.search, mode: "insensitive" as const } },
        ] } } } },
      ] } : {}),
    };
    const [balances, totalCount] = await prisma.$transaction([
      prisma.inventoryBalance.findMany({
        where, include: { product: true, variant: true, location: true },
        orderBy: { updatedAt: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
      prisma.inventoryBalance.count({ where }),
    ]);
    response.json({ balances: balances.map((balance) => ({ ...balance, available: Number(balance.onHand) - Number(balance.reserved) })), totalCount });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.get("/:shopId/inventory-movements", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const query = listQuery.parse(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const where = {
      shopId, ...(query.status ? { type: query.status } : {}), ...(query.location ? { locationId: query.location } : {}),
      ...(query.search ? { OR: [
        { product: { name: { contains: query.search, mode: "insensitive" as const } } },
        { product: { sku: { contains: query.search, mode: "insensitive" as const } } },
        { product: { barcodes: { some: { status: "ACTIVE", OR: [
          { value: { contains: query.search, mode: "insensitive" as const } },
          { normalizedValue: { contains: query.search, mode: "insensitive" as const } },
        ] } } } },
        { sourceId: { contains: query.search, mode: "insensitive" as const } },
      ] } : {}),
    };
    const [movements, totalCount] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where, include: { product: { include: { barcodes: { where: { status: "ACTIVE" } } } }, variant: true, location: true, unit: true },
        orderBy: { occurredAt: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    const allocationIds = movements
      .filter((movement) => movement.sourceType === "OrderItemAllocation")
      .map((movement) => movement.sourceId?.split(":")[0])
      .filter((value): value is string => Boolean(value));
    const cancelledOrderIds = movements
      .filter((movement) => movement.type === "SALE_REVERSAL" && movement.sourceType === "OrderCancellation")
      .map((movement) => movement.sourceId?.split(":")[0])
      .filter((value): value is string => Boolean(value));
    const allocations = allocationIds.length
      ? await prisma.orderItemAllocation.findMany({ where: { id: { in: allocationIds } } })
      : [];
    const orderItems = allocations.length
      ? await prisma.orderItem.findMany({
          where: { id: { in: allocations.map((allocation) => allocation.orderItemId) } },
          select: { id: true, orderId: true },
        })
      : [];
    const orderIds = [...new Set([...orderItems.map((item) => item.orderId), ...cancelledOrderIds])];
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderIdByItemId = new Map(orderItems.map((item) => [item.id, item.orderId]));
    const invoiceByOrderId = new Map(orders.map((order) => [order.id, order.orderNumber || order.id]));
    const invoiceByAllocationId = new Map(allocations.map((allocation) => [
      allocation.id,
      invoiceByOrderId.get(orderIdByItemId.get(allocation.orderItemId) || ""),
    ]));
    response.json({
      movements: movements.map((movement) => {
        const isCancelledOrderReturn = movement.type === "SALE_REVERSAL" && movement.sourceType === "OrderCancellation";
        const invoiceNumber = movement.sourceType === "OrderItemAllocation" && movement.sourceId
          ? invoiceByAllocationId.get(movement.sourceId.split(":")[0] ?? "") ?? null
          : isCancelledOrderReturn && movement.sourceId
            ? invoiceByOrderId.get(movement.sourceId.split(":")[0] ?? "") ?? null
            : null;
        return { ...movement, invoiceNumber, sourceId: isCancelledOrderReturn && invoiceNumber ? `RETURN:${invoiceNumber}` : movement.sourceId };
      }),
      totalCount,
    });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/inventory-operations/receive", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = operationInput.parse(request.body);
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw badRequest("Idempotency-Key header is required.");
    await assertUserOwnsShop(auth.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { ledgerEnabled: true },
    });
    if (!shop.ledgerEnabled) {
      throw badRequest("Ledger dual-write must be enabled before using capability inventory operations.");
    }
    const product = await prisma.product.findFirst({ where: { id: input.productId, shopId }, include: { units: { include: { unit: true } } } });
    if (!product) throw badRequest("Product not found.");
    const productUnit = product.units.find((entry) => entry.unitId === input.unitId && entry.canPurchase);
    if (!productUnit) throw badRequest("Purchase unit is not enabled for this product.");
    const enteredQuantity = new Prisma.Decimal(String(input.enteredQuantity));
    if (enteredQuantity.decimalPlaces() > productUnit.unit.precision) {
      throw badRequest(`This unit accepts at most ${productUnit.unit.precision} decimal places.`);
    }
    const baseQuantity = enteredQuantity
      .mul(productUnit.conversionFactor)
      .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
    if (product.trackingMode === "LOT" || product.trackingMode === "EXPIRY") {
      await assertCapability(prisma, shopId, "inventory.lots");
      if (!input.lot) throw badRequest("Lot details are required.");
      if (product.trackingMode === "EXPIRY") {
        await assertCapability(prisma, shopId, "inventory.expiry");
        if (!input.lot.expiresAt) throw badRequest("Expiry date is required for this product.");
      }
    } else if (input.lot) throw badRequest("Lot details are not supported by this product.");
    if (product.trackingMode === "SERIAL") {
      await assertCapability(prisma, shopId, "inventory.serials");
      if (!baseQuantity.isInteger() || input.serials?.length !== baseQuantity.toNumber()) throw badRequest("Exact serial records are required for every received item.");
    } else if (input.serials?.length) throw badRequest("Serial details are not supported by this product.");

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryMovement.findFirst({ where: { shopId, idempotencyKey } });
      if (existing) return { movement: existing, duplicate: true };
      const batch = await tx.inventoryBatch.create({
        data: {
          shopId, productId: product.id, ...(input.variantId ? { variantId: input.variantId } : {}),
          quantity: baseQuantity.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
          baseQuantity,
          unitCost: input.unitCost,
          note: input.reason,
        },
      });
      let lotId: string | undefined;
      if (input.lot) {
        const lot = await tx.inventoryLot.create({ data: {
          shopId, productId: product.id, ...(input.variantId ? { variantId: input.variantId } : {}),
          locationId: input.locationId, inventoryBatchId: batch.id, lotNumber: input.lot.lotNumber,
          quantity: baseQuantity, unitCost: input.unitCost,
          ...(input.lot.manufacturedAt ? { manufacturedAt: input.lot.manufacturedAt } : {}),
          ...(input.lot.expiresAt ? { expiresAt: input.lot.expiresAt } : {}),
        } });
        lotId = lot.id;
      }
      for (const serial of input.serials ?? []) {
        await tx.inventorySerial.create({ data: {
          shopId, productId: product.id, ...(input.variantId ? { variantId: input.variantId } : {}),
          locationId: input.locationId, serial: serial.serial, ...(serial.imei ? { imei: serial.imei } : {}),
        } });
      }
      const movement = await recordInventoryMovement(tx, {
        shopId, productId: product.id, ...(input.variantId ? { variantId: input.variantId } : {}),
        inventoryBatchId: batch.id,
        locationId: input.locationId, type: "PURCHASE_RECEIPT", direction: "IN",
        quantity: baseQuantity.toString(), unitCost: input.unitCost, sourceType: "InventoryOperation", sourceId: batch.id,
        idempotencyKey, reason: input.reason,
      });
      if (lotId && movement) await tx.inventoryMovement.update({ where: { id: movement.id }, data: { lotId } });
      return { movement, batch, duplicate: false };
    }, INVENTORY_OPERATION_TRANSACTION_OPTIONS);
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/inventory-operations/adjust", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = adjustmentOperationInput.parse(request.body);
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw badRequest("Idempotency-Key header is required.");
    await assertUserOwnsShop(auth.id, shopId);
    const quantity = new Prisma.Decimal(input.quantity).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
    if (!quantity.isPositive()) throw badRequest("Adjustment quantity must be greater than zero.");

    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.inventoryMovement.findFirst({ where: { shopId, idempotencyKey } });
      if (duplicate) {
        const balance = await tx.inventoryBalance.findFirstOrThrow({ where: { id: input.balanceId, shopId } });
        return { movement: duplicate, balance, duplicate: true };
      }
      const balance = await tx.inventoryBalance.findFirst({
        where: { id: input.balanceId, shopId },
        include: { product: true },
      });
      if (!balance) throw badRequest("Inventory balance not found.");
      if (balance.version !== input.expectedVersion) {
        throw Object.assign(new Error("Inventory balance changed concurrently; refresh and retry."), { name: "ConflictError" });
      }
      if (input.action === "REMOVE" && new Prisma.Decimal(balance.onHand).minus(balance.reserved).lessThan(quantity)) {
        throw Object.assign(new Error("Adjustment would make available stock negative."), { name: "ConflictError" });
      }

      let compatibilityBatchId: string | undefined;
      if (input.action === "ADD") {
        const batch = await tx.inventoryBatch.create({
          data: {
            shopId,
            productId: balance.productId,
            ...(balance.variantId ? { variantId: balance.variantId } : {}),
            quantity: quantity.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
            baseQuantity: quantity,
            unitCost: input.unitCost ?? balance.product.cost ?? 0,
            note: input.reason,
          },
        });
        compatibilityBatchId = batch.id;
      } else {
        let remaining = quantity;
        const batches = await tx.inventoryBatch.findMany({
          where: {
            shopId,
            productId: balance.productId,
            variantId: balance.variantId,
          },
          orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
        });
        for (const batch of batches) {
          if (!remaining.isPositive()) break;
          const batchQuantity = new Prisma.Decimal(batch.baseQuantity ?? batch.quantity);
          const protectedQuantity = new Prisma.Decimal(batch.reservedQuantity);
          const removable = Prisma.Decimal.max(0, batchQuantity.minus(protectedQuantity));
          const removed = Prisma.Decimal.min(removable, remaining);
          if (!removed.isPositive()) continue;
          const next = batchQuantity.minus(removed);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              baseQuantity: next,
              quantity: next.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
            },
          });
          compatibilityBatchId ??= batch.id;
          remaining = remaining.minus(removed);
        }
        if (remaining.greaterThan("0.0005")) {
          throw Object.assign(
            new Error(`Legacy inventory could not satisfy the adjustment (${remaining.toString()} remaining across ${batches.length} batches).`),
            { name: "ConflictError" },
          );
        }
      }

      const movement = await recordInventoryMovement(tx, {
        shopId,
        productId: balance.productId,
        variantId: balance.variantId,
        ...(compatibilityBatchId ? { inventoryBatchId: compatibilityBatchId } : {}),
        locationId: balance.locationId,
        type: input.action === "ADD" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        direction: input.action === "ADD" ? "IN" : "OUT",
        quantity: quantity.toString(),
        unitCost: input.unitCost ?? balance.product.cost ?? 0,
        sourceType: "InventoryBalanceAdjustment",
        sourceId: balance.id,
        idempotencyKey,
        reason: input.reason,
      });
      await writeAuditLog(tx, {
        shopId,
        actorId: auth.id,
        action: "inventory.adjust",
        entity: "InventoryBalance",
        entityId: balance.id,
        metadata: {
          action: input.action,
          quantity: quantity.toString(),
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        },
      });
      const refreshed = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
      return { movement, balance: refreshed, duplicate: false };
    }, INVENTORY_OPERATION_TRANSACTION_OPTIONS);
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/inventory-operations/transfer", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = transferOperationInput.parse(request.body);
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw badRequest("Idempotency-Key header is required.");
    await assertUserOwnsShop(auth.id, shopId);
    const quantity = new Prisma.Decimal(input.quantity).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
    if (!quantity.greaterThan(0)) throw badRequest("Transfer quantity must be greater than zero.");

    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.inventoryMovement.findFirst({
        where: { shopId, idempotencyKey: `${idempotencyKey}:out` },
      });
      if (duplicate) {
        const sourceBalance = await tx.inventoryBalance.findFirstOrThrow({ where: { id: input.sourceBalanceId, shopId } });
        return { movement: duplicate, sourceBalance, duplicate: true };
      }
      const source = await tx.inventoryBalance.findFirst({
        where: { id: input.sourceBalanceId, shopId },
        include: { product: true },
      });
      if (!source) throw badRequest("Source inventory balance not found.");
      if (source.version !== input.expectedVersion) {
        throw Object.assign(new Error("Inventory balance changed concurrently; refresh and retry."), { name: "ConflictError" });
      }
      if (source.locationId === input.targetLocationId) throw badRequest("Source and target locations must be different.");
      await tx.inventoryLocation.findFirstOrThrow({ where: { id: input.targetLocationId, shopId, isActive: true } });
      if (source.product.trackingMode !== "NONE") {
        throw badRequest("Tracked lot or serial inventory must use its exact tracked-item transfer workflow.");
      }
      if (new Prisma.Decimal(source.onHand).minus(source.reserved).lessThan(quantity)) {
        throw Object.assign(new Error("Transfer would make source availability negative."), { name: "ConflictError" });
      }
      const sourceRef = `${source.id}:${input.targetLocationId}`;
      const outMovement = await recordInventoryMovement(tx, {
        shopId, productId: source.productId, variantId: source.variantId,
        locationId: source.locationId, type: "TRANSFER_OUT", direction: "OUT",
        quantity: quantity.toString(), unitCost: source.product.cost ?? 0,
        sourceType: "InventoryTransfer", sourceId: sourceRef,
        idempotencyKey: `${idempotencyKey}:out`, reason: input.reason,
      });
      const inMovement = await recordInventoryMovement(tx, {
        shopId, productId: source.productId, variantId: source.variantId,
        locationId: input.targetLocationId, type: "TRANSFER_IN", direction: "IN",
        quantity: quantity.toString(), unitCost: source.product.cost ?? 0,
        sourceType: "InventoryTransfer", sourceId: sourceRef,
        idempotencyKey: `${idempotencyKey}:in`, reason: input.reason,
      });
      await writeAuditLog(tx, {
        shopId, actorId: auth.id, action: "inventory.transfer",
        entity: "InventoryBalance", entityId: source.id,
        metadata: {
          targetLocationId: input.targetLocationId,
          quantity: quantity.toString(),
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        },
      });
      const sourceBalance = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: source.id } });
      const targetBalance = await tx.inventoryBalance.findFirstOrThrow({
        where: {
          shopId, productId: source.productId, variantId: source.variantId,
          locationId: input.targetLocationId,
        },
      });
      return { outMovement, inMovement, sourceBalance, targetBalance, duplicate: false };
    }, INVENTORY_OPERATION_TRANSACTION_OPTIONS);
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

capabilityInventoryRouter.get("/:shopId/lots", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const query = listQuery.parse(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const where = { shopId, ...(query.status ? { status: query.status } : {}), ...(query.location ? { locationId: query.location } : {}) };
    const [lots, totalCount] = await prisma.$transaction([
      prisma.inventoryLot.findMany({ where, include: { product: true, variant: true, location: true }, orderBy: { expiresAt: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.inventoryLot.count({ where }),
    ]);
    response.json({ lots, totalCount });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.get("/:shopId/serials", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const query = listQuery.parse(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const where = {
      shopId, ...(query.status ? { status: query.status } : {}), ...(query.location ? { locationId: query.location } : {}),
      ...(query.search ? { OR: [{ serial: { contains: query.search, mode: "insensitive" as const } }, { imei: { contains: query.search, mode: "insensitive" as const } }] } : {}),
    };
    const [serials, totalCount] = await prisma.$transaction([
      prisma.inventorySerial.findMany({ where, include: { product: true, variant: true, location: true, warranties: true }, orderBy: { createdAt: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.inventorySerial.count({ where }),
    ]);
    response.json({ serials, totalCount });
  } catch (error) { next(error); }
});

capabilityInventoryRouter.post("/:shopId/serials/:serialId/disposition", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params);
    const serialId = z.string().min(1).parse(request.params.serialId);
    const input = serialDispositionInput.parse(request.body);
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw badRequest("Idempotency-Key header is required.");
    await assertUserOwnsShop(auth.id, shopId);
    await assertCapability(prisma, shopId, "inventory.serials");
    const result = await prisma.$transaction(async (tx) => {
      const serial = await tx.inventorySerial.findFirst({
        where: { id: serialId, shopId },
        include: {
          location: true,
          orderAllocations: { include: { orderItem: { include: { allocations: true } } } },
        },
      });
      if (!serial) throw badRequest("Serial not found.");
      const targetStatus = input.disposition === "RESTOCK" ? "IN_STOCK" : "SUPPLIER_RETURNED";
      if (serial.status === targetStatus) return { serial, duplicate: true };
      if (!["RETURNED", "QUARANTINED"].includes(serial.status)) {
        throw badRequest("Only returned or quarantined serials can receive an inspection disposition.");
      }
      const sellableLocation = input.disposition === "RESTOCK"
        ? await tx.inventoryLocation.findFirst({ where: { shopId, type: "SELLABLE", isActive: true }, orderBy: { createdAt: "asc" } })
        : null;
      if (input.disposition === "RESTOCK" && !sellableLocation) throw badRequest("A sellable inventory location is required.");

      if (serial.status === "QUARANTINED" && input.disposition === "RESTOCK") {
        const allocation = serial.orderAllocations[0]?.orderItem.allocations[0];
        if (!allocation) throw badRequest("The original sold inventory allocation could not be found.");
        const batch = await tx.inventoryBatch.findUnique({ where: { id: allocation.inventoryBatchId } });
        if (!batch || batch.reservedQuantity < 1) throw badRequest("The original sold allocation is inconsistent.");
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { reservedQuantity: batch.reservedQuantity - 1 },
        });
      }

      if (serial.status === "QUARANTINED") {
        await recordInventoryMovement(tx, {
          shopId, productId: serial.productId, variantId: serial.variantId,
          locationId: serial.locationId, serialId: serial.id,
          type: input.disposition === "RESTOCK" ? "TRANSFER_OUT" : "SUPPLIER_RETURN",
          direction: "OUT", quantity: 1, sourceType: "SerialDisposition", sourceId: serial.id,
          idempotencyKey: `${idempotencyKey}:out`, reason: input.reason,
        });
      }
      if (serial.status === "QUARANTINED" && input.disposition === "RESTOCK") {
        await recordInventoryMovement(tx, {
          shopId, productId: serial.productId, variantId: serial.variantId,
          locationId: sellableLocation!.id, serialId: serial.id,
          type: "TRANSFER_IN", direction: "IN", quantity: 1,
          sourceType: "SerialDisposition", sourceId: serial.id,
          idempotencyKey: `${idempotencyKey}:in`, reason: input.reason,
        });
      }
      const updated = await tx.inventorySerial.update({
        where: { id: serial.id },
        data: {
          status: targetStatus,
          ...(sellableLocation ? { locationId: sellableLocation.id } : {}),
        },
      });
      await writeAuditLog(tx, {
        shopId, actorId: auth.id, action: "inventory.serial_disposition",
        entity: "InventorySerial", entityId: serial.id,
        metadata: {
          from: serial.status, to: targetStatus, disposition: input.disposition,
          reason: input.reason, fromLocationId: serial.locationId,
          toLocationId: sellableLocation?.id ?? serial.locationId,
        },
      });
      return { serial: updated, duplicate: false };
    });
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});
