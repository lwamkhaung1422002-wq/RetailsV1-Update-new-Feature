import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { expenseHistoryRecords, expenseWorklistRecord } from "../lib/expense-payment.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const workspaceAlertsRouter = Router();
const shopParams = z.object({ shopId: z.string().min(1) });
const notificationParams = shopParams.extend({ notificationId: z.string().min(1) });
const dateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const addDays = (key: string, days: number) => { const value = new Date(`${key}T00:00:00+06:30`); value.setUTCDate(value.getUTCDate() + days); return dateKey(value); };

async function syncAlerts(shopId: string) {
  const today = dateKey(); const tomorrow = addDays(today, 1);
  const [purchases, deliveries, products] = await Promise.all([
    prisma.purchase.findMany({ where: { shopId, status: { not: "cancelled" }, paymentStatus: { not: "paid" }, expectedAt: { not: null } }, include: { supplier: true } }),
    prisma.supplierDeliveryRecord.findMany({ where: { shopId }, include: { supplier: true, payments: { where: { reversedAt: null } } } }),
    prisma.product.findMany({ where: { shopId, isActive: true }, include: { balances: true } }),
  ]);
  const candidates: Array<{ type: string; entityId: string; title: string; message: string }> = [];
  for (const purchase of purchases) {
    const due = purchase.expectedAt ? dateKey(purchase.expectedAt) : ""; if (![today, tomorrow].includes(due)) continue;
    candidates.push({ type: due === today ? "SUPPLIER_DUE" : "SUPPLIER_DUE_TOMORROW", entityId: purchase.id, title: due === today ? "Supplier payment due today" : "Supplier payment due tomorrow", message: `${purchase.supplier.name} · ${purchase.purchaseNumber}` });
  }
  for (const record of deliveries) {
    const paid = record.payments.reduce((sum, payment) => sum + payment.amount, 0); const due = record.dueAt ? dateKey(record.dueAt) : ""; if (paid >= record.amount || ![today, tomorrow].includes(due)) continue;
    candidates.push({ type: due === today ? "SUPPLIER_DUE" : "SUPPLIER_DUE_TOMORROW", entityId: record.id, title: due === today ? "Supplier payment due today" : "Supplier payment due tomorrow", message: `${record.supplierName} · ${record.invoiceNumber}` });
  }
  for (const product of products) {
    const stock = product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0);
    if (stock <= product.minimumStock) candidates.push({ type: "LOW_STOCK", entityId: product.id, title: "Low stock alert", message: `${product.name}: ${stock} pcs remaining` });
  }
  await Promise.all(candidates.map((entry) => prisma.notification.upsert({ where: { shopId_type_entityId_dateKey: { shopId, type: entry.type, entityId: entry.entityId, dateKey: today } }, update: { title: entry.title, message: entry.message, resolvedAt: null }, create: { shopId, ...entry, dateKey: today } })));
}

workspaceAlertsRouter.use(requireAuth);
workspaceAlertsRouter.get("/:shopId/notifications", async (request, response, next) => { try { const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId); await syncAlerts(shopId); const notifications = await prisma.notification.findMany({ where: { shopId, resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 50 }); response.json({ notifications }); } catch (error) { next(error); } });
workspaceAlertsRouter.patch("/:shopId/notifications/:notificationId/read", async (request, response, next) => { try { const auth = getAuthUser(request); const { shopId, notificationId } = notificationParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId); const notification = await prisma.notification.updateMany({ where: { id: notificationId, shopId }, data: { readAt: new Date() } }); if (!notification.count) throw Object.assign(new Error("Notification not found."), { name: "NotFoundError" }); response.json({ read: true }); } catch (error) { next(error); } });

