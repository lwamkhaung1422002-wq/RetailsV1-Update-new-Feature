import { Router } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { approvalAccessToken, approvalAuditMetadata, authorizeSensitiveAction, consumeManagerApproval } from "../lib/manager-approval.js";
import { recordInventoryMovement } from "../lib/inventory-domain.js";
import { refreshProductWeightedCost } from "../lib/costing.js";
import { prisma } from "../lib/prisma.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

const params = z.object({ shopId: z.string().min(1) });
const money = z.coerce.number().int().nonnegative();
// Receiving, cancelling, or returning purchases can update inventory and financial records atomically.
const PURCHASE_LIFECYCLE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const supplierInput = z.object({
  name: z.string().trim().min(1),
  contactPerson: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.email().trim().toLowerCase().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});
const supplierDeliveryInput = z.object({
  invoiceNumber: z.string().trim().min(1).max(160),
  deliveryName: z.string().trim().min(1).max(160),
  deliveryPhone: z.string().trim().min(1).max(80),
  receivedAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  amount: money.positive(),
}).superRefine((value, context) => {
  if (value.dueAt < value.receivedAt) context.addIssue({ code: "custom", path: ["dueAt"], message: "Due date cannot be before receive date." });
});
const supplierWithDeliveryInput = supplierInput.extend({ deliveryRecord: supplierDeliveryInput.optional() });
const itemInput = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  quantity: z.coerce.number().positive(),
  unitCost: money,
  promotionLabel: z.string().trim().max(200).optional(),
});
const purchaseInput = z.object({
  supplierId: z.string().min(1),
  supplierInvoiceNumber: z.string().trim().min(1).optional(),
  senderName: z.string().trim().optional(),
  senderPhone: z.string().trim().optional(),
  receiverName: z.string().trim().optional(),
  orderedAt: z.coerce.date().optional(),
  expectedAt: z.coerce.date().optional(),
  deliveryCost: money.optional(),
  notes: z.string().trim().optional(),
  items: z.array(itemInput).min(1),
});
const receiptInput = z.object({
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().optional(),
  items: z.array(z.object({
    purchaseItemId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    actualUnitCost: money.optional(),
    locationId: z.string().min(1).optional(),
    lot: z.object({
      lotNumber: z.string().trim().min(1),
      expiresAt: z.coerce.date().optional(),
    }).optional(),
    serials: z.array(z.object({
      serial: z.string().trim().min(1),
      imei: z.string().trim().min(1).optional(),
    })).optional(),
  })).min(1),
  confirmPriceChanges: z.boolean().optional(),
});
const productSupplierInput = z.object({
  productId: z.string().min(1),
  supplierId: z.string().min(1),
  lastUnitCost: money.optional(),
  notes: z.string().trim().max(500).optional(),
});
const paymentInput = z.object({
  amount: z.coerce.number().int().positive(),
  method: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  paidAt: z.coerce.date().optional(),
  payerName: z.string().trim().optional(),
  payerPhone: z.string().trim().optional(),
  signatureDataUrl: z.string().trim().optional(),
  mobileAccountName: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.method.toLowerCase() === "cash" && !value.signatureDataUrl) {
    context.addIssue({ code: "custom", path: ["signatureDataUrl"], message: "Receiver signature is required for cash payments." });
  }
  if (value.method.toLowerCase() !== "cash" && !value.reference) {
    context.addIssue({ code: "custom", path: ["reference"], message: "Transaction ID is required for non-cash payments." });
  }
});
const cancelInput = z.object({
  reason: z.string().trim().min(1),
  approver: z.string().trim().min(1),
});
const returnInput = z.object({
  purchaseReceiptId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  reason: z.string().trim().min(1),
  returnedAt: z.coerce.date().optional(),
});
const reversalInput = z.object({
  reason: z.string().trim().min(1),
});
const listQuery = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort: z.enum(["createdAt", "orderedAt", "purchaseNumber", "total"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine((value) => [25, 50, 100].includes(value)).default(25),
});

function badRequest(message: string) {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}
function conflict(message: string) {
  const error = new Error(message);
  error.name = "ConflictError";
  return error;
}
function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}
function uniqueConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
  if (target.includes("invoiceNumber")) return conflict("This invoice number already exists.");
  if (target.includes("name") && target.includes("phone")) return conflict("This supplier name and phone already exist. Please use the existing supplier.");
  return conflict("A supplier record with these details already exists.");
}
const QUANTITY_SCALE = 3;
function quantityDecimal(value: string | number | Prisma.Decimal | null | undefined) {
  return new Prisma.Decimal(value ?? 0).toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}
