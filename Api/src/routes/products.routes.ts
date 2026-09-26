import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { assertCapability } from "../lib/store-capabilities.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";
import { internalBarcodeCandidate, normalizeBarcode, validateBarcode } from "../lib/barcode.js";
import { recordInventoryMovement } from "../lib/inventory-domain.js";
import { createProductUnits, reconcileProductUnits } from "../lib/product-units.js";

export const productsRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});
const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  category: z.string().trim().optional(),
  capability: z.string().trim().optional(),
  location: z.string().trim().optional(),
  sort: z.enum(["createdAt", "name", "price"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
  view: z.enum(["full", "catalog"]).default("full"),
});

const moneySchema = z.coerce.number().int().nonnegative();
const maxOptionLevels = 3;

const optionValueSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  level: z.coerce.number().int().min(0).max(maxOptionLevels - 1),
  parentId: z.string().trim().min(1).max(80).nullable().optional(),
});

const optionLevelSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(40),
});

const optionTreeSchema = z.object({
  levels: z.array(optionLevelSchema).max(maxOptionLevels).default([]),
  values: z.array(optionValueSchema).max(500).default([]),
});

const optionPathSchema = z
  .array(
    z.object({
      level: z.coerce.number().int().min(0).max(maxOptionLevels - 1),
      label: z.string().trim().min(1).max(40),
      valueId: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(80),
    }),
  )
  .max(maxOptionLevels);

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  price: moneySchema,
  cost: moneySchema.positive("Cost price is required and must be greater than zero."),
  categoryId: z.string().trim().optional(),
  optionTree: optionTreeSchema.optional(),
  isActive: z.boolean().optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
  trackingMode: z.enum(["NONE", "LOT", "SERIAL"]).optional(),
  quantityPrecision: z.coerce.number().int().min(0).max(3).optional(),
  units: z.array(z.object({
    unitId: z.string().min(1),
    conversionFactor: z.coerce.number().positive(),
    isBase: z.boolean().optional(),
    canSell: z.boolean().optional(),
    canPurchase: z.boolean().optional(),
    minimumOrderQty: z.coerce.number().positive().optional(),
  })).optional(),
  barcode: z.object({ value: z.string().trim().optional(), kind: z.enum(["INTERNAL", "MANUFACTURER"]).default("INTERNAL"), symbology: z.enum(["CODE128", "EAN13", "UPCA", "UPCE", "EAN8"]).default("CODE128") }).optional(),
  shortCode: z.string().trim().regex(/^[A-Z]{2}[0-9]{4}$/, "Short code must use the CK4821 format.").optional(),
  barcodeReservationId: z.string().trim().min(1).optional(),
  stockQuantity: z.coerce.number().int().nonnegative().optional(),
  minimumStock: z.coerce.number().int().nonnegative().optional(),
});

const updateProductSchema = productSchema.omit({ stockQuantity: true }).partial();

const variantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required.").optional(),
  sku: z.string().trim().optional(),
  price: moneySchema.optional(),
  cost: moneySchema.optional(),
  option1: z.string().trim().optional(),
  option2: z.string().trim().optional(),
  option3: z.string().trim().optional(),
  optionPath: optionPathSchema.optional(),
  isActive: z.boolean().optional(),
});

const updateVariantSchema = variantSchema.partial();

productsRouter.use(requireAuth);

async function assertCategoryBelongsToShop(categoryId: string | undefined, shopId: string) {
  if (!categoryId) return;

  const category = await prisma.category.findFirst({
    where: { id: categoryId, shopId },
    select: { id: true },
  });

  if (!category) {
    const error = new Error("Category not found.");
    error.name = "NotFoundError";
    throw error;
  }
}

async function assertProductBelongsToShop(productId: string, shopId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true },
  });

  if (!product) {
    const error = new Error("Product not found.");
    error.name = "NotFoundError";
    throw error;
  }
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "ConflictError";
  return error;
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