workspaceAlertsRouter.get("/:shopId/payment-history", async (request, response, next) => { try {
  const auth = getAuthUser(request); const { shopId } = shopParams.parse(request.params); await assertUserOwnsShop(auth.id, shopId);
  if (request.query.view === "history") {
    const [salePayments, supplierPayments, expenses] = await Promise.all([
      prisma.payment.findMany({ where: { shopId, orderId: { not: null }, type: { in: ["payment", "refund"] }, order: { is: { paymentTracking: true } } }, include: { order: true } }),
      prisma.supplierDeliveryPayment.findMany({ where: { shopId }, include: { deliveryRecord: true, reversal: true } }),
      prisma.expense.findMany({ where: { shopId } }),
    ]);
    const records = [
      ...salePayments.map((payment) => ({ id: payment.id, apiId: payment.orderId, paymentId: payment.id, kind: payment.amount < 0 ? "sale-payment-cancelled" : "sale-payment", name: "Sale", invoice: payment.order?.orderNumber || payment.orderId, status: payment.amount < 0 ? "Cancelled" : "Paid", amount: Math.abs(payment.amount), method: payment.method, occurredAt: payment.paidAt, reason: payment.amount < 0 ? payment.reason || payment.note || "Sale payment cancelled" : undefined })),
      ...supplierPayments.flatMap((payment) => [
        { id: payment.id, apiId: payment.deliveryRecordId, paymentId: payment.id, kind: "supplier-payment", name: payment.deliveryRecord.supplierName, invoice: payment.deliveryRecord.invoiceNumber, status: "Paid", amount: payment.amount, method: payment.method, transactionId: payment.reference || undefined, signatureDataUrl: payment.signatureDataUrl || undefined, signature: payment.payerName || undefined, occurredAt: payment.paidAt },
        ...(payment.reversal || payment.reversedAt ? [{ id: payment.reversal?.id || `legacy-cancel-${payment.id}`, apiId: payment.deliveryRecordId, paymentId: payment.id, kind: "supplier-payment-cancelled", name: payment.deliveryRecord.supplierName, invoice: payment.deliveryRecord.invoiceNumber, status: "Cancelled", amount: payment.amount, method: payment.method, transactionId: payment.reference || undefined, signatureDataUrl: payment.signatureDataUrl || undefined, signature: payment.payerName || undefined, occurredAt: payment.reversal?.reversedAt || payment.reversedAt, reason: payment.reversal?.reason || payment.reversalReason || "Supplier payment cancelled" }] : []),
      ]),
      ...expenses.flatMap(expenseHistoryRecords),
    ].sort((left, right) => Number(new Date(right.occurredAt || 0)) - Number(new Date(left.occurredAt || 0)));
    response.json({ records }); return;
  }
  const [orders, deliveries, expenses] = await Promise.all([
    // The worklist only serializes these fields. Avoid materializing order item,
    // customer, and payment columns that never leave this endpoint.
    prisma.order.findMany({
      where: { shopId, paymentTracking: true },
      select: {
        id: true, orderNumber: true, fulfillmentStatus: true, total: true, createdAt: true,
        customer: { select: { name: true } },
        items: { select: { quantity: true } },
        payments: { select: { id: true, amount: true, method: true, paidAt: true, createdAt: true, originalPaymentId: true } },
      },
    }),
    prisma.supplierDeliveryRecord.findMany({
      where: { shopId },
      select: {
        id: true, supplierId: true, supplierName: true, invoiceNumber: true, amount: true,
        status: true, receivedAt: true, cancelledAt: true, cancelReason: true,
        payments: {
          select: {
            id: true, amount: true, method: true, paidAt: true, reversedAt: true,
            reversal: { select: { id: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { shopId },
      select: { id: true, title: true, category: true, amount: true, method: true, spentAt: true, createdAt: true, cancelledAt: true },
    }),
  ]);
  const latest = <T extends { paidAt?: Date; createdAt?: Date }>(items: T[]) => [...items].sort((a, b) => Number(new Date(b.paidAt ?? b.createdAt ?? 0)) - Number(new Date(a.paidAt ?? a.createdAt ?? 0)))[0];
  const activeOrderPayments = (order: typeof orders[number]) => order.payments.filter((payment) => payment.amount > 0 && !order.payments.some((reversal) => reversal.amount < 0 && reversal.originalPaymentId === payment.id));
  const sales = orders.map((order) => { const payments = activeOrderPayments(order); const paid = payments.reduce((sum, payment) => sum + payment.amount, 0); const remainingAmount = Math.max(0, order.total - paid); const last = latest(payments); const status = order.fulfillmentStatus === "cancelled" ? "Cancel" : paid >= order.total ? "Paid" : paid > 0 ? "Partial" : "Unpaid"; const customerName = (order.customer as { name?: string | null } | null)?.name; return { id: order.orderNumber || order.id, apiId: order.id, kind: "sale", name: "Sale", status, amount: order.total, remainingAmount, method: last?.method || "", occurredAt: last?.paidAt || order.createdAt, buyer: customerName || "Sale", qty: order.items.reduce((sum, item) => sum + item.quantity, 0), hasPaymentRecord: payments.length > 0, activePaymentRecordCount: payments.length, paymentOptions: payments.map((payment) => ({ id: payment.id, amount: payment.amount, method: payment.method || "Cash", paidAt: payment.paidAt || payment.createdAt })) }; });
  const deliveryEntries = deliveries.map((record) => { const payments = record.payments.filter((payment) => !payment.reversedAt && !payment.reversal); const activePaid = payments.reduce((sum, payment) => sum + payment.amount, 0); const remainingAmount = Math.max(0, record.amount - activePaid); const last = latest(payments); const status = record.status === "cancelled" ? "Cancelled" : remainingAmount === 0 ? "Paid" : "Credit"; const activePaymentRecordCount = payments.length; return { id: record.invoiceNumber, apiId: record.id, supplierId: record.supplierId, kind: "supplier-delivery", name: record.supplierName, status, amount: record.amount, activePaid, remainingAmount, activePaymentRecordCount, paymentOptions: payments.map((payment) => ({ id: payment.id, amount: payment.amount, method: payment.method, paidAt: payment.paidAt })), method: last?.method || "", occurredAt: last?.paidAt || record.receivedAt, receivedAt: record.receivedAt, deliveryOnly: true, cancelReason: record.cancelReason, cancelledAt: record.cancelledAt, allowedActions: { pay: status === "Credit" && remainingAmount > 0, edit: status === "Credit" && activePaymentRecordCount === 0, cancelInvoice: status === "Credit" && activePaymentRecordCount === 0, cancelPayment: status !== "Cancelled" && activePaymentRecordCount > 0 } }; });
  const expenseEntries = expenses.map(expenseWorklistRecord);
  response.json({ records: [...sales, ...deliveryEntries, ...expenseEntries].sort((a, b) => Number(new Date(b.occurredAt)) - Number(new Date(a.occurredAt))) });
} catch (error) { next(error); } });
