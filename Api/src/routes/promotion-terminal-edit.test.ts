import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFind: vi.fn(),
  campaignUpdate: vi.fn(),
  promotionUpdateMany: vi.fn(),
  promotionUpdate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) => run({
      promotionCampaign: { findFirst: mocks.campaignFind, update: mocks.campaignUpdate },
      promotion: { updateMany: mocks.promotionUpdateMany, update: mocks.promotionUpdate },
    }),
  },
}));
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
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.name === "ConflictError" ? 409 : 400).json({ message: error.message });
});

const campaign = (overrides = {}) => ({
  id: "campaign-1",
  shopId: "shop-1",
  name: "Sale",
  state: "SCHEDULED",
  version: 1,
  promotions: [{
    id: "promotion-1",
    productId: "product-1",
    state: "SCHEDULED",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-31T00:00:00.000Z"),
    type: "PERCENTAGE",
    value: 10,
    reason: null,
  }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaignUpdate.mockResolvedValue({ id: "campaign-1", state: "CANCELLED", version: 2 });
  mocks.promotionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("promotion terminal edit protection", () => {
  it("rejects editing an effectively ended campaign", async () => {
    mocks.campaignFind.mockResolvedValue(campaign());
    const result = await request(app).patch("/shop-1/promotion-campaigns/campaign-1").send({ expectedVersion: 1, name: "Changed" });
    expect(result.status).toBe(409);
    expect(result.body.message).toMatch(/cannot be edited/i);
    expect(mocks.promotionUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects editing an already cancelled campaign", async () => {
    mocks.campaignFind.mockResolvedValue(campaign({ state: "CANCELLED", promotions: [{ ...campaign().promotions[0], state: "CANCELLED" }] }));
    await request(app).patch("/shop-1/promotion-campaigns/campaign-1").send({ expectedVersion: 1, name: "Changed" }).expect(409);
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });

  it("still allows an active campaign to transition to cancelled", async () => {
    mocks.campaignFind.mockResolvedValue(campaign({
      promotions: [{ ...campaign().promotions[0], startsAt: new Date("2026-09-01T00:00:00.000Z"), endsAt: new Date("2099-09-30T00:00:00.000Z") }],
    }));
    await request(app).patch("/shop-1/promotion-campaigns/campaign-1").send({ expectedVersion: 1, state: "CANCELLED", reason: "Campaign complete" }).expect(200);
    expect(mocks.promotionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: "CANCELLED" }) }));
    expect(mocks.campaignUpdate).toHaveBeenCalled();
  });
});
