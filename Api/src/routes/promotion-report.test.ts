import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ campaign: vi.fn(), items: vi.fn() }));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    promotionCampaign: { findFirst: mocks.campaign },
    orderItem: { findMany: mocks.items },
  },
}));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { pricingRouter } from "./pricing.routes.js";

const app = express();
app.use(express.json());
app.use(pricingRouter);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ message: error.message });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaign.mockResolvedValue({
    id: "campaign-1",
    name: "September Sale",
    scope: "PRODUCT",
    state: "RUNNING",
    category: null,
    promotions: [{
      id: "promotion-1",
      productId: "product-1",
      name: "September Sale",
      type: "PERCENTAGE",
      value: 10,
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-30T23:59:59.000Z"),
      product: { name: "Rice" },
    }],
  });
  mocks.items.mockResolvedValue([{
    id: "item-1",
    productId: "product-1",
    productName: "Rice",
    promotionId: "promotion-1",
    promotionDiscount: 100,
    enteredQuantity: 2,
    baseQuantity: 2,
    quantity: 2,
    regularUnitPrice: 1_000,
    finalUnitPrice: 900,
    unitPrice: 900,
    unitCost: 600,
    lineTotal: 1_800,
    priceResolvedAt: new Date("2026-09-05T03:00:00.000Z"),
    createdAt: new Date("2026-09-05T03:00:00.000Z"),
    order: {
      id: "order-1",
      orderNumber: "00001",
      subtotal: 1_800,
      discount: 100,
      completedAt: new Date("2026-09-05T03:10:00.000Z"),
      createdAt: new Date("2026-09-05T03:00:00.000Z"),
    },
  }]);
});

it("reports promotion sales, discount, cost, and profit from the order-item snapshot", async () => {
  const result = await request(app)
    .get("/shop-1/promotion-campaigns/campaign-1/report")
    .expect(200);

  expect(mocks.items).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      promotionId: { in: ["promotion-1"] },
      order: { shopId: "shop-1", fulfillmentStatus: "completed", cancelledAt: null },
    }),
  }));
  expect(result.body.summary).toMatchObject({
    orderCount: 1,
    productCount: 1,
    quantitySold: 2,
    regularSales: 2_000,
    promotionDiscount: 200,
    netSales: 1_700,
    costOfGoods: 1_200,
    grossProfit: 500,
    marginPercent: 29.4,
  });
  expect(result.body.products[0]).toMatchObject({
    productName: "Rice",
    quantitySold: 2,
    promotionDiscount: 200,
    netSales: 1_700,
    grossProfit: 500,
  });
});

it("keeps every promoted product in the report when a product has no sales", async () => {
  mocks.campaign.mockResolvedValue({
    id: "campaign-1",
    name: "September Sale",
    scope: "CATEGORY",
    state: "RUNNING",
    category: { id: "category-1", name: "Food" },
    promotions: [
      {
        id: "promotion-1", productId: "product-1", name: "September Sale", type: "PERCENTAGE", value: 10,
        startsAt: new Date("2026-09-01T00:00:00.000Z"), endsAt: new Date("2026-09-30T23:59:59.000Z"),
        product: { name: "Rice", sku: "RICE-01", barcodes: [{ value: "10001" }] },
      },
      {
        id: "promotion-2", productId: "product-2", name: "September Sale", type: "PERCENTAGE", value: 10,
        startsAt: new Date("2026-09-01T00:00:00.000Z"), endsAt: new Date("2026-09-30T23:59:59.000Z"),
        product: { name: "Sugar", sku: "SUGAR-01", barcodes: [{ value: "10002" }] },
      },
    ],
  });

  const result = await request(app)
    .get("/shop-1/promotion-campaigns/campaign-1/report")
    .expect(200);

  expect(result.body.summary.productCount).toBe(1);
  expect(result.body.products).toHaveLength(2);
  expect(result.body.products).toEqual(expect.arrayContaining([
    expect.objectContaining({ productId: "product-2", productName: "Sugar", sku: "SUGAR-01", barcodes: ["10002"], quantitySold: 0, orderCount: 0 }),
  ]));
});
