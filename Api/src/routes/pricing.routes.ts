import bwipjs from "bwip-js";
import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import {
  activateDuePriceEntries,
  assertPricingTarget,
  effectivePromotionState,
  ensureDefaultPriceBook,
  priceTargetKey,
  promotionTargetKey,
  resolvePrice,
} from "../lib/pricing-domain.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";
import { barcodeSymbologies, internalBarcodeCandidate, normalizeBarcode, printableBarcodeCandidate, validateBarcode } from "../lib/barcode.js";

export const pricingRouter = Router();
pricingRouter.use(requireAuth);

const shopParams = z.object({ shopId: z.string().min(1) });
const idParams = shopParams.extend({ id: z.string().min(1) });
const barcodeKinds = ["SUPPLIER", "MANUFACTURER", "INTERNAL", "PACK", "CARTON"] as const;
const barcodeInput = z.object({
  value: z.string().trim().min(3).max(128),
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  productUnitId: z.string().optional().nullable(),
  symbology: z.enum(barcodeSymbologies).default("CODE128"),
  kind: z.enum(barcodeKinds).default("INTERNAL"),
  packageQuantity: z.coerce.number().positive().optional().nullable(),
  isInternal: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
});
const priceTargetInput = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  productUnitId: z.string().optional().nullable(),
});
const priceChangeInput = priceTargetInput.extend({
  unitPrice: z.coerce.number().int().nonnegative(),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional().nullable(),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.coerce.number().int().positive().optional(),
});
const bulkPriceChangeInput = z.object({
  scope: z.enum(["ALL", "CATEGORY", "PRODUCT"]),
  categoryId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  // A price update must never turn a sale into a loss.
  marginPercent: z.coerce.number().min(0).max(1000),
  reason: z.string().trim().min(3).max(500),
}).superRefine((value, context) => {
  if (value.scope === "CATEGORY" && !value.categoryId) context.addIssue({ code: "custom", message: "Category is required." });
  if (value.scope === "PRODUCT" && !value.productId) context.addIssue({ code: "custom", message: "Product is required." });
});
const promotionInput = priceTargetInput.extend({
  name: z.string().trim().min(2).max(160),
  priceGroupId: z.string().optional().nullable(),
  channel: z.string().trim().min(1).max(30).default("ALL"),
  type: z.enum(["FIXED_PRICE", "PERCENTAGE"]),
  value: z.coerce.number().positive(),
  minimumQuantity: z.coerce.number().positive().default(1),
  discountBase: z.enum(["REGULAR_PRICE", "RESOLVED_TIER_PRICE"]).default("REGULAR_PRICE"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timeZone: z.string().trim().min(1).default("Asia/Yangon"),
  state: z.enum(["DRAFT", "SCHEDULED"]).default("DRAFT"),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  note: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});
const promotionUpdateInput = promotionInput.partial().extend({
  expectedVersion: z.coerce.number().int().positive(),
  state: z.enum(["DRAFT", "SCHEDULED", "PAUSED", "CANCELLED"]).optional(),
});
const resolveInput = priceTargetInput.extend({
  priceGroupId: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().default(1),
  channel: z.string().trim().min(1).default("ALL"),
  manualDiscount: z.coerce.number().int().nonnegative().default(0),
  at: z.coerce.date().optional(),
});

function badRequest(message: string) { return Object.assign(new Error(message), { name: "BadRequestError" }); }
function conflict(message: string) { return Object.assign(new Error(message), { name: "ConflictError" }); }
function notFound(message: string) { return Object.assign(new Error(message), { name: "NotFoundError" }); }
function assertPriceAtOrAboveCost(price: number, cost: unknown) {
  if (price < Number(cost ?? 0)) throw badRequest("Sell price cannot be lower than the product cost price.");
}
function assertValidBarcode(value: string, symbology: (typeof barcodeSymbologies)[number]) {
  const message = validateBarcode(value, symbology);
  if (message) throw badRequest(message);
}
function pagination(query: unknown) {
  const parsed = z.object({
    search: z.string().trim().optional(), status: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
  }).parse(query);
  return { ...parsed, skip: (parsed.page - 1) * parsed.pageSize };
}

pricingRouter.get("/:shopId/barcode-lookup/:value", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const normalizedValue = normalizeBarcode(z.string().min(1).parse(request.params.value));
    const barcode = await prisma.productBarcode.findFirst({
      where: { shopId, normalizedValue, status: "ACTIVE", product: { isActive: true } },
      include: { product: true, variant: true, productUnit: { include: { unit: true } } },
    });
    if (!barcode) {
      const inactiveBarcode = await prisma.productBarcode.findFirst({
        where: { shopId, normalizedValue },
        include: { product: { select: { id: true, isActive: true } } },
      });
      response.json({ known: false, normalizedValue, inactive: Boolean(inactiveBarcode?.product && !inactiveBarcode.product.isActive) });
      return;
    }
    const pricing = await resolvePrice(prisma, shopId, {
      productId: barcode.productId, variantId: barcode.variantId, productUnitId: barcode.productUnitId,
      quantity: new Prisma.Decimal(barcode.packageQuantity ?? 1), channel: String(request.query.channel ?? "ALL"), activateDueEntries: false,
    });
    response.json({ known: true, normalizedValue, barcode, product: barcode.product, variant: barcode.variant, productUnit: barcode.productUnit, packageQuantity: barcode.packageQuantity, pricing });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/barcodes", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const query = pagination(request.query);
    await assertUserOwnsShop(auth.id, shopId);
    const where = {
      shopId,
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.search ? { OR: [
        { value: { contains: query.search, mode: "insensitive" as const } },
        { product: { name: { contains: query.search, mode: "insensitive" as const } } },
      ] } : {}),
    };
    const [barcodes, totalCount] = await Promise.all([
      prisma.productBarcode.findMany({ where, include: { product: true, variant: true, productUnit: { include: { unit: true } } }, orderBy: { createdAt: "desc" }, skip: query.skip, take: query.pageSize }),
      prisma.productBarcode.count({ where }),
    ]);
    response.json({ barcodes, page: query.page, pageSize: query.pageSize, totalCount });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcodes", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = barcodeInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    assertValidBarcode(input.value, input.symbology);
    const barcode = await prisma.$transaction(async (tx) => {
      await assertPricingTarget(tx, shopId, input);
      const normalizedValue = normalizeBarcode(input.value);
      if (await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } })) throw conflict("Barcode is already linked in this store.");
      if (input.isPrimary) await tx.productBarcode.updateMany({ where: { shopId, productId: input.productId, variantId: input.variantId ?? null, isPrimary: true }, data: { isPrimary: false } });
      const created = await tx.productBarcode.create({ data: {
        shopId, productId: input.productId, value: input.value, normalizedValue, symbology: input.symbology,
        kind: input.kind, isInternal: input.isInternal, isPrimary: input.isPrimary,
        ...(input.variantId ? { variantId: input.variantId } : {}), ...(input.productUnitId ? { productUnitId: input.productUnitId } : {}),
        ...(input.packageQuantity ? { packageQuantity: String(input.packageQuantity) } : {}),
      } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.create", entity: "ProductBarcode", entityId: created.id, metadata: { normalizedValue, productId: input.productId } });
      return created;
    });
    response.status(201).json({ barcode });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") next(conflict("Barcode is already linked in this store.")); else next(error);
  }
});

