import { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;
const QUANTITY_SCALE = 3;

function quantityDecimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export type MovementInput = {
  shopId: string;
  productId: string;
  variantId?: string | null;
  inventoryBatchId?: string | null;
  type: string;
  direction: "IN" | "OUT";
  quantity: number | string;
  unitId?: string;
  enteredQuantity?: number | string;
  conversionFactor?: number | string;
  unitCost?: number | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  reason?: string;
  staffName?: string;
  occurredAt?: Date;
  locationId?: string;
  lotId?: string;
  serialId?: string;
};

export async function ensureInventoryDefaults(tx: Tx, shopId: string) {
  // New shops create these records during template setup.  Inventory writes are
  // on the checkout critical path, so avoid a write-style upsert when they are
  // already present; retain the same upsert fallback for older shops.
  const location = await tx.inventoryLocation.findUnique({
    where: { shopId_name: { shopId, name: "Main" } },
  }) ?? await tx.inventoryLocation.upsert({
    where: { shopId_name: { shopId, name: "Main" } },
    update: {},
    create: { shopId, name: "Main", type: "SELLABLE" },
  });
  const unit = await tx.unitOfMeasure.findUnique({
    where: { shopId_name: { shopId, name: "Piece" } },
  }) ?? await tx.unitOfMeasure.upsert({
    where: { shopId_name: { shopId, name: "Piece" } },
    update: {},
    create: { shopId, name: "Piece", symbol: "pc", precision: 0 },
  });
  return { location, unit };
}

export async function recordInventoryMovement(tx: Tx, input: MovementInput) {
  const existing = await tx.inventoryMovement.findFirst({
    where: { shopId: input.shopId, idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const shop = await tx.shop.findUniqueOrThrow({
    where: { id: input.shopId },
    select: { ledgerEnabled: true },
  });
  if (!shop.ledgerEnabled) return null;

  const defaults = await ensureInventoryDefaults(tx, input.shopId);
  const location = input.locationId
    ? await tx.inventoryLocation.findFirstOrThrow({ where: { id: input.locationId, shopId: input.shopId } })
    : defaults.location;
  const unit = defaults.unit;
  const quantity = quantityDecimal(input.quantity);
  const current = await tx.inventoryBalance.findFirst({
    where: {
      shopId: input.shopId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      locationId: location.id,
    },
  });
  const signed = input.direction === "IN" ? quantity : quantity.negated();
  const nextOnHand = quantityDecimal(current?.onHand ?? 0).plus(signed);
  if (nextOnHand.lessThan(quantityDecimal(current?.reserved ?? 0))) {
    const error = new Error("Inventory movement would make available stock negative.");
    error.name = "ConflictError";
    throw error;
  }
  if (current) {
    const updated = await tx.inventoryBalance.updateMany({
      where: { id: current.id, version: current.version },
      data: { onHand: nextOnHand, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw Object.assign(new Error("Inventory balance changed concurrently; retry the operation."), { name: "ConflictError" });
    }
  } else {
    await tx.inventoryBalance.create({
      data: {
        shopId: input.shopId, productId: input.productId,
        ...(input.variantId ? { variantId: input.variantId } : {}),
        locationId: location.id, onHand: nextOnHand, reserved: 0,
      },
    });
  }
  return tx.inventoryMovement.create({
    data: {
      shopId: input.shopId, productId: input.productId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
      locationId: location.id, unitId: input.unitId ?? unit.id,
      ...(input.inventoryBatchId ? { inventoryBatchId: input.inventoryBatchId } : {}),
      ...(input.lotId ? { lotId: input.lotId } : {}),
      ...(input.serialId ? { serialId: input.serialId } : {}),
      type: input.type, direction: input.direction,
      baseQuantity: quantity, enteredQuantity: input.enteredQuantity ?? quantity, conversionFactor: input.conversionFactor ?? 1,
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      sourceType: input.sourceType, sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.staffName ? { staffName: input.staffName } : {}),
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

export async function setInventoryReservation(tx: Tx, input: {
  shopId: string; productId: string; variantId?: string | null;
  sourceType: string; sourceId: string; quantity: number | string | Prisma.Decimal; release?: boolean;
}) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: input.shopId }, select: { ledgerEnabled: true } });
  if (!shop.ledgerEnabled) return null;
  const { location } = await ensureInventoryDefaults(tx, input.shopId);
  const existing = await tx.inventoryReservation.findFirst({
    where: {
      shopId: input.shopId, productId: input.productId, variantId: input.variantId ?? null,
      locationId: location.id, sourceType: input.sourceType, sourceId: input.sourceId,
    },
  });
  const balance = await tx.inventoryBalance.findFirst({
    where: { shopId: input.shopId, productId: input.productId, variantId: input.variantId ?? null, locationId: location.id },
  });
  if (!balance) throw Object.assign(new Error("Ledger balance does not exist for reservation."), { name: "ConflictError" });
  const previous = existing?.status === "ACTIVE" ? quantityDecimal(existing.quantity) : quantityDecimal(0);
  const next = input.release ? quantityDecimal(0) : quantityDecimal(input.quantity);
  const nextReserved = quantityDecimal(balance.reserved).minus(previous).plus(next);
  if (quantityDecimal(balance.onHand).minus(nextReserved).isNegative()) {
    throw Object.assign(new Error("Insufficient available inventory for reservation."), { name: "ConflictError" });
  }
  const updated = await tx.inventoryBalance.updateMany({
    where: { id: balance.id, version: balance.version },
    data: { reserved: nextReserved, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw Object.assign(new Error("Inventory balance changed concurrently; retry the operation."), { name: "ConflictError" });
  }
  if (existing) {
    return tx.inventoryReservation.update({
      where: { id: existing.id },
      data: { quantity: quantityDecimal(input.quantity), status: input.release ? "RELEASED" : "ACTIVE", releasedAt: input.release ? new Date() : null },
    });
  }
  return tx.inventoryReservation.create({
    data: {
      shopId: input.shopId, productId: input.productId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
      locationId: location.id, sourceType: input.sourceType, sourceId: input.sourceId,
      quantity: quantityDecimal(input.quantity), status: input.release ? "RELEASED" : "ACTIVE",
      ...(input.release ? { releasedAt: new Date() } : {}),
    },
  });
}