function normalizeOptionTree(input: z.infer<typeof optionTreeSchema>) {
  const levels = input.levels.map((level, index) => ({
    id: level.id.trim(),
    label: level.label.trim(),
    level: index,
  }));
  const levelIds = new Set(levels.map((level) => level.id));
  const valueIds = new Set<string>();
  const values = input.values.map((value) => {
    const normalized = {
      id: value.id.trim(),
      label: value.label.trim(),
      level: value.level,
      parentId: null,
    };

    if (valueIds.has(normalized.id)) {
      throw badRequest("Option values must be unique.");
    }
    valueIds.add(normalized.id);

    const level = levels[normalized.level];
    if (!level || !levelIds.has(level.id)) {
      throw badRequest("Option value level is invalid.");
    }
    return normalized;
  });

  const siblingNames = new Set<string>();
  values.forEach((value) => {
    const siblingKey = `${value.level}:${value.label.toLowerCase()}`;
    if (siblingNames.has(siblingKey)) {
      throw badRequest("Option values inside the same option group must be unique.");
    }
    siblingNames.add(siblingKey);
  });

  if (values.length > 0 && levels.length === 0) {
    throw badRequest("Option labels are required when option values exist.");
  }

  return { levels, values };
}

function parseStoredOptionTree(optionTree: unknown) {
  return normalizeOptionTree(optionTreeSchema.parse(optionTree ?? {}));
}

function variantSignature(optionPath: z.infer<typeof optionPathSchema> | undefined) {
  if (!optionPath || optionPath.length === 0) return "__default";
  return optionPath
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((entry) => `${entry.level}:${entry.valueId}`)
    .join("|");
}

function validateVariantPath(optionTree: unknown, optionPath: z.infer<typeof optionPathSchema> | undefined) {
  const tree = parseStoredOptionTree(optionTree);
  const path = optionPath ?? [];

  if (tree.levels.length === 0) {
    if (path.length > 0) throw badRequest("This product does not use options.");
    return [];
  }

  if (path.length !== tree.levels.length) {
    throw badRequest("Variant option path does not match this product's option levels.");
  }

  const valuesById = new Map(tree.values.map((value) => [value.id, value]));
  const sortedPath = path.slice().sort((a, b) => a.level - b.level);
  const normalized = sortedPath.map((entry, index) => {
      const level = tree.levels[index];
      const value = valuesById.get(entry.valueId);

      if (!level || entry.level !== index || !value || value.level !== index) {
        throw badRequest("Variant option path contains an invalid option value.");
      }

      return {
        level: index,
        label: level.label,
        valueId: value.id,
        value: value.label,
      };
    });

  return normalized;
}

function variantNameFromPath(path: z.infer<typeof optionPathSchema>) {
  return path.length ? path.map((entry) => entry.value).join(" / ") : "Default";
}

function relabelVariantPath(optionTree: unknown, storedPath: unknown) {
  const tree = parseStoredOptionTree(optionTree);
  const path = optionPathSchema.parse(storedPath ?? []);
  if (path.length === 0) return [];

  const valuesById = new Map(tree.values.map((value) => [value.id, value]));
  return path.map((entry) => {
    const level = tree.levels[entry.level];
    const value = valuesById.get(entry.valueId);
    return {
      ...entry,
      label: level?.label ?? entry.label,
      value: value?.label ?? entry.value,
    };
  });
}

productsRouter.get("/:shopId/products", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);

    const where = {
      shopId,
      ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
      ...(query.category ? { categoryId: query.category } : {}),
      ...(query.capability ? { capabilities: { path: [query.capability], equals: true } } : {}),
      ...(query.location ? { balances: { some: { locationId: query.location } } } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" as const } },
        { sku: { contains: query.search, mode: "insensitive" as const } },
        { barcodes: { some: { status: "ACTIVE", OR: [
          { value: { contains: query.search, mode: "insensitive" as const } },
          { normalizedValue: { contains: query.search, mode: "insensitive" as const } },
        ] } } },
      ] } : {}),
    };
    if (query.view === "catalog") {
      const [products, total] = await prisma.$transaction([
        prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            sku: true,
            price: true,
            units: { include: { unit: true } },
            barcodes: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              select: { value: true },
            },
          },
          orderBy: { [query.sort]: query.direction },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.product.count({ where }),
      ]);
      const balances = products.length
        ? await prisma.inventoryBalance.groupBy({
          by: ["productId"],
          where: { shopId, productId: { in: products.map((product) => product.id) } },
          _sum: { onHand: true },
        })
        : [];
      const stockByProductId = new Map(balances.map((balance) => [balance.productId, Number(balance._sum.onHand ?? 0)]));
      response.status(200).json({
        products: products.map((product) => ({
          ...product,
          currentStock: stockByProductId.get(product.id) ?? 0,
        })),
        totalCount: total,
        pagination: { page: query.page, pageSize: query.pageSize, total },
      });
      return;
    }
    const [products, total, balances] = await prisma.$transaction([prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: true,
        units: { include: { unit: true } },
        barcodes: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
        priceTiers: true,
        _count: { select: { orderItems: { where: { order: { shopId, cancelledAt: null } } } } },
      },
      orderBy: { [query.sort]: query.direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }), prisma.product.count({ where }), prisma.inventoryBalance.groupBy({
      by: ["productId"],
      where: { shopId, product: { isActive: true } },
      _sum: { onHand: true },
    })]);
    const stockByProductId = new Map(balances.map((balance) => [balance.productId, Number(balance._sum.onHand ?? 0)]));

    response.status(200).json({
      products: products.map(({ _count, ...product }) => ({
        ...product,
        currentStock: stockByProductId.get(product.id) ?? 0,
        hasSaleHistory: _count.orderItems > 0,
      })),
      totalCount: total,
      pagination: { page: query.page, pageSize: query.pageSize, total },
    });
  } catch (error) {
    next(error);
  }
});

