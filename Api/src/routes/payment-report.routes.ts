import { Router } from "express";
import { z } from "zod";

import { isFinancialRefund } from "../lib/financial-domain.js";
import { paymentMethodFor, paymentReportMetrics } from "../lib/payment-report.js";
import { prisma } from "../lib/prisma.js";
import { assertShopPermission } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const paymentReportRouter = Router();
paymentReportRouter.use(requireAuth);

const params = z.object({ shopId: z.string().min(1) });
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().min(1).optional(),
  method: z.string().trim().min(1).optional(),
  staffId: z.string().trim().min(1).optional(),
});

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

paymentReportRouter.get("/:shopId/reports/payments", async (request, response, next) => {
  try {
    const auth = getAuthUser(request);
    const { shopId } = params.parse(request.params);
    const query = querySchema.parse(request.query);
    const targetShopId = query.branchId ?? shopId;
    await assertShopPermission(auth.id, targetShopId, "report.viewSales");
    const today = dateKey();
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? today;
    const paidAt = { gte: new Date(`${from}T00:00:00.000+06:30`), lte: new Date(`${to}T23:59:59.999+06:30`) };
    const [shop, allPayments, periodPayments, audits, orders] = await Promise.all([
      prisma.shop.findUniqueOrThrow({ where: { id: targetShopId }, select: { id: true, name: true } }),
      prisma.payment.findMany({ where: { shopId: targetShopId }, select: { id: true, method: true, amount: true, type: true, scope: true, originalPaymentId: true } }),
      prisma.payment.findMany({ where: { shopId: targetShopId, paidAt }, orderBy: { paidAt: "desc" } }),
      prisma.auditLog.findMany({ where: { shopId: targetShopId, entity: "Payment", createdAt: paidAt }, orderBy: { createdAt: "desc" } }),
      prisma.order.findMany({ where: { shopId: targetShopId, fulfillmentStatus: "completed" }, select: { id: true, total: true, completedAt: true, items: { select: { recognizedAt: true } }, payments: { select: { amount: true, type: true, scope: true } } } }),
    ]);
    const byId = new Map(allPayments.map((payment) => [payment.id, payment]));
    const auditByPayment = new Map<string, typeof audits[number]>();
    for (const audit of audits) if (audit.entityId && !auditByPayment.has(audit.entityId)) auditByPayment.set(audit.entityId, audit);
    const actorIds = [...new Set(audits.flatMap((audit) => [audit.actorId, typeof audit.metadata === "object" && audit.metadata !== null && "approvedById" in audit.metadata ? String(audit.metadata.approvedById) : null]).filter((id): id is string => Boolean(id)))];
    const users = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const attributed = periodPayments.map((payment) => ({ payment, audit: auditByPayment.get(payment.id) }));
    const staffFiltered = attributed.filter(({ audit }) => !query.staffId || (query.staffId === "unassigned" ? !audit?.actorId : audit?.actorId === query.staffId));
    const methodFiltered = staffFiltered.filter(({ payment }) => !query.method || paymentMethodFor(payment, byId) === query.method);
    const selectedPayments = methodFiltered.map(({ payment }) => payment);
    const summary = paymentReportMetrics(selectedPayments);
    const recognizedOrders = orders.filter((order) => {
      const recognizedAt = order.completedAt ?? order.items.map((item) => item.recognizedAt).filter((value): value is Date => Boolean(value)).sort((left, right) => left.getTime() - right.getTime())[0];
      return recognizedAt && recognizedAt >= paidAt.gte && recognizedAt <= paidAt.lte;
    });
    const outstanding = recognizedOrders.reduce((sum, order) => sum + Math.max(0, order.total - order.payments.filter((payment) => payment.scope !== "cod-settlement-void").reduce((paid, payment) => paid + payment.amount, 0)), 0);
    const methods = [...selectedPayments.reduce((groups, payment) => {
      const method = paymentMethodFor(payment, byId);
      const current = groups.get(method) ?? [];
      current.push({ ...payment, method });
      groups.set(method, current);
      return groups;
    }, new Map<string, typeof selectedPayments>()).entries()].map(([method, payments]) => ({ method, ...paymentReportMetrics(payments) })).sort((left, right) => right.netCollected - left.netCollected);
    response.json({
      branch: shop,
      range: { from, to },
      summary: { ...summary, outstanding },
      methods,
      statuses: [
        { status: "Collected", count: selectedPayments.filter((payment) => payment.type === "payment" && payment.scope !== "cod-settlement-void").length, amount: summary.collected },
        { status: "Refunded", count: selectedPayments.filter(isFinancialRefund).length, amount: summary.refunds },
      ],
      staff: users.filter((user) => audits.some((audit) => audit.actorId === user.id)),
      recent: methodFiltered.slice(0, 50).map(({ payment, audit }) => {
        const metadata = typeof audit?.metadata === "object" && audit.metadata !== null ? audit.metadata : {};
        const approvedById = "approvedById" in metadata ? String(metadata.approvedById) : null;
        return { id: payment.id, paidAt: payment.paidAt, method: paymentMethodFor(payment, byId), amount: isFinancialRefund(payment) ? -Math.abs(payment.amount) : payment.amount, type: isFinancialRefund(payment) ? "Refund" : payment.scope === "cod-settlement-void" ? "Void" : "Collection", actor: audit?.actorId ? usersById.get(audit.actorId) ?? { id: audit.actorId, name: "Staff" } : null, approver: approvedById ? usersById.get(approvedById) ?? { id: approvedById, name: "Manager" } : null };
      }),
    });
  } catch (error) { next(error); }
});