pricingRouter.post("/:shopId/barcodes/internal", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params);
    const target = priceTargetInput.extend({ productUnitId: z.string().optional().nullable(), packageQuantity: z.coerce.number().positive().optional().nullable(), isPrimary: z.boolean().default(true) }).parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.$transaction(async (tx) => {
      const { product } = await assertPricingTarget(tx, shopId, target);
      let value = "";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = internalBarcodeCandidate(product.name);
        if (!await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: candidate } } })) { value = candidate; break; }
      }
      if (!value) throw conflict("Could not generate a unique barcode.");
      if (target.isPrimary) await tx.productBarcode.updateMany({ where: { shopId, productId: target.productId, variantId: target.variantId ?? null, isPrimary: true }, data: { isPrimary: false } });
      const created = await tx.productBarcode.create({ data: { shopId, productId: target.productId, value, normalizedValue: value, kind: "INTERNAL", symbology: "CODE128", isInternal: true, isPrimary: target.isPrimary, ...(target.variantId ? { variantId: target.variantId } : {}), ...(target.productUnitId ? { productUnitId: target.productUnitId } : {}), ...(target.packageQuantity ? { packageQuantity: String(target.packageQuantity) } : {}) } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.internal.create", entity: "ProductBarcode", entityId: created.id });
      return created;
    });
    response.status(201).json({ barcode });
  } catch (error) { next(error); }
});
const campaignInput = promotionInput.omit({ productId: true, variantId: true, productUnitId: true }).extend({
  scope: z.enum(["PRODUCT", "CATEGORY", "ALL"]),
  productId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.scope === "PRODUCT" && !value.productId) context.addIssue({ code: "custom", message: "Product is required." });
  if (value.scope === "CATEGORY" && !value.categoryId) context.addIssue({ code: "custom", message: "Category is required." });
});

const reservationInput = z.object({
  count: z.coerce.number().int().min(1).max(100).default(1),
  values: z.array(z.string().trim().regex(/^\d{13}$/, "Internal barcodes must contain exactly 13 digits.")).max(100).optional(),
});