productsRouter.get("/:shopId/products/:productId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request); const { shopId } = paramsSchema.parse(request.params); const productId = z.string().min(1).parse(request.params.productId);
    await assertUserOwnsShop(authUser.id, shopId);
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      include: {
        category: true,
        variants: true,
        units: { include: { unit: true } },
        balances: { select: { onHand: true } },
        barcodes: { orderBy: { createdAt: "desc" } },
        _count: { select: { orderItems: { where: { order: { shopId, cancelledAt: null } } } } },
      },
    });
    if (!product) throw notFound("Product not found.");
    const currentStock = product.balances.reduce((total, balance) => total + Number(balance.onHand ?? 0), 0);
    response.json({ product: { ...product, currentStock }, activeBarcode: product.barcodes.find((barcode) => barcode.status === "ACTIVE" && barcode.isPrimary) ?? null, hasSaleHistory: product._count.orderItems > 0 });
  } catch (error) { next(error); }
});

productsRouter.get("/:shopId/products/:productId/cost-history", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);

    const [movements, costEdits] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where: { shopId, productId, unitCost: { not: null }, OR: [{ direction: "IN" }, { type: "ADJUSTMENT_OUT" }] },
        select: { id: true, type: true, direction: true, baseQuantity: true, unitCost: true, averageCostAfter: true, sourceType: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: { shopId, entity: "Product", entityId: productId, action: "product.cost.revalue" },
        select: { id: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const movementHistory = movements.map((movement) => ({
      id: movement.id,
      date: movement.occurredAt,
      stockIn: movement.baseQuantity,
      direction: movement.direction,
      unitCost: movement.unitCost,
      averageCost: movement.averageCostAfter,
      source: movement.type === "PURCHASE_RECEIPT" ? "Purchase Receipt" : movement.type === "OPENING" ? "Stock In" : movement.type === "ADJUSTMENT_IN" ? "Adjustment In" : movement.type === "ADJUSTMENT_OUT" ? "Adjustment Out" : movement.sourceType,
    }));
    const editHistory = costEdits.map((entry) => {
      const metadata = entry.metadata as { newCost?: number; resultingCost?: number };
      return { id: entry.id, date: entry.createdAt, stockIn: null, direction: "NONE", unitCost: metadata.newCost ?? null, averageCost: metadata.resultingCost ?? null, source: "Cost Price Edit", kind: "COST_EDIT" };
    });
    response.json({
      history: [...movementHistory, ...editHistory].sort((left, right) => right.date.getTime() - left.date.getTime()),
    });
  } catch (error) {
    next(error);
  }
});

productsRouter.get("/:shopId/products/:productId/source-history", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);
    const sources = await prisma.inventoryBatch.findMany({
      where: { shopId, productId },
      select: { id: true, supplierName: true, invoiceReference: true, quantity: true, unitCost: true, receivedAt: true },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    });
    response.json({ sources });
  } catch (error) { next(error); }
});