function compatibilityQuantity(value: Prisma.Decimal) {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
function moneyFromDecimal(value: Prisma.Decimal) {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
/** The delivery record is the supplier invoice.  Keep its financial projection
 * in one place so list, details and payment consumers cannot disagree. */
type SupplierInvoicePayment = {
  amount: number;
  reversedAt: Date | null;
  reversal?: { id: string; reason: string; reversedAt: Date } | null;
};
function isActiveSupplierInvoicePayment(payment: SupplierInvoicePayment) {
  // reversedAt is retained only for records created before reversal events.
  return !payment.reversedAt && !payment.reversal;
}
function serializeSupplierInvoice<T extends { amount: number; status: string; payments: SupplierInvoicePayment[] }>(record: T) {
  const activePaid = record.payments
    .filter(isActiveSupplierInvoicePayment)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, record.amount - activePaid);
  const invoiceStatus = record.status === "cancelled" ? "Cancelled" : remaining === 0 ? "Paid" : "Credit";
  const activePaymentCount = record.payments.filter(isActiveSupplierInvoicePayment).length;
  return {
    ...record,
    activePaid,
    remaining,
    activePaymentCount,
    invoiceStatus,
    allowedActions: {
      pay: invoiceStatus === "Credit" && remaining > 0,
      edit: invoiceStatus === "Credit" && activePaymentCount === 0,
      cancelInvoice: invoiceStatus === "Credit" && activePaymentCount === 0,
      cancelPayment: invoiceStatus !== "Cancelled" && activePaymentCount > 0,
    },
  };
}
function purchaseItemBaseQuantity(line: {
  quantity: number;
  baseQuantity?: unknown;
}) {
  return quantityDecimal(line.baseQuantity == null ? line.quantity : String(line.baseQuantity));
}
function receivedItemBaseQuantity(line: {
  receivedQuantity: number;
  receivedBaseQuantity?: unknown;
}) {
  return quantityDecimal(
    line.receivedBaseQuantity == null ? line.receivedQuantity : String(line.receivedBaseQuantity),
  );
}
const purchaseInclude = {
  supplier: true,
  items: {
    include: {
      product: { include: { units: { include: { unit: true } } } },
      variant: true,
    },
  },
  receipts: { include: { inventoryBatch: true } },
  payments: true,
  returns: true,
} as const;

purchasesRouter.get("/:shopId/suppliers", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const query = listQuery.parse(request.query);
    const where = {
      shopId,
      ...(query.status ? { isActive: query.status === "active" } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const [suppliers, total] = await prisma.$transaction([prisma.supplier.findMany({
      where,
      include: { purchases: { select: { total: true, paidAmount: true, status: true } }, deliveryRecords: { orderBy: { receivedAt: "desc" }, take: 1 } },
      orderBy: { name: query.direction },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }), prisma.supplier.count({ where })]);
    response.json({
      suppliers,
      totalCount: total,
      pagination: { page: query.page, pageSize: query.pageSize, total },
    });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/suppliers", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = supplierWithDeliveryInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    if (!input.phone || !input.deliveryRecord) throw badRequest("Supplier phone and delivery record are required.");
    const supplierPhone = input.phone;
    const deliveryRecord = input.deliveryRecord;
    const creator = await prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } });
    const creatorName = creator?.name?.trim();
    if (!creatorName) throw badRequest("Authenticated supplier creator name could not be resolved.");
    const existingRecord = await prisma.supplierDeliveryRecord.findFirst({ where: { shopId, invoiceNumber: deliveryRecord.invoiceNumber }, select: { id: true } });
    if (existingRecord) throw conflict("This invoice number already exists.");
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierDeliveryRecord.create({ data: { shopId, supplierName: input.name, supplierPhone, ...deliveryRecord, receiverName: creatorName } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "supplier.delivery.create", entity: "SupplierDeliveryRecord", entityId: created.id, metadata: { invoiceNumber: created.invoiceNumber } });
      return created;
    });
    response.status(201).json({ record });
  } catch (error) { next(uniqueConflict(error) || error); }
});

purchasesRouter.patch("/:shopId/suppliers/:supplierId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = supplierWithDeliveryInput.partial().parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const existing = await prisma.supplier.findFirst({ where: { id: request.params.supplierId, shopId } });
    if (!existing) throw notFound("Supplier not found.");
    const supplier = await prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id: existing.id }, data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      } });
      if (input.deliveryRecord) {
        const latest = await tx.supplierDeliveryRecord.findFirst({ where: { shopId, supplierId: existing.id }, orderBy: { receivedAt: "desc" } });
        const paymentCount = await tx.purchasePayment.count({ where: { purchase: { supplierId: existing.id, shopId } } });
        if (latest && input.deliveryRecord.amount < latest.amount) {
          throw badRequest("Amount cannot be reduced below the original created amount.");
        }
        if (latest) await tx.supplierDeliveryRecord.update({ where: { id: latest.id }, data: input.deliveryRecord });
        else {
          const creator = await tx.user.findUnique({ where: { id: auth.id }, select: { name: true } });
          const creatorName = creator?.name?.trim();
          if (!creatorName) throw badRequest("Authenticated supplier creator name could not be resolved.");
          await tx.supplierDeliveryRecord.create({ data: { shopId, supplierId: existing.id, supplierName: input.name || existing.name, supplierPhone: input.phone || existing.phone || "", ...input.deliveryRecord, receiverName: creatorName } });
        }
      }
      return updated;
    });
    response.json({ supplier });
  } catch (error) { next(uniqueConflict(error) || error); }
});

purchasesRouter.get("/:shopId/supplier-delivery-records", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const query = listQuery.parse(request.query);
    const where = { shopId, ...(query.search ? { OR: [{ invoiceNumber: { contains: query.search, mode: "insensitive" as const } }, { supplierName: { contains: query.search, mode: "insensitive" as const } }, { supplier: { name: { contains: query.search, mode: "insensitive" as const } } }, { deliveryName: { contains: query.search, mode: "insensitive" as const } }] } : {}) };
    const [records, total] = await prisma.$transaction([prisma.supplierDeliveryRecord.findMany({ where, include: { supplier: true, payments: { include: { reversal: true }, orderBy: { paidAt: "asc" } } }, orderBy: { receivedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.supplierDeliveryRecord.count({ where })]);
    response.json({ records: records.map(serializeSupplierInvoice), totalCount: total, pagination: { page: query.page, pageSize: query.pageSize, total } });
  } catch (error) { next(error); }
});

purchasesRouter.get("/:shopId/supplier-delivery-records/:recordId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const record = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId }, include: { supplier: true, payments: { include: { reversal: true }, orderBy: { paidAt: "asc" } } } });
    if (!record) throw notFound("Supplier delivery record not found.");
    response.json({ record: serializeSupplierInvoice(record) });
  } catch (error) { next(error); }
});