pricingRouter.get("/:shopId/barcode-reservations", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params);
    const status = z.enum(["UNASSIGNED", "ASSIGNED", "RETIRED"]).default("UNASSIGNED").parse(request.query.status);
    await assertUserOwnsShop(auth.id, shopId);
    const barcodes = await prisma.generatedBarcode.findMany({ where: { shopId, status }, orderBy: { createdAt: "desc" }, take: 100 });
    response.json({ barcodes });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcode-reservations", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = reservationInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const values = input.values?.length ? input.values : [];
    if (input.values && input.values.length !== input.count) throw badRequest("Count must match the number of manual barcode values.");
    const barcodes = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let index = 0; index < input.count; index += 1) {
        let value = values[index] || "";
        for (let attempt = 0; !value && attempt < 30; attempt += 1) {
          const candidate = printableBarcodeCandidate();
          const normalizedValue = normalizeBarcode(candidate);
          const used = await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } }) || await tx.generatedBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } });
          if (!used) value = candidate;
        }
        if (!value) throw conflict("Could not generate a unique barcode. Please try again.");
        const normalizedValue = normalizeBarcode(value);
        const used = await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } }) || await tx.generatedBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } });
        if (used) throw conflict("Barcode is already used in this store.");
        created.push(await tx.generatedBarcode.create({ data: { shopId, value, normalizedValue } }));
      }
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.reservation.create", entity: "GeneratedBarcode", entityId: created[0]?.id || shopId, metadata: { count: created.length } });
      return created;
    });
    response.status(201).json({ barcodes });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/barcode-reservations/:id/label.svg", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.generatedBarcode.findFirst({ where: { id, shopId, status: "UNASSIGNED" } });
    if (!barcode) throw notFound("Generated barcode not found.");
    response.type("image/svg+xml").send(bwipjs.toSVG({ bcid: "code128", text: barcode.value, scale: 2, height: 12, includetext: true, textxalign: "center" }));
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcode-reservations/:id/assign", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); const input = priceTargetInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.$transaction(async (tx) => {
      const reservation = await tx.generatedBarcode.findFirst({ where: { id, shopId, status: "UNASSIGNED" } });
      if (!reservation) throw notFound("Unassigned barcode not found.");
      const target = await assertPricingTarget(tx, shopId, input);
      const created = await tx.productBarcode.create({ data: { shopId, productId: input.productId, value: reservation.value, normalizedValue: reservation.normalizedValue, symbology: "CODE128", kind: "INTERNAL", isInternal: true, isPrimary: true, ...(input.variantId ? { variantId: input.variantId } : {}), ...(input.productUnitId ? { productUnitId: input.productUnitId } : {}) } });
      await tx.productBarcode.updateMany({ where: { shopId, productId: input.productId, id: { not: created.id }, isPrimary: true }, data: { isPrimary: false } });
      await tx.generatedBarcode.update({ where: { id }, data: { status: "ASSIGNED", assignedProductId: target.product.id } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.reservation.assign", entity: "GeneratedBarcode", entityId: id, metadata: { productId: input.productId } });
      return created;
    });
    response.status(201).json({ barcode });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcodes/:id/regenerate", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); const input = z.object({ expectedVersion: z.coerce.number().int().positive(), reason: z.string().trim().min(3) }).parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.$transaction(async (tx) => {
      const existing = await tx.productBarcode.findFirst({ where: { id, shopId, status: "ACTIVE", isInternal: true }, include: { product: true } });
      if (!existing) throw notFound("Active internal barcode not found."); if (existing.version !== input.expectedVersion) throw conflict("Barcode was changed by another request.");
      const isPrintableInternal = /^\d{13}$/.test(existing.value);
      let value = ""; for (let attempt = 0; attempt < 20; attempt += 1) { const candidate = isPrintableInternal ? printableBarcodeCandidate() : internalBarcodeCandidate(existing.product.name); if (!await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: candidate } } })) { value = candidate; break; } }
      if (!value) throw conflict("Could not generate a unique barcode.");
      await tx.productBarcode.update({ where: { id }, data: { status: "RETIRED", retiredAt: new Date(), isPrimary: false, version: { increment: 1 } } });
      const created = await tx.productBarcode.create({ data: { shopId, productId: existing.productId, value, normalizedValue: value, symbology: "CODE128", kind: "INTERNAL", isInternal: true, isPrimary: true, ...(existing.variantId ? { variantId: existing.variantId } : {}), ...(existing.productUnitId ? { productUnitId: existing.productUnitId } : {}) } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.regenerate", entity: "ProductBarcode", entityId: created.id, metadata: { previousBarcodeId: id, reason: input.reason } }); return created;
    }); response.status(201).json({ barcode });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcodes/:id/replace", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); const input = z.object({ newValue: z.string().trim().min(3).max(128), symbology: z.enum(barcodeSymbologies), kind: z.enum(barcodeKinds), expectedVersion: z.coerce.number().int().positive(), reason: z.string().trim().min(3) }).parse(request.body);
    await assertUserOwnsShop(auth.id, shopId); assertValidBarcode(input.newValue, input.symbology);
    const barcode = await prisma.$transaction(async (tx) => {
      const existing = await tx.productBarcode.findFirst({ where: { id, shopId, status: "ACTIVE" } }); if (!existing) throw notFound("Active barcode not found."); if (existing.version !== input.expectedVersion) throw conflict("Barcode was changed by another request.");
      const normalizedValue = normalizeBarcode(input.newValue); if (await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } })) throw conflict("Barcode is already linked in this store.");
      await tx.productBarcode.update({ where: { id }, data: { status: "RETIRED", retiredAt: new Date(), isPrimary: false, version: { increment: 1 } } });
      const created = await tx.productBarcode.create({ data: { shopId, productId: existing.productId, value: input.newValue, normalizedValue, symbology: input.symbology, kind: input.kind, isInternal: input.kind === "INTERNAL", isPrimary: true, ...(existing.variantId ? { variantId: existing.variantId } : {}), ...(existing.productUnitId ? { productUnitId: existing.productUnitId } : {}) } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.replace", entity: "ProductBarcode", entityId: created.id, metadata: { previousBarcodeId: id, reason: input.reason } }); return created;
    }); response.status(201).json({ barcode });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/barcodes/short-code/generate", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const value = internalBarcodeCandidate();
      const used = await prisma.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: value } } }) || await prisma.generatedBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: value } } });
      if (!used) { response.json({ value, symbology: "CODE128", kind: "INTERNAL" }); return; }
    }
    throw conflict("Could not generate a unique barcode. Please try again.");
  } catch (error) { next(error); }
});