productsRouter.get("/:shopId/variants", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    await assertUserOwnsShop(authUser.id, shopId);

    const where: Prisma.ProductVariantWhereInput = {
      product: {
        shopId,
        ...(query.category ? { categoryId: query.category } : {}),
        ...(query.capability ? { capabilities: { path: [query.capability], equals: true } } : {}),
      },
      ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
      ...(query.location ? { balances: { some: { locationId: query.location } } } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { sku: { contains: query.search, mode: "insensitive" } },
          { product: { name: { contains: query.search, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const variantSort = query.sort === "price" ? "price" : query.sort;
    const [variants, totalCount] = await prisma.$transaction([
      prisma.productVariant.findMany({
        where,
        include: { product: { include: { category: true } }, balances: true },
        orderBy: { [variantSort]: query.direction },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.productVariant.count({ where }),
    ]);
    response.json({
      variants,
      totalCount,
      pagination: { page: query.page, pageSize: query.pageSize, total: totalCount },
    });
  } catch (error) {
    next(error);
  }
});

productsRouter.post("/:shopId/products", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = productSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertCategoryBelongsToShop(input.categoryId, shopId);
    if (input.price < input.cost) throw badRequest("Selling price cannot be lower than cost price.");
    if (input.trackingMode === "LOT") await assertCapability(prisma, shopId, "inventory.lots");
    if (input.trackingMode === "SERIAL") await assertCapability(prisma, shopId, "inventory.serials");

    const data: Prisma.ProductUncheckedCreateInput = {
      name: input.name,
      price: input.price,
      shopId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.optionTree !== undefined ? { optionTree: normalizeOptionTree(input.optionTree) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.trackingMode !== undefined ? { trackingMode: input.trackingMode } : {}),
      ...(input.quantityPrecision !== undefined ? { quantityPrecision: input.quantityPrecision } : {}),
    };

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data,
        include: {
          category: true,
          variants: true,
          units: { include: { unit: true } },
        },
      });
      await createProductUnits(tx, shopId, createdProduct.id, input.units ?? []);
      if (input.barcode) {
        let value = input.barcode.kind === "INTERNAL" ? (input.barcode.value || internalBarcodeCandidate(input.name)) : input.barcode.value;
        if (input.barcode.kind === "INTERNAL" && !/^[A-Z]{2}\d{4}$/.test(value || "")) throw badRequest("Internal barcode must use the CK4821 format.");
        if (input.barcode.kind === "INTERNAL" && !input.barcode.value) {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            const candidate = attempt === 0 ? value : internalBarcodeCandidate(input.name);
            if (!await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: candidate! } } })) { value = candidate; break; }
          }
        }
        if (!value) throw badRequest("Barcode value is required.");
        const symbology = input.barcode.kind === "INTERNAL" ? "CODE128" : input.barcode.symbology;
        const message = validateBarcode(value, symbology);
        if (message) throw badRequest(message);
        const normalizedValue = normalizeBarcode(value);
        if (await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } })) throw conflict("Barcode is already linked in this store.");
        const baseUnit = await tx.productUnit.findFirst({ where: { productId: createdProduct.id, isBase: true } });
        await tx.productBarcode.create({ data: { shopId, productId: createdProduct.id, value, normalizedValue, symbology, kind: input.barcode.kind, isInternal: input.barcode.kind === "INTERNAL", isPrimary: true, ...(baseUnit ? { productUnitId: baseUnit.id } : {}) } });
      }
      if (input.shortCode) {
        const normalizedValue = normalizeBarcode(input.shortCode);
        if (await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue } } })) throw conflict("Short code is already used in this store.");
        await tx.productBarcode.create({ data: { shopId, productId: createdProduct.id, value: normalizedValue, normalizedValue, symbology: "CODE128", kind: "INTERNAL", isInternal: true, isPrimary: false } });
      }
      if (input.barcodeReservationId) {
        const reservation = await tx.generatedBarcode.findFirst({ where: { id: input.barcodeReservationId, shopId, status: "UNASSIGNED" } });
        if (!reservation) throw notFound("Selected generated barcode is no longer available.");
        if (await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: reservation.normalizedValue } } })) throw conflict("Selected barcode is already used in this store.");
        await tx.productBarcode.updateMany({ where: { shopId, productId: createdProduct.id, isPrimary: true }, data: { isPrimary: false } });
        await tx.productBarcode.create({ data: { shopId, productId: createdProduct.id, value: reservation.value, normalizedValue: reservation.normalizedValue, symbology: "CODE128", kind: "INTERNAL", isInternal: true, isPrimary: true } });
        await tx.generatedBarcode.update({ where: { id: reservation.id }, data: { status: "ASSIGNED", assignedProductId: createdProduct.id } });
      }
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "product.create",
        entity: "Product",
        entityId: createdProduct.id,
        metadata: { name: input.name },
      });
      return tx.product.findUniqueOrThrow({
        where: { id: createdProduct.id },
        include: { category: true, variants: true, units: { include: { unit: true } }, barcodes: { where: { status: "ACTIVE", isPrimary: true } } },
      });
    });

    response.status(201).json({ product });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") next(conflict("Barcode is already linked in this store.")); else next(error);
  }
});

