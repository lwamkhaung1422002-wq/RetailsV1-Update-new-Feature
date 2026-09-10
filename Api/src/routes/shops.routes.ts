import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { removeShopLogo, uploadShopLogo } from "../lib/cloudinary.js";
import { prisma } from "../lib/prisma.js";
import { applyTemplateDefaults } from "../lib/store-capabilities.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { assertShopAccess, assertShopOwner, getAccessibleShops, publicShop } from "../lib/shop-access.js";
import { getAuthUser, type AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";

export const shopsRouter = Router();

const createShopSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required."),
  currencyCode: z.enum(["MMK", "USD", "THB"]),
});
const shopParamsSchema = z.object({ shopId: z.string().min(1) });
const updateShopSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.url().max(2_000).nullable().optional(),
});
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

shopsRouter.use(requireAuth);

shopsRouter.get("/", async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;

    const shops = await getAccessibleShops(authRequest.user.id);

    response.status(200).json({ shops });
  } catch (error) {
    next(error);
  }
});

shopsRouter.post("/", async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;
    const input = createShopSchema.parse(request.body);

    const shop = await prisma.$transaction(async (tx) => {
      const created = await tx.shop.create({
        data: {
          name: input.name,
          ownerId: authRequest.user.id,
          ledgerEnabled: true,
          inventoryReadMode: "LEDGER",
          ledgerCutoverAt: new Date(),
          setting: { create: { currencyCode: input.currencyCode } },
        },
        include: { setting: true },
      });
      await applyTemplateDefaults(tx, created.id, "GENERAL_STORE", { includeCategories: false });
      return created;
    });

    response.status(201).json({ shop: publicShop(shop) });
  } catch (error) {
    next(error);
  }
});

shopsRouter.get("/:shopId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = shopParamsSchema.parse(request.params);
    const access = await assertShopAccess(authUser.id, shopId);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, include: { setting: true } });
    response.json({ shop: { ...publicShop(shop), role: access.role, permissions: access.permissions, isOwner: access.isOwner } });
  } catch (error) {
    next(error);
  }
});

shopsRouter.patch("/:shopId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = shopParamsSchema.parse(request.params);
    const input = updateShopSchema.parse(request.body);
    await assertShopOwner(authUser.id, shopId);
    const shop = await prisma.$transaction(async (tx) => {
      const updated = await tx.shop.update({
        where: { id: shopId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.address !== undefined ? { address: input.address || null } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl || null } : {}),
        },
        include: { setting: true },
      });
      await writeAuditLog(tx, { shopId, actorId: authUser.id, action: "shop.update", entity: "Shop", entityId: shopId, metadata: input });
      return updated;
    });
    response.json({ shop: publicShop(shop) });
  } catch (error) {
    next(error);
  }
});

shopsRouter.post("/:shopId/logo", (request, response, next) => {
  logoUpload.single("logo")(request, response, (error) => {
    if (!error) return next();
    next(Object.assign(new Error(error.code === "LIMIT_FILE_SIZE" ? "Logo image must be 5 MB or smaller." : "Choose a JPEG, PNG, or WebP logo image."), { name: "BadRequestError" }));
  });
}, async (request, response, next) => {
  let uploadedPublicId: string | undefined;
  try {
    const authUser = getAuthUser(request);
    const { shopId } = shopParamsSchema.parse(request.params);
    await assertShopOwner(authUser.id, shopId);
    if (!request.file) throw Object.assign(new Error("Choose a JPEG, PNG, or WebP logo image."), { name: "BadRequestError" });
    if (!["image/jpeg", "image/png", "image/webp"].includes(request.file.mimetype)) throw Object.assign(new Error("Choose a JPEG, PNG, or WebP logo image."), { name: "BadRequestError" });

    const current = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { logoPublicId: true } });
    const uploaded = await uploadShopLogo(shopId, request.file.buffer);
    uploadedPublicId = uploaded.publicId;
    const shop = await prisma.$transaction(async (tx) => {
      const updated = await tx.shop.update({ where: { id: shopId }, data: { logoUrl: uploaded.secureUrl, logoPublicId: uploaded.publicId }, include: { setting: true } });
      await writeAuditLog(tx, { shopId, actorId: authUser.id, action: "shop.logo.upload", entity: "Shop", entityId: shopId, metadata: { logoPublicId: uploaded.publicId } });
      return updated;
    });
    uploadedPublicId = undefined;
    await removeShopLogo(current.logoPublicId).catch(() => {});
    response.status(201).json({ shop: publicShop(shop) });
  } catch (error) {
    if (uploadedPublicId) await removeShopLogo(uploadedPublicId).catch(() => {});
    next(error);
  }
});

shopsRouter.delete("/:shopId/logo", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = shopParamsSchema.parse(request.params);
    await assertShopOwner(authUser.id, shopId);
    const current = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { logoPublicId: true } });
    const shop = await prisma.$transaction(async (tx) => {
      const updated = await tx.shop.update({ where: { id: shopId }, data: { logoUrl: null, logoPublicId: null }, include: { setting: true } });
      await writeAuditLog(tx, { shopId, actorId: authUser.id, action: "shop.logo.remove", entity: "Shop", entityId: shopId });
      return updated;
    });
    await removeShopLogo(current.logoPublicId).catch(() => {});
    response.json({ shop: publicShop(shop) });
  } catch (error) {
    next(error);
  }
});