pricingRouter.patch("/:shopId/barcodes/:id", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params);
    const input = barcodeInput.pick({ value: true, symbology: true, kind: true, packageQuantity: true, isPrimary: true }).extend({ expectedVersion: z.coerce.number().int().positive() }).parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    assertValidBarcode(input.value, input.symbology);
    const barcode = await prisma.$transaction(async (tx) => {
      const existing = await tx.productBarcode.findFirst({ where: { id, shopId, status: "ACTIVE" } });
      if (!existing) throw notFound("Barcode not found.");
      if (existing.version !== input.expectedVersion) throw conflict("Barcode was changed by another request.");
      const normalizedValue = normalizeBarcode(input.value);
      const duplicate = await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } });
      if (duplicate && duplicate.id !== id) throw conflict("Barcode is already linked in this store.");
      if (input.isPrimary) await tx.productBarcode.updateMany({ where: { shopId, productId: existing.productId, variantId: existing.variantId, isPrimary: true, id: { not: id } }, data: { isPrimary: false } });
      const updated = await tx.productBarcode.update({ where: { id }, data: { value: input.value, normalizedValue, symbology: input.symbology, kind: input.kind, isPrimary: input.isPrimary, packageQuantity: input.packageQuantity ? String(input.packageQuantity) : null, version: { increment: 1 } } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.update", entity: "ProductBarcode", entityId: id, metadata: { normalizedValue } });
      return updated;
    });
    response.json({ barcode });
  } catch (error) { next(error); }
});

pricingRouter.patch("/:shopId/barcodes/:id/retire", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params);
    const input = z.object({ expectedVersion: z.coerce.number().int().positive(), reason: z.string().trim().min(3) }).parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.$transaction(async (tx) => {
      const existing = await tx.productBarcode.findFirst({ where: { id, shopId } });
      if (!existing) throw notFound("Barcode not found.");
      if (existing.version !== input.expectedVersion) throw conflict("Barcode was changed by another request.");
      const updated = await tx.productBarcode.update({ where: { id }, data: { status: "RETIRED", retiredAt: new Date(), isPrimary: false, version: { increment: 1 } } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "barcode.retire", entity: "ProductBarcode", entityId: id, metadata: { reason: input.reason } });
      return updated;
    });
    response.json({ barcode });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/barcodes/:id/label.svg", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const barcode = await prisma.productBarcode.findFirst({ where: { id, shopId, status: "ACTIVE" }, include: { product: true, variant: true, productUnit: { include: { unit: true } } } });
    if (!barcode) throw notFound("Barcode not found.");
    const bcid = barcode.symbology === "EAN13" ? "ean13" : barcode.symbology === "UPCA" ? "upca" : barcode.symbology === "UPCE" ? "upce" : barcode.symbology === "EAN8" ? "ean8" : "code128";
    const svg = bwipjs.toSVG({ bcid, text: barcode.value, scale: 2, height: 12, includetext: true, textxalign: "center" });
    response.type("image/svg+xml").set("Cache-Control", "private, max-age=300").send(svg);
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/prices", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const query = pagination(request.query); await assertUserOwnsShop(auth.id, shopId);
    const where = { shopId, ...(query.status ? { status: query.status.toUpperCase() } : {}), ...(query.search ? { product: { name: { contains: query.search, mode: "insensitive" as const } } } : {}) };
    const [entries, totalCount] = await prisma.$transaction(async (tx) => {
      await activateDuePriceEntries(tx, shopId);
      return Promise.all([
        tx.priceEntry.findMany({ where, include: { product: true, variant: true, productUnit: { include: { unit: true } }, priceBook: true }, orderBy: [{ effectiveFrom: "desc" }], skip: query.skip, take: query.pageSize }),
        tx.priceEntry.count({ where }),
      ]);
    });
    response.json({ entries, page: query.page, pageSize: query.pageSize, totalCount });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/prices", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = priceChangeInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom) throw badRequest("Price end time must be after its start time.");
    const entry = await prisma.$transaction(async (tx) => {
      const target = await assertPricingTarget(tx, shopId, input); assertPriceAtOrAboveCost(input.unitPrice, target.product.cost); const book = await ensureDefaultPriceBook(tx, shopId); const now = new Date();
      const targetKey = priceTargetKey(input.productId, input.variantId, input.productUnitId);
      if (input.effectiveFrom <= now) {
        await tx.priceEntry.updateMany({ where: { shopId, targetKey, status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }] }, data: { effectiveTo: input.effectiveFrom, status: "EXPIRED" } });
      }
      const isImmediate = input.effectiveFrom <= now;
      const previousUnitPrice = isImmediate ? (target.variant?.price ?? target.product.price) : null;
      const created = await tx.priceEntry.create({ data: { shopId, priceBookId: book.id, productId: input.productId, targetKey, unitPrice: input.unitPrice, previousUnitPrice, currencyCode: book.currencyCode, effectiveFrom: input.effectiveFrom, status: isImmediate ? "ACTIVE" : "SCHEDULED", reason: input.reason, actorId: auth.id, ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}), ...(input.variantId ? { variantId: input.variantId } : {}), ...(input.productUnitId ? { productUnitId: input.productUnitId } : {}) } });
      if (input.effectiveFrom <= now && !input.productUnitId) {
        if (target.variant) await tx.productVariant.update({ where: { id: target.variant.id }, data: { price: input.unitPrice } });
        else await tx.product.update({ where: { id: target.product.id }, data: { price: input.unitPrice, version: { increment: 1 } } });
      }
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "price.change", entity: "PriceEntry", entityId: created.id, metadata: { targetKey, unitPrice: input.unitPrice, reason: input.reason } });
      return created;
    });
    response.status(201).json({ entry });
  } catch (error) { next(error); }
});