productsRouter.patch("/:shopId/products/:productId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    if (request.body && typeof request.body === "object" && "stockQuantity" in request.body) {
      throw badRequest("Stock quantity must be changed through inventory movements.");
    }
    const input = updateProductSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);
    await assertCategoryBelongsToShop(input.categoryId, shopId);
    const currentProduct = await prisma.product.findFirst({ where: { id: productId, shopId }, select: { cost: true, price: true } });
    const nextCost = input.cost ?? currentProduct?.cost ?? 0;
    const nextPrice = input.price ?? currentProduct?.price ?? 0;
    if (nextPrice < nextCost) throw badRequest("Selling price cannot be lower than cost price.");

    const data: Prisma.ProductUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.optionTree !== undefined ? { optionTree: normalizeOptionTree(input.optionTree) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.trackingMode !== undefined ? { trackingMode: input.trackingMode } : {}),
      ...(input.quantityPrecision !== undefined ? { quantityPrecision: input.quantityPrecision } : {}),
      version: { increment: 1 },
    };

    const product = await prisma.$transaction(async (tx) => {
      const costChanged = input.cost !== undefined && input.cost !== currentProduct?.cost;
      if (costChanged) {
        // Revalue only current inventory. Historical OrderItem cost snapshots
        // remain immutable after a sale.
        await tx.inventoryBatch.updateMany({
          where: { shopId, productId, quantity: { gt: 0 } },
          data: { unitCost: input.cost! },
        });
      }
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data,
        include: {
          category: true,
          variants: true,
        },
      });

      if (input.units !== undefined) await reconcileProductUnits(tx, shopId, productId, input.units);

      if (input.optionTree !== undefined) {
        for (const variant of updatedProduct.variants) {
          const nextPath = relabelVariantPath(updatedProduct.optionTree, variant.optionPath);
          if (nextPath.length === 0) continue;
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              optionPath: nextPath,
              option1: nextPath[0]?.value ?? null,
              option2: nextPath[1]?.value ?? null,
              option3: nextPath[2]?.value ?? null,
              name: variantNameFromPath(nextPath),
            },
          });
        }
      }

      const finalProduct = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        include: {
          category: true,
          variants: true,
          units: { include: { unit: true } },
        },
      });
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "product.update",
        entity: "Product",
        entityId: productId,
      });
      if (costChanged) {
        await writeAuditLog(tx, {
          shopId,
          actorId: authUser.id,
          action: "product.cost.revalue",
          entity: "Product",
          entityId: productId,
          metadata: {
            previousCost: currentProduct?.cost ?? null,
            newCost: input.cost!,
            resultingCost: finalProduct.cost ?? input.cost!,
          },
        });
      }
      return finalProduct;
    });

    response.status(200).json({ product });
  } catch (error) {
    next(error);
  }
});

productsRouter.post("/:shopId/products/:productId/short-code/generate", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request); const { shopId } = paramsSchema.parse(request.params); const productId = z.string().min(1).parse(request.params.productId);
    await assertUserOwnsShop(authUser.id, shopId);
    const barcode = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, shopId } }); if (!product) throw notFound("Product not found.");
      let value = "";
      for (let attempt = 0; attempt < 30; attempt += 1) { const candidate = internalBarcodeCandidate(product.name); if (!await tx.productBarcode.findUnique({ where: { shopId_normalizedValue: { shopId, normalizedValue: candidate } } })) { value = candidate; break; } }
      if (!value) throw conflict("Could not generate a unique short code.");
      const created = await tx.productBarcode.create({ data: { shopId, productId, value, normalizedValue: value, symbology: "CODE128", kind: "INTERNAL", isInternal: true, isPrimary: false } });
      await writeAuditLog(tx, { shopId, actorId: authUser.id, action: "product.short-code.generate", entity: "ProductBarcode", entityId: created.id, metadata: { productId, value } });
      return created;
    });
    response.status(201).json({ barcode });
  } catch (error) { next(error); }
});

