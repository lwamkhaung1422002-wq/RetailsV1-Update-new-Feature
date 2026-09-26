import "dotenv/config";

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../app.js";
import { assertLocalDatabaseUrl } from "../lib/local-db-guard.js";
import { prisma } from "../lib/prisma.js";

const runIntegration = process.env.RUN_CREDIT_INTEGRATION === "1";

describe.runIf(runIntegration)("customer credit PostgreSQL concurrency", () => {
  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;
  let ownerId = "";
  let shopId = "";
  let token = "";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function api(path: string, options: { method?: string; body?: unknown } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { status: response.status, data };
  }

  beforeAll(async () => {
    assertLocalDatabaseUrl();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Credit Concurrency Owner",
        shopName: `Credit Concurrency Shop ${stamp}`,
        email: `credit-concurrency-${stamp}@example.local`,
        password: "Password123!",
        currencyCode: "MMK",
      }),
    });
    const registered = await response.json() as { user?: { id: string }; shop?: { id: string }; accessToken?: string };
    expect(response.status, JSON.stringify(registered)).toBe(201);
    ownerId = registered.user!.id;
    shopId = registered.shop!.id;
    token = registered.accessToken!;
  });

  afterAll(async () => {
    try {
      if (shopId) {
        await prisma.order.deleteMany({ where: { shopId } });
        await prisma.inventoryMovement.deleteMany({ where: { shopId } });
        await prisma.inventoryReservation.deleteMany({ where: { shopId } });
        await prisma.shop.delete({ where: { id: shopId } });
      }
      if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    } finally {
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("allows only one of two simultaneous 400,000 unpaid orders against a 500,000 limit", async () => {
    const defaults = await api(`/shops/${shopId}/settings`, { method: "PATCH", body: { defaultCreditLimit: 500_000, defaultPaymentTermsDays: 30 } });
    expect(defaults.status, JSON.stringify(defaults.data)).toBe(200);
    const createdCustomer = await api(`/shops/${shopId}/customers`, { method: "POST", body: { name: "Concurrent Buyer" } });
    expect(createdCustomer.status, JSON.stringify(createdCustomer.data)).toBe(201);
    const customerId = createdCustomer.data.customer.id as string;
    const createdUnit = await api(`/shops/${shopId}/units`, { method: "POST", body: { name: `Credit Piece ${stamp}`, symbol: "pc", precision: 0 } });
    expect(createdUnit.status, JSON.stringify(createdUnit.data)).toBe(201);
    const unitId = createdUnit.data.unit.id as string;
    const createdProduct = await api(`/shops/${shopId}/products`, { method: "POST", body: { name: "Credit Test Product", sku: `CREDIT-${stamp}`, price: 400_000, cost: 200_000, units: [{ unitId, conversionFactor: 1, isBase: true }] } });
    expect(createdProduct.status, JSON.stringify(createdProduct.data)).toBe(201);
    const productId = createdProduct.data.product.id as string;
    const stock = await api(`/shops/${shopId}/inventory`, { method: "POST", body: { productId, quantity: 10, unitCost: 200_000, note: "Credit concurrency test stock" } });
    expect(stock.status, JSON.stringify(stock.data)).toBe(201);

    const orderBody = { customerId, fulfillmentStatus: "reserved", items: [{ productId, quantity: 1 }] };
    const results = await Promise.all([
      api(`/shops/${shopId}/orders`, { method: "POST", body: orderBody }),
      api(`/shops/${shopId}/orders`, { method: "POST", body: orderBody }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(results.find((result) => result.status === 400)?.data.message).toMatch(/Credit limit exceeded/);
    const report = await api(`/shops/${shopId}/customers/${customerId}/credit-report`);
    expect(report.status, JSON.stringify(report.data)).toBe(200);
    expect(report.data.report.outstanding).toBe(400_000);
    expect(await prisma.order.count({ where: { shopId, customerId } })).toBe(1);

    const history = await api(`/shops/${shopId}/customers/${customerId}`);
    expect(history.status).toBe(200);
    expect(history.data.customer.hasHistory).toBe(true);
    const blockedDelete = await api(`/shops/${shopId}/customers/${customerId}`, { method: "DELETE" });
    expect(blockedDelete.status).toBe(409);

    const customCustomer = await api(`/shops/${shopId}/customers`, { method: "POST", body: { name: "Custom Credit Buyer", creditLimitOverride: 750_000, paymentTermsDaysOverride: 45 } });
    expect(customCustomer.status).toBe(201);
    const customId = customCustomer.data.customer.id as string;
    const changedDefaults = await api(`/shops/${shopId}/settings`, { method: "PATCH", body: { defaultCreditLimit: 600_000, defaultPaymentTermsDays: 20 } });
    expect(changedDefaults.status).toBe(200);
    const defaultCustomerAfter = await api(`/shops/${shopId}/customers/${customerId}`);
    const customCustomerAfter = await api(`/shops/${shopId}/customers/${customId}`);
    expect(defaultCustomerAfter.data.customer).toMatchObject({ effectiveCreditLimit: 600_000, effectivePaymentTermsDays: 20 });
    expect(customCustomerAfter.data.customer).toMatchObject({ effectiveCreditLimit: 750_000, effectivePaymentTermsDays: 45, creditLimitOverride: 750_000, paymentTermsDaysOverride: 45, hasHistory: false });
    const deletedNoHistory = await api(`/shops/${shopId}/customers/${customId}`, { method: "DELETE" });
    expect(deletedNoHistory.status).toBe(204);
  }, 60_000);
});