// One transaction makes overall, category and one-product margin setup durable and auditable.
pricingRouter.post("/:shopId/prices/bulk", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = bulkPriceChangeInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const entries = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          shopId, isActive: true,
          ...(input.scope === "CATEGORY" && input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.scope === "PRODUCT" && input.productId ? { id: input.productId } : {}),
        },
      });
      if (!products.length) throw notFound("No products matched this price setup.");
      const book = await ensureDefaultPriceBook(tx, shopId); const now = new Date(); const result = [];
      for (const product of products) {
        const unitPrice = Math.round(Number(product.cost ?? 0) * (1 + input.marginPercent / 100));
        assertPriceAtOrAboveCost(unitPrice, product.cost);
        const targetKey = priceTargetKey(product.id, null, null);
        await tx.priceEntry.updateMany({ where: { shopId, targetKey, status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, data: { effectiveTo: now, status: "EXPIRED" } });
        const entry = await tx.priceEntry.create({ data: { shopId, priceBookId: book.id, productId: product.id, targetKey, unitPrice, previousUnitPrice: product.price, currencyCode: book.currencyCode, effectiveFrom: now, status: "ACTIVE", reason: input.reason, actorId: auth.id } });
        await tx.product.update({ where: { id: product.id }, data: { price: unitPrice, version: { increment: 1 } } });
        result.push(entry);
      }
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "price.bulk_change", entity: "PriceEntry", entityId: result[0]!.id, metadata: { scope: input.scope, count: result.length, marginPercent: input.marginPercent, reason: input.reason } });
      return result;
    });
    response.status(201).json({ entries });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/pricing/resolve", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = resolveInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    response.json({ pricing: await resolvePrice(prisma, shopId, { ...input, quantity: new Prisma.Decimal(input.quantity), activateDueEntries: false }) });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/promotions", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const query = pagination(request.query); await assertUserOwnsShop(auth.id, shopId);
    const where = { shopId, ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { product: { name: { contains: query.search, mode: "insensitive" as const } } }] } : {}) };
    const [raw, totalCount] = await Promise.all([
      prisma.promotion.findMany({ where, include: { product: true, variant: true, productUnit: { include: { unit: true } }, priceGroup: true }, orderBy: [{ startsAt: "desc" }], skip: query.skip, take: query.pageSize }), prisma.promotion.count({ where }),
    ]);
    const promotions = raw.map((item) => ({ ...item, effectiveState: effectivePromotionState(item) })).filter((item) => !query.status || item.effectiveState === query.status.toUpperCase());
    response.json({ promotions, page: query.page, pageSize: query.pageSize, totalCount });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/promotion-campaigns", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const campaigns = await prisma.promotionCampaign.findMany({ where: { shopId }, include: { category: true, promotions: { include: { product: true }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
    response.json({ campaigns: campaigns.map((campaign) => ({ ...campaign, effectiveState: campaign.promotions[0] ? effectivePromotionState(campaign.promotions[0]) : campaign.state, productCount: campaign.promotions.length, sampleProduct: campaign.promotions[0]?.product || null })) });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/promotion-campaigns/:id/report", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const campaign = await prisma.promotionCampaign.findFirst({
      where: { id, shopId },
      include: {
        category: { select: { id: true, name: true } },
        promotions: { select: { id: true, productId: true, name: true, type: true, value: true, startsAt: true, endsAt: true, product: { select: { name: true, sku: true, barcodes: { where: { status: "ACTIVE" }, select: { value: true } } } } } },
      },
    });
    if (!campaign) throw notFound("Promotion campaign not found.");
    const promotionById = new Map(campaign.promotions.map((promotion) => [promotion.id, promotion]));
    const rawItems = campaign.promotions.length ? await prisma.orderItem.findMany({
      where: {
        promotionId: { in: campaign.promotions.map((promotion) => promotion.id) },
        order: { shopId, fulfillmentStatus: "completed", cancelledAt: null },
      },
      include: { order: { select: { id: true, orderNumber: true, subtotal: true, discount: true, completedAt: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    }) : [];
    const items = rawItems.filter((item) => {
      const promotion = item.promotionId ? promotionById.get(item.promotionId) : null;
      const resolvedAt = item.priceResolvedAt ?? item.createdAt;
      return Boolean(promotion && resolvedAt >= promotion.startsAt && resolvedAt <= promotion.endsAt);
    }).map((item) => {
      const enteredQuantity = Number(item.enteredQuantity ?? item.quantity);
      const baseQuantity = Number(item.baseQuantity ?? item.quantity);
      const promotionDiscount = Math.round(item.promotionDiscount * enteredQuantity);
      const regularUnitPrice = item.regularUnitPrice ?? ((item.finalUnitPrice ?? item.unitPrice) + item.promotionDiscount);
      const regularSales = Math.round(regularUnitPrice * enteredQuantity);
      const orderDiscountShare = item.order.subtotal > 0 ? Math.round(item.order.discount * item.lineTotal / item.order.subtotal) : 0;
      const netSales = Math.max(0, item.lineTotal - orderDiscountShare);
      const costOfGoods = Math.round(item.unitCost * baseQuantity);
      return {
        id: item.id,
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        soldAt: item.order.completedAt ?? item.order.createdAt,
        productId: item.productId,
        productName: item.productName,
        quantitySold: baseQuantity,
        regularSales,
        promotionDiscount,
        orderDiscountShare,
        netSales,
        costOfGoods,
        grossProfit: netSales - costOfGoods,
      };
    });
    const productMap = new Map<string, {
      productId: string; productName: string; sku: string | null; barcodes: string[]; quantitySold: number; orderIds: Set<string>;
      regularSales: number; promotionDiscount: number; netSales: number; costOfGoods: number; grossProfit: number;
    }>();
    for (const promotion of campaign.promotions) {
      if (!productMap.has(promotion.productId)) {
        productMap.set(promotion.productId, {
          productId: promotion.productId,
          productName: promotion.product.name,
          sku: promotion.product.sku ?? null,
          barcodes: (promotion.product.barcodes ?? []).map((barcode) => barcode.value),
          quantitySold: 0,
          orderIds: new Set<string>(),
          regularSales: 0,
          promotionDiscount: 0,
          netSales: 0,
          costOfGoods: 0,
          grossProfit: 0,
        });
      }
    }
    for (const item of items) {
      const row = productMap.get(item.productId) ?? { productId: item.productId, productName: item.productName, sku: null, barcodes: [], quantitySold: 0, orderIds: new Set<string>(), regularSales: 0, promotionDiscount: 0, netSales: 0, costOfGoods: 0, grossProfit: 0 };
      row.quantitySold += item.quantitySold; row.orderIds.add(item.orderId); row.regularSales += item.regularSales; row.promotionDiscount += item.promotionDiscount; row.netSales += item.netSales; row.costOfGoods += item.costOfGoods; row.grossProfit += item.grossProfit;
      productMap.set(item.productId, row);
    }
    const products = [...productMap.values()].map(({ orderIds, ...row }) => ({ ...row, orderCount: orderIds.size })).sort((left, right) => right.netSales - left.netSales);
    const total = (key: "quantitySold" | "regularSales" | "promotionDiscount" | "netSales" | "costOfGoods" | "grossProfit") => items.reduce((sum, item) => sum + item[key], 0);
    const netSales = total("netSales"); const grossProfit = total("grossProfit");
    const startsAt = campaign.promotions.reduce<Date | null>((earliest, promotion) => !earliest || promotion.startsAt < earliest ? promotion.startsAt : earliest, null);
    const endsAt = campaign.promotions.reduce<Date | null>((latest, promotion) => !latest || promotion.endsAt > latest ? promotion.endsAt : latest, null);
    response.json({
      campaign: { id: campaign.id, name: campaign.name, scope: campaign.scope, state: campaign.state, category: campaign.category, startsAt, endsAt },
      summary: { orderCount: new Set(items.map((item) => item.orderId)).size, productCount: products.filter((product) => product.quantitySold > 0).length, quantitySold: total("quantitySold"), regularSales: total("regularSales"), promotionDiscount: total("promotionDiscount"), netSales, costOfGoods: total("costOfGoods"), grossProfit, marginPercent: netSales > 0 ? Number((grossProfit / netSales * 100).toFixed(1)) : 0 },
      products,
      orders: items,
    });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/promotion-history", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const entries = await prisma.auditLog.findMany({
      where: { shopId, action: { in: ["promotion.update", "promotion.campaign.update"] } },
      select: { id: true, action: true, entityId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    response.json({ entries: entries.filter((entry) => {
      const metadata = entry.metadata as { previousValue?: unknown; nextValue?: unknown };
      return metadata.previousValue !== undefined && metadata.nextValue !== undefined;
    }) });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/promotion-campaigns", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = campaignInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    if (input.endsAt <= input.startsAt) throw badRequest("Promotion end time must be after its start time.");
    if (input.type === "PERCENTAGE" && input.value > 100) throw badRequest("Percentage promotion cannot exceed 100%.");
    const campaign = await prisma.$transaction(async (tx) => {
      const where = { shopId, isActive: true, ...(input.scope === "PRODUCT" && input.productId ? { id: input.productId } : {}), ...(input.scope === "CATEGORY" && input.categoryId ? { categoryId: input.categoryId } : {}) };
      const products = await tx.product.findMany({ where, select: { id: true } });
      if (!products.length) throw badRequest("No active products match this promotion.");
      const created = await tx.promotionCampaign.create({ data: { shopId, name: input.name, scope: input.scope, state: input.state, ...(input.categoryId ? { categoryId: input.categoryId } : {}) } });
      for (const product of products) {
        const targetKey = promotionTargetKey({ productId: product.id, channel: input.channel.toUpperCase() });
        const overlap = await tx.promotion.findFirst({ where: { shopId, targetKey, state: { in: ["SCHEDULED", "RUNNING"] }, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
        if (overlap && input.state !== "DRAFT") throw conflict("Promotion overlaps another scheduled or running promotion for a selected product.");
        await tx.promotion.create({ data: { shopId, campaignId: created.id, name: input.name, productId: product.id, targetKey, channel: input.channel.toUpperCase(), type: input.type, value: String(input.value), minimumQuantity: String(input.minimumQuantity), discountBase: input.discountBase, startsAt: input.startsAt, endsAt: input.endsAt, timeZone: input.timeZone, state: input.state, priority: input.priority, actorId: auth.id, ...(input.note !== undefined ? { note: input.note } : {}), ...(input.reason !== undefined ? { reason: input.reason } : {}) } });
      }
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "promotion.campaign.create", entity: "PromotionCampaign", entityId: created.id, metadata: { scope: input.scope, productCount: products.length } });
      return created;
    });
    response.status(201).json({ campaign });
  } catch (error) { next(error); }
});

pricingRouter.patch("/:shopId/promotion-campaigns/:id", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); const input = promotionUpdateInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) throw badRequest("Promotion end time must be after its start time.");
    if (input.type === "PERCENTAGE" && input.value && input.value > 100) throw badRequest("Percentage promotion cannot exceed 100%.");
    const campaign = await prisma.$transaction(async (tx) => {
      const existing = await tx.promotionCampaign.findFirst({ where: { id, shopId }, include: { promotions: true } });
      if (!existing) throw notFound("Promotion campaign not found."); if (existing.version !== input.expectedVersion) throw conflict("Promotion campaign was changed by another request.");
      const state = input.state ?? existing.state;
      const promotionData = { state, ...(input.name ? { name: input.name } : {}), ...(input.type ? { type: input.type } : {}), ...(input.value !== undefined ? { value: String(input.value) } : {}), ...(input.minimumQuantity !== undefined ? { minimumQuantity: String(input.minimumQuantity) } : {}), ...(input.discountBase ? { discountBase: input.discountBase } : {}), ...(input.startsAt ? { startsAt: input.startsAt } : {}), ...(input.endsAt ? { endsAt: input.endsAt } : {}), ...(input.timeZone ? { timeZone: input.timeZone } : {}), ...(input.channel ? { channel: input.channel.toUpperCase() } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.note !== undefined ? { note: input.note } : {}), ...(input.reason ? { reason: input.reason } : {}), actorId: auth.id, version: { increment: 1 } };
      await tx.promotion.updateMany({ where: { campaignId: id }, data: promotionData });
      if (input.channel !== undefined) {
        await Promise.all(existing.promotions.map((promotion) => tx.promotion.update({
          where: { id: promotion.id },
          data: { targetKey: promotionTargetKey({ ...promotion, channel: input.channel }) },
        })));
      }
      const updated = await tx.promotionCampaign.update({ where: { id }, data: { state, ...(state === "CANCELLED" && existing.state !== "CANCELLED" ? { endedAt: new Date() } : {}), ...(input.name ? { name: input.name } : {}), version: { increment: 1 } } });
      const previousPromotion = existing.promotions[0];
      await writeAuditLog(tx, {
        shopId,
        actorId: auth.id,
        action: input.value !== undefined || input.type !== undefined ? "promotion.campaign.update" : `promotion.campaign.${state.toLowerCase()}`,
        entity: "PromotionCampaign",
        entityId: id,
        metadata: {
          name: input.name ?? existing.name,
          previousName: existing.name,
          nextName: input.name ?? existing.name,
          type: input.type ?? previousPromotion?.type ?? null,
          previousType: previousPromotion?.type ?? null,
          nextType: input.type ?? previousPromotion?.type ?? null,
          previousValue: previousPromotion ? Number(previousPromotion.value) : null,
          nextValue: input.value ?? (previousPromotion ? Number(previousPromotion.value) : null),
          reason: input.reason ?? previousPromotion?.reason ?? null,
        },
      }); return updated;
    }); response.json({ campaign });
  } catch (error) { next(error); }
});