purchasesRouter.patch("/:shopId/supplier-delivery-records/:recordId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = supplierWithDeliveryInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    if (!input.phone || !input.deliveryRecord) throw badRequest("Supplier phone and delivery record are required.");
    const existing = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId }, include: { payments: { include: { reversal: true } } } });
    if (!existing) throw notFound("Supplier delivery record not found.");
    if (existing.status === "cancelled") throw badRequest("Cancelled supplier records cannot be edited.");
    const activePayments = existing.payments.filter(isActiveSupplierInvoicePayment);
    if (activePayments.length) throw badRequest("Supplier records with active payments cannot be edited.");
    const paidAmount = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (input.deliveryRecord.amount < paidAmount) throw badRequest("Amount cannot be reduced below the paid amount.");
    const duplicate = await prisma.supplierDeliveryRecord.findFirst({ where: { shopId, invoiceNumber: input.deliveryRecord.invoiceNumber, NOT: { id: existing.id } }, select: { id: true } });
    if (duplicate) throw conflict("This invoice number already exists.");
    const record = await prisma.supplierDeliveryRecord.update({ where: { id: existing.id }, data: { supplierName: input.name, supplierPhone: input.phone, ...input.deliveryRecord } });
    response.json({ record });
  } catch (error) { next(uniqueConflict(error) || error); }
});

purchasesRouter.post("/:shopId/supplier-delivery-records/:recordId/payments", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = paymentInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    const record = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId }, include: { payments: { include: { reversal: true } } } });
    if (!record) throw notFound("Supplier delivery record not found.");
    if (record.status === "cancelled") throw badRequest("Cancelled supplier records cannot receive payment.");
    const paidAmount = record.payments.filter(isActiveSupplierInvoicePayment).reduce((sum, payment) => sum + payment.amount, 0);
    const remaining = Math.max(0, record.amount - paidAmount);
    if (remaining <= 0) throw badRequest("This supplier invoice is already paid.");
    if (input.amount > remaining) throw badRequest("Payment amount cannot exceed outstanding balance.");
    const payment = await prisma.supplierDeliveryPayment.create({ data: { shopId, deliveryRecordId: record.id, amount: input.amount, method: input.method, ...(input.reference !== undefined ? { reference: input.reference } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}), ...(input.payerName !== undefined ? { payerName: input.payerName } : {}), ...(input.payerPhone !== undefined ? { payerPhone: input.payerPhone } : {}), ...(input.signatureDataUrl !== undefined ? { signatureDataUrl: input.signatureDataUrl } : {}), ...(input.mobileAccountName !== undefined ? { mobileAccountName: input.mobileAccountName } : {}) } });
    response.status(201).json({ payment });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/supplier-delivery-records/:recordId/cancel", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = reversalInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    const record = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId }, include: { payments: { include: { reversal: true } } } });
    if (!record) throw notFound("Supplier delivery record not found.");
    if (record.payments.some(isActiveSupplierInvoicePayment)) throw badRequest("Cancel active supplier payments before cancelling this record.");
    const cancelled = await prisma.supplierDeliveryRecord.update({ where: { id: record.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: input.reason } });
    await writeAuditLog(prisma, { shopId, actorId: auth.id, action: "supplier.delivery.cancel", entity: "SupplierDeliveryRecord", entityId: record.id, metadata: { reason: input.reason } });
    response.json({ record: cancelled, cancelled: true });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/supplier-delivery-records/:recordId/payments/:paymentId/reverse", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); const input = reversalInput.parse(request.body); await assertUserOwnsShop(auth.id, shopId);
    const authorization = await authorizeSensitiveAction({ requesterId: auth.id, shopId, action: "supplier.payment.reverse", targetId: request.params.paymentId!, payload: { deliveryRecordId: request.params.recordId!, paymentId: request.params.paymentId!, ...input }, approvalToken: approvalAccessToken(request.headers) });
    const record = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId } });
    if (!record) throw notFound("Supplier delivery record not found.");
    if (record.status === "cancelled") throw badRequest("Cancelled supplier records cannot change payments.");
    const payment = await prisma.supplierDeliveryPayment.findFirst({ where: { id: request.params.paymentId, deliveryRecordId: record.id, shopId }, include: { reversal: true } });
    if (!payment) throw notFound("Supplier payment not found.");
    if (payment.reversedAt || payment.reversal) throw badRequest("Supplier payment has already been cancelled.");
    const reversed = await prisma.$transaction(async (tx) => {
      await consumeManagerApproval(tx, authorization);
      const event = await tx.supplierDeliveryPaymentReversal.create({ data: { shopId, originalPaymentId: payment.id, reason: input.reason, actorId: auth.id } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "supplier.delivery.payment.reverse", entity: "SupplierDeliveryPaymentReversal", entityId: event.id, metadata: { deliveryRecordId: record.id, originalPaymentId: payment.id, amount: payment.amount, reason: input.reason, ...approvalAuditMetadata(authorization) } });
      const updatedRecord = await tx.supplierDeliveryRecord.findUniqueOrThrow({
        where: { id: record.id },
        include: { supplier: true, payments: { include: { reversal: true }, orderBy: { paidAt: "asc" } } },
      });
      return { event, record: serializeSupplierInvoice(updatedRecord) };
    });
    response.json({ reversal: reversed.event, record: reversed.record });
  } catch (error) { next(error); }
});