productsRouter.delete("/:shopId/products/:productId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);

    await assertUserOwnsShop(authUser.id, shopId);
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      include: {
        inventory: true,
        variants: true,
      },
    });

    if (!product) {
      const error = new Error("Product not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const availableQuantity = product.inventory.reduce(
      (sum, batch) => sum + Math.max(0, batch.quantity - batch.reservedQuantity),
      0,
    );

    const [saleHistoryCount, purchaseHistoryCount, stockMovementHistoryCount] = await Promise.all([
      prisma.orderItem.count({ where: { productId, order: { shopId, cancelledAt: null } } }),
      prisma.purchaseItem.count({ where: { productId, purchase: { shopId } } }),
      prisma.inventoryMovement.count({ where: { productId, shopId } }),
    ]);
    if (saleHistoryCount > 0) throw badRequest("Products with sale history cannot be deleted.");

    const removedProduct = await prisma.$transaction(async (tx) => {
      const [batches, balances, activeReservations] = await Promise.all([
        tx.inventoryBatch.findMany({ where: { shopId, productId } }),
        tx.inventoryBalance.findMany({ where: { shopId, productId } }),
        tx.inventoryReservation.count({ where: { shopId, productId, status: "ACTIVE" } }),
      ]);
      if (activeReservations || batches.some((batch) => batch.reservedQuantity > 0) || balances.some((balance) => Number(balance.reserved) > 0)) {
        throw badRequest("Release reserved stock before deleting this product.");
      }
      for (const batch of batches) {
        if (batch.quantity <= 0) continue;
        await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: 0, ...(batch.baseQuantity !== null ? { baseQuantity: 0 } : {}) } });
      }
      for (const balance of balances) {
        const available = Number(balance.onHand) - Number(balance.reserved);
        if (available <= 0) continue;
        await recordInventoryMovement(tx, {
          shopId, productId, variantId: balance.variantId, locationId: balance.locationId,
          type: "PRODUCT_DELETED", direction: "OUT", quantity: available,
          sourceType: "Product", sourceId: productId,
          idempotencyKey: `product.delete:${productId}:${balance.locationId}:${balance.variantId ?? "base"}`,
          reason: "Product deleted",
        });
      }

      await tx.productVariant.updateMany({
        where: { productId },
        data: { isActive: false, archivedAt: new Date() },
      });

      const archivedProduct = await tx.product.update({
        where: { id: productId },
        data: { isActive: false },
        include: {
          category: true,
          variants: true,
        },
      });
      await tx.productBarcode.updateMany({
        where: { shopId, productId, status: "ACTIVE" },
        data: { status: "RETIRED", retiredAt: new Date(), isPrimary: false, version: { increment: 1 } },
      });
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "product.delete",
        entity: "Product",
        entityId: productId,
        metadata: { availableQuantity, removedInventory: availableQuantity > 0, saleHistoryCount, purchaseHistoryCount, stockMovementHistoryCount },
      });
      return { product: archivedProduct, deleted: false, archived: true };
    });

    response.status(200).json({ ...removedProduct, removed: true });
  } catch (error) {
    next(error);
  }
});

