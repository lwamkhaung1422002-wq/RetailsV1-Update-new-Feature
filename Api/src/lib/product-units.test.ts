import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { createProductUnits, reconcileProductUnits, type ProductUnitInput } from "./product-units.js";

const piece: ProductUnitInput = { unitId: "piece", conversionFactor: 1, isBase: true, canSell: true, canPurchase: true };
const pack: ProductUnitInput = { unitId: "pack", conversionFactor: 6, isBase: false, minimumOrderQty: 1, canSell: true, canPurchase: true };
const carton: ProductUnitInput = { unitId: "carton", conversionFactor: 24, isBase: false, minimumOrderQty: 3, canSell: true, canPurchase: true };

function fixture() {
  type SavedUnit = { id: string; productId: string; unitId: string; conversionFactor: string; isBase: boolean; canSell: boolean; canPurchase: boolean; minimumOrderQty: string | null };
  const units: SavedUnit[] = [];
  const barcodes = [{ productId: "product", productUnitId: "", isPrimary: true, status: "ACTIVE" }];
  const state = { inventoryHistory: 0, saleHistory: 0, purchaseHistory: 0, inactiveUnitIds: new Set<string>(), usedMovementUnitIds: new Set<string>(), usedSaleUnitIds: new Set<string>(), usedPurchaseUnitIds: new Set<string>(), usedBarcodeUnitIds: new Set<string>(), usedTierUnitIds: new Set<string>(), usedPriceEntryUnitIds: new Set<string>(), usedPromotionUnitIds: new Set<string>() };
  const tx = {
    unitOfMeasure: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, precision: 0, isActive: !state.inactiveUnitIds.has(id) })).filter((unit) => ["piece", "pack", "carton"].includes(unit.id)) },
    productUnit: {
      findMany: async () => units.map((unit) => ({ ...unit, unit: { name: unit.unitId } })),
      create: async ({ data }: { data: Omit<SavedUnit, "id"> }) => {
        const saved = { ...data, minimumOrderQty: data.minimumOrderQty ?? null, id: `unit-${units.length + 1}` };
        units.push(saved);
        return saved;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<SavedUnit> }) => {
        const saved = units.find((unit) => unit.id === where.id)!;
        Object.assign(saved, data);
        return saved;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        units.splice(units.findIndex((unit) => unit.id === where.id), 1);
      },
    },
    productBarcode: {
      updateMany: async ({ data }: { data: { productUnitId: string } }) => { barcodes[0]!.productUnitId = data.productUnitId; },
      count: async ({ where }: { where: { productUnitId: string; NOT?: unknown } }) => Number(state.usedBarcodeUnitIds.has(where.productUnitId)) + barcodes.filter((barcode) => barcode.productUnitId === where.productUnitId && !where.NOT).length,
    },
    inventoryBatch: { count: async () => state.inventoryHistory },
    inventoryMovement: { count: async ({ where }: { where: { unitId?: string } }) => where.unitId ? Number(state.usedMovementUnitIds.has(where.unitId)) : state.inventoryHistory },
    inventoryBalance: { count: async () => state.inventoryHistory },
    inventoryReservation: { count: async () => state.inventoryHistory },
    orderItem: { count: async ({ where }: { where: { unitId?: string } }) => where.unitId ? Number(state.usedSaleUnitIds.has(where.unitId)) : state.saleHistory },
    purchaseItem: { count: async ({ where }: { where: { unitId?: string } }) => where.unitId ? Number(state.usedPurchaseUnitIds.has(where.unitId)) : state.purchaseHistory },
    priceTier: { count: async ({ where }: { where: { productUnitId: string } }) => Number(state.usedTierUnitIds.has(where.productUnitId)) },
    priceEntry: { count: async ({ where }: { where: { productUnitId: string } }) => Number(state.usedPriceEntryUnitIds.has(where.productUnitId)) },
    promotion: { count: async ({ where }: { where: { productUnitId: string } }) => Number(state.usedPromotionUnitIds.has(where.productUnitId)) },
  } as unknown as Prisma.TransactionClient;
  const create = (input: ProductUnitInput[]) => createProductUnits(tx, "shop", "product", input);
  const edit = (input: ProductUnitInput[]) => reconcileProductUnits(tx, "shop", "product", input);
  return { units, barcodes, state, create, edit };
}

