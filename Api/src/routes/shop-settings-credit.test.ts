import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { shopSetting: { upsert: mocks.upsert, update: mocks.update } } }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { shopSettingsRouter } from "./shop-settings.routes.js";

const app = express();
app.use(express.json());
app.use(shopSettingsRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

beforeEach(() => {
  vi.clearAllMocks();
  const settings = { shopId: "shop-1", defaultCreditLimit: 0, defaultPaymentTermsDays: 30, option1Values: "[]", option2Values: "[]", paymentMethods: "[]" };
  mocks.upsert.mockResolvedValue(settings);
  mocks.update.mockImplementation(async ({ data }) => ({ ...settings, ...data }));
});

it("saves the default credit limit and payment terms in existing shop settings", async () => {
  const result = await request(app).patch("/shop-1/settings").send({ defaultCreditLimit: 2_000_000, defaultPaymentTermsDays: 15 }).expect(200);
  expect(result.body.settings).toMatchObject({ defaultCreditLimit: 2_000_000, defaultPaymentTermsDays: 15 });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ defaultCreditLimit: 2_000_000, defaultPaymentTermsDays: 15 }) }));
});

it("rejects negative limits and terms beyond the supported bound", async () => {
  await request(app).patch("/shop-1/settings").send({ defaultCreditLimit: -1 }).expect(400);
  await request(app).patch("/shop-1/settings").send({ defaultPaymentTermsDays: 3651 }).expect(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