purchasesRouter.delete("/:shopId/supplier-delivery-records/:recordId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request); const { shopId } = params.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
    const record = await prisma.supplierDeliveryRecord.findFirst({ where: { id: request.params.recordId, shopId }, include: { payments: { include: { reversal: true } } } });
    if (!record) throw notFound("Supplier delivery record not found.");
    if (record.status === "cancelled") throw badRequest("Supplier invoice is already cancelled.");
    if (record.payments.some(isActiveSupplierInvoicePayment)) throw badRequest("Active payments must be selected and cancelled before cancelling this invoice.");
    throw badRequest("Use the cancel endpoint with a required cancellation reason.");
  } catch (error) { next(error); }
});

// Older supplier entries are stored as delivery records. Create one payable purchase on demand
// so those credit balances can use the same payment flow as purchase orders.
purchasesRouter.post("/:shopId/supplier-delivery-records/:recordId/payable-purchase", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const record = await prisma.supplierDeliveryRecord.findFirst({
      where: { id: request.params.recordId, shopId },
      include: { supplier: true },
    });
    if (!record) throw notFound("Supplier delivery record not found.");
    if (!record.supplierId || !record.supplier || !record.supplier.isActive) throw badRequest("This legacy supplier record cannot be opened for purchase payment.");
    const legacySupplierId = record.supplierId;

    const purchase = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findFirst({
        where: { shopId, supplierId: legacySupplierId, supplierInvoiceNumber: record.invoiceNumber },
        include: purchaseInclude,
      });
      if (existing) return existing;

      const count = await tx.purchase.count({ where: { shopId } });
      const created = await tx.purchase.create({
        data: {
          shopId,
          supplierId: legacySupplierId,
          purchaseNumber: `SUP-${String(count + 1).padStart(5, "0")}`,
          supplierInvoiceNumber: record.invoiceNumber,
          status: "received",
          paymentStatus: "unpaid",
          orderedAt: record.receivedAt,
          expectedAt: record.dueAt,
          receivedAt: record.receivedAt,
          total: record.amount,
          notes: "Created from supplier delivery record.",
        },
        include: purchaseInclude,
      });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "purchase.create_from_supplier_delivery", entity: "Purchase", entityId: created.id, metadata: { deliveryRecordId: record.id } });
      return created;
    });
    response.status(201).json({ purchase });
  } catch (error) { next(error); }
});

purchasesRouter.delete("/:shopId/suppliers/:supplierId", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const supplier = await prisma.supplier.findFirst({ where: { id: request.params.supplierId, shopId } });
    if (!supplier) throw notFound("Supplier not found.");
    const deleted = await prisma.$transaction(async (tx) => {
      const paymentCount = await tx.purchasePayment.count({ where: { purchase: { supplierId: supplier.id, shopId } } });
      if (paymentCount > 0) throw badRequest("Suppliers with payment records cannot be deleted.");
      await tx.purchase.deleteMany({ where: { shopId, supplierId: supplier.id } });
      await tx.supplier.delete({ where: { id: supplier.id } });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "supplier.delete", entity: "Supplier", entityId: supplier.id, metadata: { name: supplier.name } });
      return supplier;
    });
    response.json({ supplier: deleted, deleted: true });
  } catch (error) { next(error); }
});

