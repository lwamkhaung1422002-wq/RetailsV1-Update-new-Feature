import "dotenv/config";

import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const prefix = process.env.RECONCILE_SHOP_PREFIX?.trim() || "demo-";
  const shops = await prisma.shop.findMany({ where: { id: { startsWith: prefix } }, orderBy: { name: "asc" } });
  let differences = 0;

  for (const shop of shops) {
    const [orders, purchases, expenses, balances] = await Promise.all([
      prisma.order.findMany({ where: { shopId: shop.id }, include: { items: true, payments: true } }),
      prisma.purchase.findMany({ where: { shopId: shop.id }, include: { items: true, payments: true, returns: true } }),
      prisma.expense.findMany({ where: { shopId: shop.id, cancelledAt: null } }),
      prisma.inventoryBalance.findMany({ where: { shopId: shop.id }, include: { product: true, variant: true } }),
    ]);
    const failures: string[] = [];
    for (const order of orders) {
      const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
      const expectedTotal = Math.max(0, subtotal - order.discount + order.deliveryFee);
      if (subtotal !== order.subtotal) failures.push(`${order.id}: subtotal ${order.subtotal} != lines ${subtotal}`);
      if (expectedTotal !== order.total) failures.push(`${order.id}: total ${order.total} != ${expectedTotal}`);
      for (const item of order.items) {
        if (item.unitCost < 0) failures.push(`${item.id}: negative COGS snapshot`);
        if (item.priceResolvedAt && item.finalUnitPrice !== item.unitPrice) failures.push(`${item.id}: final price snapshot mismatch`);
        if (item.promotionDiscount < 0 || item.manualDiscount < 0) failures.push(`${item.id}: negative discount snapshot`);
      }
    }
    for (const purchase of purchases) {
      const activePaid = purchase.payments.filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
      if (activePaid !== purchase.paidAmount) failures.push(`${purchase.id}: paid ${purchase.paidAmount} != active payments ${activePaid}`);
      if (purchase.paidAmount < 0 || purchase.paidAmount > purchase.total) failures.push(`${purchase.id}: invalid paid balance`);
      if (purchase.returns.some((entry) => entry.amount < 0)) failures.push(`${purchase.id}: negative supplier return`);
    }
    const revenue = orders.filter((order) => order.fulfillmentStatus === "completed").reduce((sum, order) => sum + order.total, 0);
    const cogs = orders.filter((order) => order.fulfillmentStatus === "completed").flatMap((order) => order.items).reduce((sum, item) => sum + item.unitCost * Number(item.baseQuantity ?? item.quantity), 0);
    const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const cashReceived = orders.flatMap((order) => order.payments).reduce((sum, payment) => sum + (payment.type === "refund" ? -payment.amount : payment.amount), 0);
    const supplierPaid = purchases.flatMap((purchase) => purchase.payments).filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
    const receivable = orders.reduce((sum, order) => {
      const paid = order.payments.reduce((paymentSum, payment) => paymentSum + (payment.type === "refund" ? -payment.amount : payment.amount), 0);
      return sum + Math.max(0, order.total - paid);
    }, 0);
    const payable = purchases.reduce((sum, purchase) => sum + Math.max(0, purchase.total - purchase.paidAmount - purchase.returns.reduce((returnSum, entry) => returnSum + entry.amount, 0)), 0);
    const inventoryValuation = balances.reduce((sum, balance) => sum + Number(balance.onHand) * Number(balance.variant?.cost ?? balance.product.cost), 0);
    differences += failures.length;
    for (const failure of failures) console.error(`FAIL ${shop.name} ${failure}`);
    console.log(JSON.stringify({
      status: failures.length ? "FAIL" : "PASS", shop: shop.name,
      revenue, cogs, grossProfit: revenue - cogs, operatingExpenses,
      netProfit: revenue - cogs - operatingExpenses, cashReceived, supplierPaid,
      receivable, payable, inventoryValuation,
    }));
  }
  console.log(JSON.stringify({ status: differences ? "FAIL" : "PASS", unexplainedDifferences: differences }));
  if (differences) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