pricingRouter.post("/:shopId/promotions", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); const input = promotionInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    if (input.endsAt <= input.startsAt) throw badRequest("Promotion end time must be after its start time.");
    if (input.type === "PERCENTAGE" && input.value > 100) throw badRequest("Percentage promotion cannot exceed 100%.");
    const promotion = await prisma.$transaction(async (tx) => {
      await assertPricingTarget(tx, shopId, input);
      const targetKey = promotionTargetKey(input);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${targetKey}`}))`;
      const overlap = await tx.promotion.findFirst({ where: { shopId, targetKey, state: { in: ["SCHEDULED", "RUNNING"] }, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
      if (overlap && input.state !== "DRAFT") throw conflict("Promotion overlaps another scheduled or running promotion for this target.");
      const created = await tx.promotion.create({ data: { shopId, name: input.name, productId: input.productId, targetKey, channel: input.channel.toUpperCase(), type: input.type, value: String(input.value), minimumQuantity: String(input.minimumQuantity), discountBase: input.discountBase, startsAt: input.startsAt, endsAt: input.endsAt, timeZone: input.timeZone, state: input.state, priority: input.priority, actorId: auth.id, ...(input.note !== undefined ? { note: input.note } : {}), ...(input.reason !== undefined ? { reason: input.reason } : {}), ...(input.variantId ? { variantId: input.variantId } : {}), ...(input.productUnitId ? { productUnitId: input.productUnitId } : {}), ...(input.priceGroupId ? { priceGroupId: input.priceGroupId } : {}) } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "promotion.create", entity: "Promotion", entityId: created.id, metadata: { targetKey, state: input.state } });
      return created;
    });
    response.status(201).json({ promotion: { ...promotion, effectiveState: effectivePromotionState(promotion) } });
  } catch (error) { next(error); }
});