purchasesRouter.get("/:shopId/purchases", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const query = listQuery.parse(request.query);
    const where = {
      shopId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { purchaseNumber: { contains: query.search, mode: "insensitive" as const } },
        { supplier: { name: { contains: query.search, mode: "insensitive" as const } } },
      ] } : {}),
    };
    const [purchases, total] = await prisma.$transaction([
      prisma.purchase.findMany({ where, include: purchaseInclude, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.purchase.count({ where }),
    ]);
    response.json({
      purchases,
      totalCount: total,
      pagination: { page: query.page, pageSize: query.pageSize, total },
    });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = purchaseInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, shopId, isActive: true } });
    if (!supplier) throw notFound("Active supplier not found.");
    const products = await prisma.product.findMany({
      where: { shopId, id: { in: input.items.map((item) => item.productId) } },
      include: { units: { include: { unit: true } }, variants: { select: { id: true } } },
    });
    if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw badRequest("A purchase product does not belong to this shop.");
    const preparedItems = input.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId)!;
      if (item.variantId && !product.variants.some((variant) => variant.id === item.variantId)) {
        throw badRequest(`The selected variant for ${product.name} does not belong to this product.`);
      }
      const productUnit = item.unitId
        ? product.units.find((candidate) => candidate.unitId === item.unitId && candidate.canPurchase)
        : product.units.find((candidate) => candidate.isBase && candidate.canPurchase);
      if (item.unitId && !productUnit) throw badRequest(`The selected purchase unit is unavailable for ${product.name}.`);
      const rawEnteredQuantity = new Prisma.Decimal(item.quantity);
      const enteredQuantity = quantityDecimal(rawEnteredQuantity);
      const precision = productUnit?.unit.precision ?? 0;
      if (rawEnteredQuantity.decimalPlaces() > precision) {
        throw badRequest(`${product.name} allows at most ${precision} decimal places for this unit.`);
      }
      const conversionFactor = new Prisma.Decimal(productUnit?.conversionFactor ?? 1).toDecimalPlaces(
        6,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const baseQuantity = enteredQuantity.times(conversionFactor).toDecimalPlaces(
        QUANTITY_SCALE,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (product.trackingMode === "SERIAL" && !baseQuantity.isInteger()) {
        throw badRequest(`Serial-tracked ${product.name} requires an integer base quantity.`);
      }
      const lineTotal = moneyFromDecimal(enteredQuantity.times(item.unitCost));
      return { ...item, product, productUnit, enteredQuantity, conversionFactor, baseQuantity, lineTotal };
    });
    const subtotal = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const sequence = await prisma.purchase.count({ where: { shopId } });
    const purchaseNumber = `PO-${String(sequence + 1).padStart(5, "0")}`;
    const purchase = await prisma.$transaction(async (tx) => {
      if (input.supplierInvoiceNumber) {
        const duplicate = await tx.purchase.findFirst({
          where: { shopId, supplierInvoiceNumber: input.supplierInvoiceNumber },
          select: { id: true },
        });
        if (duplicate) throw badRequest("Supplier invoice number already exists for this shop.");
      }
      const created = await tx.purchase.create({
        data: {
          shopId, supplierId: input.supplierId, purchaseNumber,
          ...(input.supplierInvoiceNumber ? { supplierInvoiceNumber: input.supplierInvoiceNumber } : {}),
          ...(input.senderName ? { senderName: input.senderName } : {}),
          ...(input.senderPhone ? { senderPhone: input.senderPhone } : {}),
          ...(input.receiverName ? { receiverName: input.receiverName } : {}),
          ...(input.orderedAt !== undefined ? { orderedAt: input.orderedAt } : {}),
          ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
          deliveryCost: input.deliveryCost ?? 0, total: subtotal + (input.deliveryCost ?? 0),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          items: { create: preparedItems.map((item) => ({
            productId: item.productId, ...(item.variantId !== undefined ? { variantId: item.variantId } : {}),
            productName: item.product.name,
            quantity: compatibilityQuantity(item.baseQuantity),
            unitCost: item.unitCost,
            plannedUnitCost: item.unitCost,
            ...(item.promotionLabel ? { plannedPromotionLabel: item.promotionLabel } : {}),
            lineTotal: item.lineTotal,
            ...(item.productUnit ? { unitId: item.productUnit.unitId } : {}),
            enteredQuantity: item.enteredQuantity,
            conversionFactor: item.conversionFactor,
            baseQuantity: item.baseQuantity,
          })) },
        },
        include: purchaseInclude,
      });
      await Promise.all(preparedItems.map((item) => tx.productSupplier.upsert({
        where: { shopId_productId_supplierId: { shopId, productId: item.productId, supplierId: input.supplierId } },
        create: { shopId, productId: item.productId, supplierId: input.supplierId, lastUnitCost: item.unitCost, lastOrderedAt: input.orderedAt ?? new Date() },
        update: { lastUnitCost: item.unitCost, lastOrderedAt: input.orderedAt ?? new Date() },
      })));
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "purchase.create", entity: "Purchase", entityId: created.id });
      return created;
    });
    response.status(201).json({ purchase });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/send", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const existing = await prisma.purchase.findFirst({ where: { id: request.params.purchaseId, shopId } });
    if (!existing) throw notFound("Purchase not found.");
    if (existing.status !== "draft") throw badRequest("Only draft purchases can be sent.");
    const purchase = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchase.update({ where: { id: existing.id }, data: { status: "ordered" }, include: purchaseInclude });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "purchase.send", entity: "Purchase", entityId: existing.id });
      return updated;
    });
    response.json({ purchase });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/receive", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = receiptInput.parse(request.body);
    const idempotencyKey = request.header("Idempotency-Key");
    await assertUserOwnsShop(auth.id, shopId);
    if (idempotencyKey) {
      const firstItem = input.items[0]!;
      const duplicate = await prisma.purchaseReceipt.findFirst({
        where: {
          purchaseId: request.params.purchaseId,
          purchaseItemId: firstItem.purchaseItemId,
          idempotencyKey,
        },
      });
      if (duplicate) {
        const existingPurchase = await prisma.purchase.findFirst({
          where: { id: request.params.purchaseId, shopId },
          include: purchaseInclude,
        });
        if (!existingPurchase) throw notFound("Purchase not found.");
        return response.json({ purchase: existingPurchase, duplicate: true });
      }
    }
    const purchase = await prisma.purchase.findFirst({
      where: { id: request.params.purchaseId, shopId },
      include: {
        items: {
          include: { product: { include: { units: { include: { unit: true } } } } },
        },
      },
    });
    if (!purchase) throw notFound("Purchase not found.");
    if (!["ordered", "partially_received"].includes(purchase.status)) throw badRequest("Purchase is not open for receipt.");
    const receiptLines = new Map(input.items.map((item) => [item.purchaseItemId, item]));
    const hasPriceChange = purchase.items.some((line) => {
      const actualUnitCost = receiptLines.get(line.id)?.actualUnitCost;
      return actualUnitCost !== undefined && actualUnitCost !== line.unitCost;
    });
    if (hasPriceChange && !input.confirmPriceChanges) {
      throw badRequest("Received price differs from the ordered price. Confirm the price change first.");
    }
    const quantities = new Map<string, Prisma.Decimal>();
    let defaultLocation = await prisma.inventoryLocation.findFirst({ where: { shopId, type: "SELLABLE", isActive: true } });
    if (!defaultLocation) {
      defaultLocation = await prisma.inventoryLocation.create({
        data: { shopId, name: "Main stock", type: "SELLABLE" },
      });
    }
    for (const line of purchase.items) {
      const receiptLine = receiptLines.get(line.id);
      const rawEnteredQuantity = new Prisma.Decimal(receiptLine?.quantity ?? 0);
      const enteredQuantity = quantityDecimal(rawEnteredQuantity);
      const precision = line.product.units.find((entry) => entry.unitId === line.unitId)?.unit.precision ?? 0;
      if (rawEnteredQuantity.decimalPlaces() > precision) {
        throw badRequest(`${line.productName} allows at most ${precision} decimal places for this unit.`);
      }
      const conversionFactor = new Prisma.Decimal(line.conversionFactor ?? 1);
      const quantity = enteredQuantity.times(conversionFactor).toDecimalPlaces(
        QUANTITY_SCALE,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      quantities.set(line.id, quantity);
      const remaining = purchaseItemBaseQuantity(line).minus(receivedItemBaseQuantity(line));
      if (quantity.greaterThan(remaining)) throw badRequest(`Received quantity exceeds remaining quantity for ${line.productName}.`);
      if (!quantity.greaterThan(0)) continue;
      const locationId = receiptLine?.locationId || defaultLocation?.id;
      if (!locationId) throw badRequest(`A receiving location is required for ${line.productName}.`);
      const location = await prisma.inventoryLocation.findFirst({ where: { id: locationId, shopId, isActive: true } });
      if (!location) throw badRequest(`Receiving location is invalid for ${line.productName}.`);
      const capabilities = (line.product.capabilities || {}) as Record<string, boolean>;
      const usesLots = line.product.trackingMode === "LOT";
      const requiresExpiry = capabilities["inventory.expiry"] === true;
      if (usesLots && !receiptLine?.lot) throw badRequest(`Lot details are required for ${line.productName}.`);
      if (requiresExpiry && !receiptLine?.lot?.expiresAt) throw badRequest(`Expiry date is required for ${line.productName}.`);
      if (!usesLots && receiptLine?.lot) throw badRequest(`Lot details are not supported for ${line.productName}.`);
      if (receiptLine?.lot?.expiresAt && receiptLine.lot.expiresAt <= new Date() && location.type !== "QUARANTINE") {
        throw badRequest(`Expired ${line.productName} can only be received into quarantine.`);
      }
      if (location.type === "QUARANTINE" && !input.note) {
        throw badRequest("A reason note is required for quarantine receiving.");
      }
      if (line.product.trackingMode === "SERIAL" && receiptLine?.serials?.length !== quantity.toNumber()) {
        throw badRequest(`Exact serial details are required for every received ${line.productName}.`);
      }
      if (line.product.trackingMode !== "SERIAL" && receiptLine?.serials?.length) {
        throw badRequest(`Serial details are not supported for ${line.productName}.`);
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      for (const line of purchase.items) {
        const quantity = quantities.get(line.id) ?? quantityDecimal(0);
        if (!quantity.greaterThan(0)) continue;
        const receiptLine = receiptLines.get(line.id)!;
        if (receiptLine.actualUnitCost !== undefined && receiptLine.actualUnitCost !== line.unitCost) {
          await tx.purchaseItem.update({
            where: { id: line.id },
            data: { unitCost: receiptLine.actualUnitCost, lineTotal: moneyFromDecimal(new Prisma.Decimal(line.enteredQuantity ?? line.quantity).times(receiptLine.actualUnitCost)) },
          });
        }
        const locationId = receiptLine.locationId || defaultLocation!.id;
        const conversionFactor = new Prisma.Decimal(line.conversionFactor ?? 1);
        const baseUnitCost = moneyFromDecimal(new Prisma.Decimal(line.unitCost).dividedBy(conversionFactor));
        const batch = await tx.inventoryBatch.create({ data: {
          shopId, productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}),
          quantity: compatibilityQuantity(quantity),
          baseQuantity: quantity,
          unitCost: baseUnitCost,
          ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
          note: `Received from ${purchase.purchaseNumber}`,
        } });
        await tx.purchaseItem.update({
          where: { id: line.id },
          data: {
            receivedQuantity: { increment: compatibilityQuantity(quantity) },
            receivedBaseQuantity: { increment: quantity },
          },
        });
        const receipt = await tx.purchaseReceipt.create({ data: {
          purchaseId: purchase.id,
          purchaseItemId: line.id,
          inventoryBatchId: batch.id,
          quantity: compatibilityQuantity(quantity),
          baseQuantity: quantity,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        } });
        let lotId: string | undefined;
        if (receiptLine.lot) {
          const lot = await tx.inventoryLot.create({ data: {
            shopId, productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}),
            locationId, inventoryBatchId: batch.id, lotNumber: receiptLine.lot.lotNumber,
            quantity, unitCost: baseUnitCost,
            ...(receiptLine.lot.expiresAt ? { expiresAt: receiptLine.lot.expiresAt } : {}),
          } });
          lotId = lot.id;
        }
        for (const serial of receiptLine.serials || []) {
          await tx.inventorySerial.create({ data: {
            shopId, productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}),
            locationId, serial: serial.serial, ...(serial.imei ? { imei: serial.imei } : {}),
          } });
        }
        const movement = await recordInventoryMovement(tx, {
          shopId, productId: line.productId, variantId: line.variantId,
          inventoryBatchId: batch.id, type: "PURCHASE_RECEIPT", direction: "IN",
          locationId,
          quantity: quantity.toString(), unitCost: baseUnitCost, sourceType: "PurchaseReceipt", sourceId: receipt.id,
          ...(line.unitId ? { unitId: line.unitId, enteredQuantity: receiptLine.quantity, conversionFactor: conversionFactor.toString() } : {}),
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:${line.id}` : `purchase.receive:${receipt.id}`,
          ...(input.note ? { reason: input.note } : {}),
          ...(input.receivedAt ? { occurredAt: input.receivedAt } : {}),
        });
        const averageCost = await refreshProductWeightedCost(tx, shopId, line.productId);
        if (movement) await tx.inventoryMovement.update({ where: { id: movement.id }, data: { ...(lotId ? { lotId } : {}), averageCostAfter: averageCost } });
      }
      const fullyReceived = purchase.items.every((line) =>
        receivedItemBaseQuantity(line)
          .plus(quantities.get(line.id) ?? 0)
          .greaterThanOrEqualTo(purchaseItemBaseQuantity(line)),
      );
      const status = fullyReceived ? "received" : "partially_received";
      const currentItems = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id } });
      const total = currentItems.reduce((sum, item) => sum + item.lineTotal, 0) + purchase.deliveryCost;
      await writeAuditLog(tx, {
        shopId, actorId: auth.id, action: "purchase.receive", entity: "Purchase", entityId: purchase.id,
        metadata: { items: input.items, note: input.note, receivedAt: input.receivedAt },
      });
      return tx.purchase.update({ where: { id: purchase.id }, data: { status, total, ...(status === "received" ? { receivedAt: input.receivedAt ?? new Date() } : {}) }, include: purchaseInclude });
    }, PURCHASE_LIFECYCLE_TRANSACTION_OPTIONS);
    response.json({ purchase: updated, duplicate: false });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/payments", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = paymentInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const purchase = await prisma.purchase.findFirst({ where: { id: request.params.purchaseId, shopId } });
    if (!purchase) throw notFound("Purchase not found.");
    if (purchase.paidAmount + input.amount > purchase.total) throw badRequest("Payment exceeds outstanding payable.");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.purchasePayment.create({ data: {
        purchaseId: purchase.id, amount: input.amount, method: input.method,
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        ...(input.payerName !== undefined ? { payerName: input.payerName } : {}),
        ...(input.payerPhone !== undefined ? { payerPhone: input.payerPhone } : {}),
        ...(input.signatureDataUrl !== undefined ? { signatureDataUrl: input.signatureDataUrl } : {}),
        ...(input.mobileAccountName !== undefined ? { mobileAccountName: input.mobileAccountName } : {}),
      } });
      const paidAmount = purchase.paidAmount + input.amount;
      await writeAuditLog(tx, {
        shopId, actorId: auth.id, action: "purchase.payment", entity: "Purchase", entityId: purchase.id,
        metadata: { amount: input.amount, method: input.method, reference: input.reference, notes: input.notes, paidAt: input.paidAt },
      });
      return tx.purchase.update({ where: { id: purchase.id }, data: { paidAmount, paymentStatus: paidAmount === purchase.total ? "paid" : "partial" }, include: purchaseInclude });
    });
    response.status(201).json({ purchase: updated });
  } catch (error) { next(error); }
});

purchasesRouter.get("/:shopId/product-suppliers", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    await assertUserOwnsShop(auth.id, shopId);
    const productSuppliers = await prisma.productSupplier.findMany({
      where: { shopId }, include: { supplier: true }, orderBy: { updatedAt: "desc" },
    });
    response.json({ productSuppliers });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/product-suppliers", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = productSupplierInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const [product, supplier] = await Promise.all([
      prisma.product.findFirst({ where: { id: input.productId, shopId } }),
      prisma.supplier.findFirst({ where: { id: input.supplierId, shopId, isActive: true } }),
    ]);
    if (!product || !supplier) throw badRequest("Product or supplier is invalid.");
    const productSupplier = await prisma.productSupplier.upsert({
      where: { shopId_productId_supplierId: { shopId, productId: input.productId, supplierId: input.supplierId } },
      create: {
        shopId, productId: input.productId, supplierId: input.supplierId, lastOrderedAt: new Date(),
        ...(input.lastUnitCost !== undefined ? { lastUnitCost: input.lastUnitCost } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      update: { ...(input.lastUnitCost !== undefined ? { lastUnitCost: input.lastUnitCost } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), lastOrderedAt: new Date() },
      include: { supplier: true },
    });
    response.status(201).json({ productSupplier });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/cancel", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = cancelInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const purchase = await prisma.purchase.findFirst({ where: { id: request.params.purchaseId, shopId } });
    if (!purchase) throw notFound("Purchase not found.");
    if (purchase.paidAmount > 0) throw badRequest("A purchase with payments cannot be cancelled.");
    if (purchase.status === "received" || purchase.status === "partially_received") throw badRequest("A received purchase cannot be cancelled.");
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "cancelled", cancelledAt: new Date(), cancelReason: input.reason, cancelApprovedBy: input.approver },
        include: purchaseInclude,
      });
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "purchase.cancel", entity: "Purchase", entityId: purchase.id, metadata: input });
      return result;
    }, PURCHASE_LIFECYCLE_TRANSACTION_OPTIONS);
    response.json({ purchase: updated });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/payments/:paymentId/reverse", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = reversalInput.parse(request.body);
    const authorization = await authorizeSensitiveAction({ requesterId: auth.id, shopId, action: "supplier.payment.reverse", targetId: request.params.paymentId!, payload: { purchaseId: request.params.purchaseId!, paymentId: request.params.paymentId!, ...input }, approvalToken: approvalAccessToken(request.headers) });
    await assertUserOwnsShop(auth.id, shopId);
    const purchase = await prisma.purchase.findFirst({ where: { id: request.params.purchaseId, shopId } });
    if (!purchase) throw notFound("Purchase not found.");
    const payment = await prisma.purchasePayment.findFirst({ where: { id: request.params.paymentId, purchaseId: purchase.id } });
    if (!payment) throw notFound("Purchase payment not found.");
    if (payment.reversedAt) throw badRequest("Purchase payment has already been reversed.");
    const updated = await prisma.$transaction(async (tx) => {
      await consumeManagerApproval(tx, authorization);
      await tx.purchasePayment.update({
        where: { id: payment.id },
        data: { reversedAt: new Date(), reversalReason: input.reason },
      });
      const paidAmount = Math.max(0, purchase.paidAmount - payment.amount);
      await writeAuditLog(tx, {
        shopId, actorId: auth.id, action: "purchase.payment.reverse", entity: "Purchase", entityId: purchase.id,
        metadata: { paymentId: payment.id, amount: payment.amount, reason: input.reason, ...approvalAuditMetadata(authorization) },
      });
      return tx.purchase.update({
        where: { id: purchase.id },
        data: { paidAmount, paymentStatus: paidAmount === 0 ? "unpaid" : "partial" },
        include: purchaseInclude,
      });
    });
    response.status(201).json({ purchase: updated });
  } catch (error) { next(error); }
});

purchasesRouter.post("/:shopId/purchases/:purchaseId/returns", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const input = returnInput.parse(request.body);
    await assertUserOwnsShop(auth.id, shopId);
    const purchase = await prisma.purchase.findFirst({ where: { id: request.params.purchaseId, shopId } });
    if (!purchase) throw notFound("Purchase not found.");
    const receipt = await prisma.purchaseReceipt.findFirst({
      where: { id: input.purchaseReceiptId, purchaseId: purchase.id },
      include: { purchaseItem: true, inventoryBatch: true },
    });
    if (!receipt) throw notFound("Purchase receipt not found.");
    const returnQuantity = quantityDecimal(input.quantity);
    const alreadyReturned = await prisma.purchaseReturn.aggregate({
      where: { inventoryBatchId: receipt.inventoryBatchId },
      _sum: { baseQuantity: true },
    });
    const receiptQuantity = quantityDecimal(receipt.baseQuantity ?? receipt.quantity);
    if (returnQuantity.greaterThan(receiptQuantity.minus(alreadyReturned._sum.baseQuantity ?? 0))) {
      throw badRequest("Return quantity exceeds the received quantity.");
    }
    const batchQuantity = quantityDecimal(receipt.inventoryBatch.baseQuantity ?? receipt.inventoryBatch.quantity);
    const remainingBatchQuantity = batchQuantity.minus(returnQuantity);
    if (remainingBatchQuantity.lessThan(receipt.inventoryBatch.reservedQuantity)) {
      throw badRequest("Returned stock is reserved by customer orders.");
    }
    const baseUnitCost = receipt.inventoryBatch.unitCost;
    const amount = moneyFromDecimal(returnQuantity.times(baseUnitCost));
    if (purchase.total - amount < purchase.paidAmount) throw badRequest("Refund or void supplier payments before returning these items.");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.inventoryBatch.update({
        where: { id: receipt.inventoryBatchId },
        data: { quantity: compatibilityQuantity(remainingBatchQuantity), baseQuantity: remainingBatchQuantity },
      });
      const remainingReceivedQuantity = receivedItemBaseQuantity(receipt.purchaseItem).minus(returnQuantity);
      await tx.purchaseItem.update({
        where: { id: receipt.purchaseItemId },
        data: {
          receivedQuantity: compatibilityQuantity(remainingReceivedQuantity),
          receivedBaseQuantity: remainingReceivedQuantity,
        },
      });
      await tx.purchaseReturn.create({ data: {
        purchaseId: purchase.id, purchaseItemId: receipt.purchaseItemId, inventoryBatchId: receipt.inventoryBatchId,
        quantity: compatibilityQuantity(returnQuantity), baseQuantity: returnQuantity, amount, reason: input.reason,
        ...(input.returnedAt ? { returnedAt: input.returnedAt } : {}),
      } });
      await recordInventoryMovement(tx, {
        shopId, productId: receipt.purchaseItem.productId, variantId: receipt.purchaseItem.variantId,
        inventoryBatchId: receipt.inventoryBatchId, type: "SUPPLIER_RETURN", direction: "OUT",
        quantity: returnQuantity.toString(), unitCost: baseUnitCost,
        sourceType: "PurchaseReturn", sourceId: purchase.id,
        idempotencyKey: String(request.header("Idempotency-Key") || `purchase.return:${purchase.id}:${receipt.id}:${input.quantity}`),
        reason: input.reason,
        ...(input.returnedAt ? { occurredAt: input.returnedAt } : {}),
      });
      await refreshProductWeightedCost(tx, shopId, receipt.purchaseItem.productId);
      await writeAuditLog(tx, { shopId, actorId: auth.id, action: "purchase.return", entity: "Purchase", entityId: purchase.id, metadata: { quantity: returnQuantity.toString(), amount, reason: input.reason } });
      return tx.purchase.update({ where: { id: purchase.id }, data: { total: { decrement: amount }, status: "partially_returned" }, include: purchaseInclude });
    }, PURCHASE_LIFECYCLE_TRANSACTION_OPTIONS);
    response.status(201).json({ purchase: updated });
  } catch (error) { next(error); }
});
