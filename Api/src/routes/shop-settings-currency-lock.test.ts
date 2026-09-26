import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertShopAccess: vi.fn() }));

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../lib/shop-access.js", () => ({ assertShopAccess: mocks.assertShopAccess }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { shopSettingsRouter } from "./shop-settings.routes.js";

const app = express();
app.use(express.json());
app.use(shopSettingsRouter);

it("rejects attempts to change a shop base currency after creation", async () => {
  const response = await request(app)
    .patch("/shop-1/settings")
    .send({ currencyCode: "USD" })
    .expect(409);

  expect(mocks.assertShopAccess).toHaveBeenCalledWith("user-1", "shop-1");
  expect(response.body.message).toBe("Shop base currency cannot be changed after the shop is created.");
});