productsRouter.post("/:shopId/products/:productId/variants", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    const input = variantSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      select: { id: true, optionTree: true },
    });

    if (!product) {
      const error = new Error("Product not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const optionPath = validateVariantPath(product.optionTree, input.optionPath);
    const signature = variantSignature(optionPath);

    const duplicateVariant = await prisma.productVariant.findFirst({
      where: { productId, variantSignature: signature },
      select: { id: true, isActive: true },
    });

    if (duplicateVariant) {
      throw badRequest(
        duplicateVariant.isActive
          ? "This variant already exists."
          : "This variant is archived. Edit or reactivate it instead of creating a duplicate.",
      );
    }

    const data: Prisma.ProductVariantUncheckedCreateInput = {
      name: input.name || variantNameFromPath(optionPath),
      productId,
      optionPath,
      variantSignature: signature,
    };
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.price !== undefined) data.price = input.price;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.option3 !== undefined) data.option3 = input.option3;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    data.option1 = input.option1 ?? optionPath[0]?.value ?? null;
    data.option2 = input.option2 ?? optionPath[1]?.value ?? null;
    data.option3 = input.option3 ?? optionPath[2]?.value ?? null;

    const variant = await prisma.$transaction(async (tx) => {
      const createdVariant = await tx.productVariant.create({
        data,
      });
      await writeAuditLog(tx, {
        shopId,
        actorId: authUser.id,
        action: "variant.create",
        entity: "ProductVariant",
        entityId: createdVariant.id,
        metadata: { productId, variantSignature: signature },
      });
      return createdVariant;
    });

    response.status(201).json({ variant });
  } catch (error) {
    next(error);
  }
});

productsRouter.patch(
  "/:shopId/products/:productId/variants/:variantId",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const productId = z.string().min(1).parse(request.params.productId);
      const variantId = z.string().min(1).parse(request.params.variantId);
      const input = updateVariantSchema.parse(request.body);

      await assertUserOwnsShop(authUser.id, shopId);
      const product = await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true, optionTree: true },
      });

      if (!product) {
        const error = new Error("Product not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const existingVariant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!existingVariant) {
        const error = new Error("Product variant not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const optionPath =
        input.optionPath !== undefined ? validateVariantPath(product.optionTree, input.optionPath) : undefined;

      if (optionPath !== undefined) {
        const duplicateVariant = await prisma.productVariant.findFirst({
          where: {
            productId,
            variantSignature: variantSignature(optionPath),
            id: { not: variantId },
          },
          select: { id: true },
        });

        if (duplicateVariant) {
          throw badRequest("This variant already exists.");
        }
      }

      const data: Prisma.ProductVariantUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.sku !== undefined) data.sku = input.sku;
      if (input.price !== undefined) data.price = input.price;
      if (input.cost !== undefined) data.cost = input.cost;
      if (input.option3 !== undefined) data.option3 = input.option3;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.option1 !== undefined) data.option1 = input.option1;
      if (input.option2 !== undefined) data.option2 = input.option2;
      if (optionPath !== undefined) {
        data.option1 = optionPath[0]?.value ?? null;
        data.option2 = optionPath[1]?.value ?? null;
        data.option3 = optionPath[2]?.value ?? null;
        data.optionPath = optionPath;
        data.variantSignature = variantSignature(optionPath);
      }

      const variant = await prisma.$transaction(async (tx) => {
        const updatedVariant = await tx.productVariant.update({
          where: { id: variantId },
          data,
        });
        await writeAuditLog(tx, {
          shopId,
          actorId: authUser.id,
          action: "variant.update",
          entity: "ProductVariant",
          entityId: variantId,
          metadata: { productId },
        });
        return updatedVariant;
      });

      response.status(200).json({ variant });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.delete(
  "/:shopId/products/:productId/variants/:variantId",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const productId = z.string().min(1).parse(request.params.productId);
      const variantId = z.string().min(1).parse(request.params.variantId);

      await assertUserOwnsShop(authUser.id, shopId);
      await assertProductBelongsToShop(productId, shopId);

      const existingVariant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!existingVariant) {
        const error = new Error("Product variant not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const usage = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          _count: {
            select: {
              inventory: true,
              orderItems: true,
            },
          },
        },
      });

      if ((usage?._count.inventory ?? 0) > 0 || (usage?._count.orderItems ?? 0) > 0) {
        const variant = await prisma.$transaction(async (tx) => {
          const archivedVariant = await tx.productVariant.update({
            where: { id: variantId },
            data: { isActive: false, archivedAt: new Date() },
          });
          await writeAuditLog(tx, {
            shopId,
            actorId: authUser.id,
            action: "variant.archive",
            entity: "ProductVariant",
            entityId: variantId,
            metadata: { productId },
          });
          return archivedVariant;
        });
        response.status(200).json({ variant, archived: true });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.productVariant.delete({ where: { id: variantId } });
        await writeAuditLog(tx, {
          shopId,
          actorId: authUser.id,
          action: "variant.delete",
          entity: "ProductVariant",
          entityId: variantId,
          metadata: { productId },
        });
      });

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