describe("product unit configuration", () => {
  it("creates Piece, Pack and Carton with conversion, MOQ and purchase/sell flags", async () => {
    const sample = fixture();
    await sample.create([piece, pack, carton]);
    expect(sample.units).toHaveLength(3);
    expect(sample.units.filter((unit) => unit.isBase)).toHaveLength(1);
    expect(sample.units.map((unit) => [unit.unitId, unit.conversionFactor, unit.minimumOrderQty])).toEqual([
      ["piece", "1", null], ["pack", "6", "1"], ["carton", "24", "3"],
    ]);
    expect(sample.units.every((unit) => unit.canSell && unit.canPurchase)).toBe(true);
  });

  it("rejects missing or duplicate base units, duplicate UOMs and a non-one base factor", async () => {
    const sample = fixture();
    await expect(sample.create([])).rejects.toThrow("Exactly one base unit");
    await expect(sample.create([piece, { ...pack, isBase: true }])).rejects.toThrow("Exactly one base unit");
    await expect(sample.create([piece, { ...piece, isBase: false }])).rejects.toThrow("Duplicate product units");
    await expect(sample.create([{ ...piece, conversionFactor: 6 }])).rejects.toThrow("conversion factor must be 1");
    expect(sample.units).toHaveLength(0);
  });

  it("keeps active units sellable and purchasable when updating conversion and MOQ", async () => {
    const sample = fixture();
    await sample.create([piece, carton]);
    const historicalSale = { enteredQuantity: "5", conversionFactor: "24", baseQuantity: "120" };
    const historicalPurchase = { enteredQuantity: "10", conversionFactor: "24", baseQuantity: "240" };
    sample.state.usedSaleUnitIds.add("carton");
    sample.state.usedPurchaseUnitIds.add("carton");
    await sample.edit([piece, pack, { ...carton, conversionFactor: 30, minimumOrderQty: 4, canSell: false, canPurchase: false }]);
    expect(sample.units.find((unit) => unit.unitId === "pack")?.conversionFactor).toBe("6");
    expect(sample.units.find((unit) => unit.unitId === "carton")).toMatchObject({ conversionFactor: "30", minimumOrderQty: "4", canSell: true, canPurchase: true });
    expect(historicalSale).toEqual({ enteredQuantity: "5", conversionFactor: "24", baseQuantity: "120" });
    expect(historicalPurchase).toEqual({ enteredQuantity: "10", conversionFactor: "24", baseQuantity: "240" });
  });

  it("protects a historical base unit", async () => {
    const sample = fixture();
    await sample.create([piece, carton]);
    sample.state.inventoryHistory = 1;
    await expect(sample.edit([{ ...piece, isBase: false }, { ...carton, conversionFactor: 1, isBase: true }])).rejects.toThrow("base unit cannot change");
    expect(sample.units.find((unit) => unit.unitId === "piece")?.isBase).toBe(true);
  });

  it("changes an unused base unit and reassigns the existing primary barcode", async () => {
    const sample = fixture();
    await sample.create([piece, { ...carton, conversionFactor: 1 }]);
    sample.barcodes[0]!.productUnitId = sample.units.find((unit) => unit.unitId === "piece")!.id;
    await sample.edit([{ ...carton, conversionFactor: 1, isBase: true }]);
    expect(sample.units.filter((unit) => unit.isBase).map((unit) => unit.unitId)).toEqual(["carton"]);
    expect(sample.barcodes).toHaveLength(1);
    expect(sample.barcodes[0]!.productUnitId).toBe(sample.units[0]!.id);
  });

  it("deletes an unused additional unit", async () => {
    const sample = fixture();
    await sample.create([piece, pack, carton]);
    await sample.edit([piece]);
    expect(sample.units.find((unit) => unit.unitId === "pack")).toBeUndefined();
    expect(sample.units.find((unit) => unit.unitId === "carton")).toBeUndefined();
  });

  it.each(["sale", "purchase", "movement", "barcode", "tier", "price entry", "promotion"])("rejects removal with %s dependency without disabling or deleting", async (kind) => {
    const sample = fixture();
    await sample.create([piece, carton]);
    const saved = sample.units.find((unit) => unit.unitId === "carton")!;
    if (kind === "sale") sample.state.usedSaleUnitIds.add("carton");
    if (kind === "purchase") sample.state.usedPurchaseUnitIds.add("carton");
    if (kind === "movement") sample.state.usedMovementUnitIds.add("carton");
    if (kind === "barcode") sample.state.usedBarcodeUnitIds.add(saved.id);
    if (kind === "tier") sample.state.usedTierUnitIds.add(saved.id);
    if (kind === "price entry") sample.state.usedPriceEntryUnitIds.add(saved.id);
    if (kind === "promotion") sample.state.usedPromotionUnitIds.add(saved.id);
    await expect(sample.edit([piece])).rejects.toThrow("carton has transaction or configuration history and cannot be removed.");
    expect(sample.units.find((unit) => unit.unitId === "carton")).toMatchObject({ canSell: true, canPurchase: true, isBase: false });
  });

  it("leaves legacy false/false historical-only units unchanged when saving active units", async () => {
    const sample = fixture();
    await sample.create([piece, carton]);
    const legacy = sample.units.find((unit) => unit.unitId === "carton")!;
    legacy.canSell = false;
    legacy.canPurchase = false;
    await sample.edit([piece, pack]);
    expect(sample.units.find((unit) => unit.unitId === "carton")).toMatchObject({ canSell: false, canPurchase: false });
    await expect(sample.edit([piece, carton])).rejects.toThrow("historical-only unit");
  });

  it("preserves an already-associated inactive UOM but cannot add a new inactive UOM", async () => {
    const sample = fixture();
    await sample.create([piece, carton]);
    sample.state.inactiveUnitIds.add("carton");
    await sample.edit([piece, carton]);
    expect(sample.units.find((unit) => unit.unitId === "carton")).toBeDefined();
    await sample.edit([piece]);
    await expect(sample.edit([piece, carton])).rejects.toThrow("unavailable");
  });
});
