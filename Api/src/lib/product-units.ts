import { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;
export type ProductUnitInput = {
  unitId: string;
  conversionFactor: number;
  isBase?: boolean | undefined;
  canSell?: boolean | undefined;
  canPurchase?: boolean | undefined;
  minimumOrderQty?: number | undefined;
};

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { name: "BadRequestError" });
}

export async function validateProductUnits(tx: Tx, shopId: string, units: ProductUnitInput[], existingUnitIds = new Set<string>()): Promise<void> {
  if (!units.length || units.filter((unit) => unit.isBase).length !== 1) throw badRequest("Exactly one base unit is required.");
  if (new Set(units.map((unit) => unit.unitId)).size !== units.length) throw badRequest("Duplicate product units are not allowed.");
  const base = units.find((unit) => unit.isBase)!;
  if (base.conversionFactor !== 1) throw badRequest("The base unit conversion factor must be 1.");
  if (base.canSell === false) throw badRequest("The base unit must remain sellable for barcode sales.");
  const ownedUnits = await tx.unitOfMeasure.findMany({ where: { shopId, id: { in: units.map((unit) => unit.unitId) } } });
  if (ownedUnits.length !== units.length || ownedUnits.some((unit) => !unit.isActive && !existingUnitIds.has(unit.id))) {
    throw badRequest("A selected unit is unavailable in this shop.");
  }
  const basePrecision = ownedUnits.find((unit) => unit.id === base.unitId)!.precision;
  for (const unit of units) {
    if (!Number.isFinite(unit.conversionFactor) || unit.conversionFactor <= 0 || new Prisma.Decimal(unit.conversionFactor).decimalPlaces() > 6) {
      throw badRequest("Unit conversion factors must be positive with at most 6 decimal places.");
    }
    if (basePrecision === 0 && !Number.isInteger(unit.conversionFactor)) {
      throw badRequest("Indivisible base units require an integer conversion factor.");
    }
  }
}

export async function createProductUnits(tx: Tx, shopId: string, productId: string, units: ProductUnitInput[]): Promise<void> {
  await validateProductUnits(tx, shopId, units);
  for (const unit of units) {
    await tx.productUnit.create({ data: {
      productId, unitId: unit.unitId, conversionFactor: String(unit.conversionFactor), isBase: unit.isBase ?? false,
      canSell: unit.canSell ?? true, canPurchase: unit.canPurchase ?? true,
      ...(unit.minimumOrderQty !== undefined ? { minimumOrderQty: String(unit.minimumOrderQty) } : {}),
    } });
  }
}

export async function reconcileProductUnits(tx: Tx, shopId: string, productId: string, units: ProductUnitInput[]): Promise<void> {
  const existing = await tx.productUnit.findMany({ where: { productId } });
  await validateProductUnits(tx, shopId, units, new Set(existing.map((unit) => unit.unitId)));
  const oldBase = existing.find((unit) => unit.isBase);
  const newBase = units.find((unit) => unit.isBase)!;
  if (oldBase?.unitId !== newBase.unitId) {
    const history = await Promise.all([
      tx.inventoryBatch.count({ where: { shopId, productId } }),
      tx.inventoryMovement.count({ where: { shopId, productId } }),
      tx.inventoryBalance.count({ where: { shopId, productId } }),
      tx.inventoryReservation.count({ where: { shopId, productId } }),
      tx.orderItem.count({ where: { productId } }),
      tx.purchaseItem.count({ where: { productId } }),
    ]);
    if (history.some(Boolean)) throw badRequest("The base unit cannot change after inventory, sale, or purchase activity.");
  }

  let newBaseId: string | null = null;
  for (const unit of units) {
    const previous = existing.find((item) => item.unitId === unit.unitId);
    const data = {
      conversionFactor: String(unit.conversionFactor), isBase: unit.isBase ?? false,
      canSell: unit.canSell ?? true, canPurchase: unit.canPurchase ?? true,
      minimumOrderQty: unit.minimumOrderQty === undefined ? null : String(unit.minimumOrderQty),
    };
    const saved = previous
      ? await tx.productUnit.update({ where: { id: previous.id }, data })
      : await tx.productUnit.create({ data: { productId, unitId: unit.unitId, ...data } });
    if (unit.isBase) newBaseId = saved.id;
  }
  if (oldBase?.unitId !== newBase.unitId && newBaseId) {
    await tx.productBarcode.updateMany({ where: { shopId, productId, status: "ACTIVE", isPrimary: true }, data: { productUnitId: newBaseId } });
  }
  for (const previous of existing.filter((unit) => !units.some((next) => next.unitId === unit.unitId))) {
    const dependencies = await Promise.all([
      tx.orderItem.count({ where: { productId, unitId: previous.unitId } }),
      tx.purchaseItem.count({ where: { productId, unitId: previous.unitId } }),
      tx.inventoryMovement.count({ where: { shopId, productId, unitId: previous.unitId } }),
      tx.productBarcode.count({ where: { productUnitId: previous.id } }),
      tx.priceTier.count({ where: { productUnitId: previous.id } }),
      tx.priceEntry.count({ where: { productUnitId: previous.id } }),
      tx.promotion.count({ where: { productUnitId: previous.id } }),
    ]);
    if (dependencies.some(Boolean)) {
      await tx.productUnit.update({ where: { id: previous.id }, data: { isBase: false, canSell: false, canPurchase: false } });
    } else {
      await tx.productUnit.delete({ where: { id: previous.id } });
    }
  }
}