pricingRouter.patch("/:shopId/promotions/:id", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId, id } = idParams.parse(request.params); const input = promotionUpdateInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    const promotion = await prisma.$transaction(async (tx) => {
      const existing = await tx.promotion.findFirst({ where: { id, shopId } }); if (!existing) throw notFound("Promotion not found.");
      if (existing.version !== input.expectedVersion) throw conflict("Promotion was changed by another request.");
      const merged = {
        ...existing,
        productId: input.productId ?? existing.productId,
        variantId: input.variantId === undefined ? existing.variantId : input.variantId,
        productUnitId: input.productUnitId === undefined ? existing.productUnitId : input.productUnitId,
        priceGroupId: input.priceGroupId === undefined ? existing.priceGroupId : input.priceGroupId,
        channel: input.channel?.toUpperCase() ?? existing.channel,
        type: input.type ?? existing.type,
        value: input.value === undefined ? existing.value : new Prisma.Decimal(input.value),
        startsAt: input.startsAt ?? existing.startsAt,
        endsAt: input.endsAt ?? existing.endsAt,
        state: input.state ?? existing.state,
      };
      if (merged.endsAt <= merged.startsAt) throw badRequest("Promotion end time must be after its start time.");
      if (merged.type === "PERCENTAGE" && Number(merged.value) > 100) throw badRequest("Percentage promotion cannot exceed 100%.");
      await assertPricingTarget(tx, shopId, merged);
      const targetKey = promotionTargetKey(merged);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${targetKey}`}))`;
      if (["SCHEDULED", "RUNNING"].includes(merged.state)) {
        const overlap = await tx.promotion.findFirst({ where: { id: { not: id }, shopId, targetKey, state: { in: ["SCHEDULED", "RUNNING"] }, startsAt: { lt: merged.endsAt }, endsAt: { gt: merged.startsAt } } });
        if (overlap) throw conflict("Promotion overlaps another scheduled or running promotion for this target.");
      }
      const updated = await tx.promotion.update({ where: { id }, data: {
        targetKey, actorId: auth.id, version: { increment: 1 },
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.productId !== undefined ? { productId: input.productId } : {}),
        ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
        ...(input.productUnitId !== undefined ? { productUnitId: input.productUnitId } : {}),
        ...(input.priceGroupId !== undefined ? { priceGroupId: input.priceGroupId } : {}),
        ...(input.channel !== undefined ? { channel: input.channel.toUpperCase() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.value !== undefined ? { value: String(input.value) } : {}),
        ...(input.minimumQuantity !== undefined ? { minimumQuantity: String(input.minimumQuantity) } : {}),
        ...(input.discountBase !== undefined ? { discountBase: input.discountBase } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
        ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      } });
      await writeAuditLog(tx, {
        shopId,
        actorId: auth.id,
        action: input.value !== undefined || input.type !== undefined ? "promotion.update" : `promotion.${input.state?.toLowerCase() ?? "update"}`,
        entity: "Promotion",
        entityId: id,
        metadata: {
          name: input.name ?? existing.name,
          previousName: existing.name,
          nextName: input.name ?? existing.name,
          type: input.type ?? existing.type,
          previousType: existing.type,
          nextType: input.type ?? existing.type,
          previousValue: Number(existing.value),
          nextValue: input.value ?? Number(existing.value),
          previousState: existing.state,
          nextState: updated.state,
          reason: input.reason ?? existing.reason ?? null,
        },
      });
      return updated;
    });
    response.json({ promotion: { ...promotion, effectiveState: effectivePromotionState(promotion) } });
  } catch (error) { next(error); }
});

pricingRouter.get("/:shopId/pricing/overview", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId); const now = new Date();
    const [products, entries, promotions, barcodes, batches] = await Promise.all([
      prisma.product.count({ where: { shopId, isActive: true } }), prisma.priceEntry.count({ where: { shopId } }),
      prisma.promotion.findMany({ where: { shopId } }), prisma.productBarcode.count({ where: { shopId, status: "ACTIVE" } }),
      prisma.inventoryBatch.findMany({ where: { shopId }, select: { productId: true, variantId: true, unitCost: true, receivedAt: true }, orderBy: { receivedAt: "asc" } }),
    ]);
    const runningPromotions = promotions.filter((item) => effectivePromotionState(item, now) === "RUNNING").length;
    response.json({ overview: { products, priceEntries: entries, activeBarcodes: barcodes, runningPromotions, costLayers: batches.length } });
  } catch (error) { next(error); }
});
