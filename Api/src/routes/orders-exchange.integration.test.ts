import "dotenv/config";

import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../app.js";
import { assertLocalDatabaseUrl } from "../lib/local-db-guard.js";
import { prisma } from "../lib/prisma.js";

const runIntegration = process.env.RUN_EXCHANGE_INTEGRATION === "1";

describe.runIf(runIntegration)("sale exchange integration", () => {
  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;
  let ownerId = "";
  let cashierId = "";
  let shopId = "";
  let token = "";
  let cashierToken = "";
  let attackerId = "";
  let attackerShopId = "";
  let attackerToken = "";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function api(path: string, options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string>; expected?: number } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (options.expected !== undefined) {
      expect(response.status, JSON.stringify(data)).toBe(options.expected);
    } else {
      expect(response.ok, `${response.status}: ${JSON.stringify(data)}`).toBe(true);
    }
    return data;
  }

  async function register(name: string) {
    return api("/auth/register", {
      method: "POST",
      body: { name, shopName: `${name} Shop ${stamp}`, email: `${name.toLowerCase().replaceAll(" ", "-")}-${stamp}@example.local`, password: "Password123!", currencyCode: "MMK" },
    });
  }

  async function createProduct(name: string, price: number, quantity: number) {
    const result = await api(`/shops/${shopId}/products`, {
      method: "POST",
      token,
      body: { name, sku: `${name.toUpperCase().replaceAll(" ", "-")}-${stamp}`, price, cost: Math.round(price / 2) },
    });
    await api(`/shops/${shopId}/inventory`, {
      method: "POST",
      token,
      body: { productId: result.product.id, quantity, unitCost: Math.round(price / 2), note: "Exchange integration stock" },
    });
    return result.product;
  }

  async function createCompletedSale(productId: string, quantity: number, discount = 0) {
    const created = await api(`/shops/${shopId}/orders`, {
      method: "POST",
      token,
      body: { fulfillmentStatus: "reserved", discount, items: [{ productId, quantity }] },
    });
    await api(`/shops/${shopId}/orders/${created.order.id}/payments`, {
      method: "POST",
      token,
      body: { method: "Cash", amount: created.order.total },
    });
    await api(`/shops/${shopId}/orders/${created.order.id}/status`, {
      method: "PATCH",
      token,
      body: { fulfillmentStatus: "completed" },
    });
    return created.order;
  }

  function exchangeBody(order: { items: Array<{ id: string }> }, returnQuantity: number, replacementProductId: string, replacementQuantity = 1) {
    return {
      reason: "Customer requested exchange",
      paymentMethod: "Cash",
      returnedItems: [{ orderItemId: order.items[0]!.id, quantity: returnQuantity, condition: "SELLABLE", reason: "Customer requested exchange" }],
      replacementItems: [{ productId: replacementProductId, quantity: replacementQuantity, deductionType: "discount", modifierOptionIds: [] }],
    };
  }

  async function exchange(order: { id: string }, body: unknown, key: string, requestToken = token, approvalToken?: string, expected?: number) {
    return api(`/shops/${shopId}/orders/${order.id}/exchanges`, {
      method: "POST",
      token: requestToken,
      headers: { "Idempotency-Key": key, ...(approvalToken ? { "x-manager-approval": approvalToken } : {}) },
      body,
      ...(expected ? { expected } : {}),
    });
  }

  beforeAll(async () => {
    assertLocalDatabaseUrl();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const owner = await register("Exchange Owner");
    ownerId = owner.user.id;
    shopId = owner.shop.id;
    token = owner.accessToken;

    const cashierPassword = await bcrypt.hash("Password123!", 12);
    const cashier = await prisma.user.create({ data: { name: "Exchange Cashier", email: `cashier-${stamp}@example.local`, password: cashierPassword } });
    cashierId = cashier.id;
    await prisma.shopMember.create({ data: { shopId, userId: cashierId, role: "CASHIER", active: true } });
    cashierToken = (await api("/auth/login", { method: "POST", body: { email: cashier.email, password: "Password123!" } })).accessToken;
    await api(`/shops/${shopId}/approval-pin`, { method: "PUT", token, body: { pin: "654321" } });

    const attacker = await register("Exchange Attacker");
    attackerId = attacker.user.id;
    attackerShopId = attacker.shop.id;
    attackerToken = attacker.accessToken;
  });

  afterAll(async () => {
    for (const id of [shopId, attackerShopId]) {
      if (!id) continue;
      await prisma.saleExchange.deleteMany({ where: { shopId: id } });
      await prisma.customerReturn.deleteMany({ where: { shopId: id } });
      await prisma.order.deleteMany({ where: { shopId: id } });
      await prisma.inventoryMovement.deleteMany({ where: { shopId: id } });
      await prisma.inventoryReservation.deleteMany({ where: { shopId: id } });
      await prisma.shop.delete({ where: { id } });
    }
    for (const id of [cashierId, ownerId, attackerId]) {
      if (id) await prisma.user.delete({ where: { id } });
    }
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("keeps the original immutable and completes atomic, idempotent, shop-scoped exchanges", async () => {
    const returnedProduct = await createProduct("Historical Product", 50_000, 20);
    const equalProduct = await createProduct("Equal Replacement", 50_000, 5);
    const expensiveProduct = await createProduct("Expensive Replacement", 60_000, 5);
    const cheaperProduct = await createProduct("Cheaper Replacement", 40_000, 5);

    const equalSale = await createCompletedSale(returnedProduct.id, 1);
    const expensiveSale = await createCompletedSale(returnedProduct.id, 1);
    const cheaperSale = await createCompletedSale(returnedProduct.id, 1);
    const multiSale = await createCompletedSale(returnedProduct.id, 2, 20_000);
    const failureSale = await createCompletedSale(returnedProduct.id, 1);
    await prisma.product.update({ where: { id: returnedProduct.id }, data: { price: 250_000 } });

    const originalBefore = await prisma.order.findUniqueOrThrow({ where: { id: expensiveSale.id }, include: { items: true, payments: true } });
    const equal = await exchange(equalSale, exchangeBody(equalSale, 1, equalProduct.id), `equal-${stamp}`);
    expect(equal.returnedValue).toBe(50_000);
    expect(equal.replacementValue).toBe(50_000);
    expect(equal.difference).toBe(0);

    const expensiveBody = exchangeBody(expensiveSale, 1, expensiveProduct.id);
    await exchange(expensiveSale, expensiveBody, `unapproved-${stamp}`, cashierToken, undefined, 403);
    const approval = await api(`/shops/${shopId}/approvals`, {
      method: "POST",
      token: cashierToken,
      body: { approverId: ownerId, pin: "654321", action: "payment.refund", targetId: expensiveSale.id, payload: { orderId: expensiveSale.id, ...expensiveBody }, reason: expensiveBody.reason },
    });
    const expensive = await exchange(expensiveSale, expensiveBody, `expensive-${stamp}`, cashierToken, approval.approvalToken);
    expect(expensive.returnedValue).toBe(50_000);
    expect(expensive.replacementValue).toBe(60_000);
    expect(expensive.difference).toBe(10_000);

    const cheaper = await exchange(cheaperSale, exchangeBody(cheaperSale, 1, cheaperProduct.id), `cheaper-${stamp}`);
    expect(cheaper.difference).toBe(-10_000);
    expect(cheaper.exchange.payments.map((payment: { amount: number; scope: string }) => [payment.scope, payment.amount])).toEqual(expect.arrayContaining([
      ["exchange-return", -50_000],
      ["exchange-credit", 40_000],
    ]));
    const multi = await exchange(multiSale, exchangeBody(multiSale, 2, cheaperProduct.id, 2), `multi-${stamp}`);
    expect(multi.returnedValue).toBe(80_000);
    expect(multi.replacementValue).toBe(80_000);
    expect(multi.difference).toBe(0);

    const originalAfter = await prisma.order.findUniqueOrThrow({ where: { id: expensiveSale.id }, include: { items: true, payments: true } });
    expect({ ...originalAfter, payments: undefined }).toEqual({ ...originalBefore, payments: undefined });
    for (const payment of originalBefore.payments) {
      expect(originalAfter.payments).toContainEqual(payment);
    }
    const linkage = await prisma.saleExchange.findUniqueOrThrow({
      where: { id: expensive.exchange.id },
      include: { originalOrder: true, replacementOrder: true, returns: true, payments: true },
    });
    expect(linkage.originalOrderId).toBe(expensiveSale.id);
    expect(linkage.replacementOrder.fulfillmentStatus).toBe("completed");
    expect(linkage.replacementOrder.paymentStatus).toBe("paid");
    expect(linkage.returns).toHaveLength(1);
    expect(linkage.payments.map((payment) => payment.scope).sort()).toEqual(["exchange-credit", "exchange-difference", "exchange-return"]);
    expect(await prisma.inventoryMovement.count({ where: { sourceType: "CustomerReturn", sourceId: linkage.returns[0]!.id, type: "CUSTOMER_RETURN", direction: "IN" } })).toBe(1);
    const replacementAllocations = await prisma.orderItemAllocation.findMany({ where: { orderItem: { orderId: linkage.replacementOrderId } }, select: { id: true } });
    const replacementMovements = await prisma.inventoryMovement.findMany({ where: { shopId, type: "SALE", direction: "OUT", sourceType: "OrderItemAllocation" }, select: { sourceId: true } });
    expect(replacementMovements.some((movement) => replacementAllocations.some((allocation) => movement.sourceId === allocation.id || movement.sourceId.startsWith(`${allocation.id}:`)))).toBe(true);

    const countsBeforeRetry = {
      exchanges: await prisma.saleExchange.count({ where: { shopId } }),
      returns: await prisma.customerReturn.count({ where: { shopId } }),
      payments: await prisma.payment.count({ where: { shopId } }),
    };
    const duplicate = await exchange(expensiveSale, expensiveBody, `expensive-${stamp}`, cashierToken);
    expect(duplicate.duplicate).toBe(true);
    expect(await prisma.saleExchange.count({ where: { shopId } })).toBe(countsBeforeRetry.exchanges);
    expect(await prisma.customerReturn.count({ where: { shopId } })).toBe(countsBeforeRetry.returns);
    expect(await prisma.payment.count({ where: { shopId } })).toBe(countsBeforeRetry.payments);
    await exchange(expensiveSale, { ...expensiveBody, reason: "Different payload" }, `expensive-${stamp}`, token, undefined, 400);

    const beforeFailure = {
      exchanges: await prisma.saleExchange.count({ where: { shopId } }),
      returns: await prisma.customerReturn.count({ where: { orderId: failureSale.id } }),
      payments: await prisma.payment.count({ where: { orderId: failureSale.id } }),
    };
    await exchange(failureSale, exchangeBody(failureSale, 1, expensiveProduct.id, 999), `failure-${stamp}`, token, undefined, 400);
    expect(await prisma.saleExchange.count({ where: { shopId } })).toBe(beforeFailure.exchanges);
    expect(await prisma.customerReturn.count({ where: { orderId: failureSale.id } })).toBe(beforeFailure.returns);
    expect(await prisma.payment.count({ where: { orderId: failureSale.id } })).toBe(beforeFailure.payments);

    const crossShopBody = exchangeBody(failureSale, 1, equalProduct.id);
    await api(`/shops/${attackerShopId}/orders/${failureSale.id}/exchanges`, {
      method: "POST",
      token: attackerToken,
      headers: { "Idempotency-Key": `cross-shop-${stamp}` },
      body: crossShopBody,
      expected: 400,
    });
    expect(await prisma.saleExchange.count({ where: { originalOrderId: failureSale.id } })).toBe(0);
  }, 60_000);
});
