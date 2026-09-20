import "dotenv/config";

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../app.js";
import { assertLocalDatabaseUrl } from "../lib/local-db-guard.js";
import { prisma } from "../lib/prisma.js";

const runIntegration = process.env.RUN_EXCHANGE_INTEGRATION === "1";

describe.runIf(runIntegration)("sale exchange integration", () => {
  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;
  let ownerId = "";
  let shopId = "";
  let token = "";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function api(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    expect(response.ok, `${response.status}: ${JSON.stringify(data)}`).toBe(true);
    return data;
  }

  beforeAll(async () => {
    assertLocalDatabaseUrl();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const registered = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Exchange Owner",
        shopName: `Exchange Shop ${stamp}`,
        email: `exchange-owner-${stamp}@example.local`,
        password: "Password123!",
        currencyCode: "MMK",
      }),
    }).then((response) => response.json()) as { user: { id: string }; shop: { id: string }; accessToken: string };
    ownerId = registered.user.id;
    shopId = registered.shop.id;
    token = registered.accessToken;
  });

  afterAll(async () => {
    if (shopId) {
      await prisma.customerReturn.deleteMany({ where: { shopId } });
      await prisma.order.deleteMany({ where: { shopId } });
      await prisma.inventoryMovement.deleteMany({ where: { shopId } });
      await prisma.inventoryReservation.deleteMany({ where: { shopId } });
      await prisma.shop.delete({ where: { id: shopId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("creates only a return/refund and keeps the original order total immutable", async () => {
    const product = (await api(`/shops/${shopId}/products`, {
      method: "POST",
      body: { name: "Exchange Product", sku: `EXCHANGE-${stamp}`, price: 50_000, cost: 20_000 },
    })).product;
    await api(`/shops/${shopId}/inventory`, {
      method: "POST",
      body: { productId: product.id, quantity: 10, unitCost: 20_000, note: "Exchange integration stock" },
    });
    const created = (await api(`/shops/${shopId}/orders`, {
      method: "POST",
      body: {
        fulfillmentStatus: "reserved",
        initialPayment: { method: "Cash", amount: 50_000 },
        items: [{ productId: product.id, quantity: 1 }],
      },
    })).order;
    await api(`/shops/${shopId}/orders/${created.id}/status`, {
      method: "PATCH",
      body: { fulfillmentStatus: "completed" },
    });
    const beforeOrderCount = await prisma.order.count({ where: { shopId } });
    const body = {
      reason: "Wrong size",
      paymentMethod: "KPay",
      returnedItems: [{ orderItemId: created.items[0].id, quantity: 1, condition: "SELLABLE", reason: "Wrong size" }],
      replacementItems: [{ productId: product.id, quantity: 1 }],
    };
    const result = await api(`/shops/${shopId}/orders/${created.id}/exchanges`, {
      method: "POST",
      headers: { "Idempotency-Key": `exchange-${stamp}` },
      body,
    });

    expect(result).toMatchObject({ returnedValue: 50_000, refundedAmount: 50_000, duplicate: false });
    expect(result.exchange).toBeUndefined();
    expect(await prisma.order.count({ where: { shopId } })).toBe(beforeOrderCount);
    expect(await prisma.saleExchange.count({ where: { shopId } })).toBe(0);
    const payments = await prisma.payment.findMany({ where: { orderId: created.id } });
    expect(payments.some((payment) => payment.scope === "exchange-return" && payment.amount === -50_000)).toBe(true);
    expect(payments.some((payment) => ["exchange-credit", "exchange-difference"].includes(payment.scope || ""))).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.id } })).total).toBe(50_000);

    const duplicate = await api(`/shops/${shopId}/orders/${created.id}/exchanges`, {
      method: "POST",
      headers: { "Idempotency-Key": `exchange-${stamp}` },
      body,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(await prisma.order.count({ where: { shopId } })).toBe(beforeOrderCount);
  }, 60_000);
});
