import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ productFind: vi.fn(), promotionFind: vi.fn(), promotionCreate: vi.fn(), lock: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  $transaction: async (run: (tx: unknown) => unknown) => run({
    product: { findFirst: mocks.productFind },
    promotion: { findFirst: mocks.promotionFind, create: mocks.promotionCreate },
    $executeRaw: mocks.lock,
  }),
} }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { pricingRouter } from "./pricing.routes.js";

const app = express();
app.use(express.json());
app.use(pricingRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.productFind.mockResolvedValue({ id: "product-1", shopId: "shop-1", variants: [], units: [] });
  mocks.promotionFind.mockResolvedValue(null);
  mocks.promotionCreate.mockImplementation(async ({ data }) => ({ id: "promo-1", ...data }));
});

it("stores Wholesale as audience without overloading channel or exposing a custom group", async () => {
  const result = await request(app).post("/shop-1/promotions").send({
    name: "Wholesale weekend", productId: "product-1", type: "PERCENTAGE", value: 10,
    audienceType: "WHOLESALE", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T00:00:00.000Z", state: "SCHEDULED",
  }).expect(201);
  expect(result.body.promotion).toMatchObject({ audienceType: "WHOLESALE", channel: "ALL" });
  expect(mocks.promotionFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ audienceType: { in: ["ALL", "WHOLESALE"] } }) }));
  expect(mocks.promotionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ audienceType: "WHOLESALE", channel: "ALL" }) }));
});
