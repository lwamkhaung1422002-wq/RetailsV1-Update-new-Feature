import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1", email: "owner@example.com" }),
}));

import { productsRouter } from "./products.routes.js";

const app = express();
app.use(express.json());
app.use(productsRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("product stock ownership boundary", () => {
  it("rejects stock quantity changes through product metadata editing", async () => {
    const result = await request(app).patch("/shop-1/products/product-1").send({ name: "Coffee", stockQuantity: 12 }).expect(400);
    expect(result.body.message).toBe("Stock quantity must be changed through inventory movements.");
  });
});
