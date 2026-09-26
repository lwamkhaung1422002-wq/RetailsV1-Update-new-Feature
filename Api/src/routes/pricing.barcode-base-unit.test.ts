import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), price: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { productBarcode: { findFirst: mocks.lookup } } }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../lib/pricing-domain.js", () => ({ resolvePrice: mocks.price }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { pricingRouter } from "./pricing.routes.js";

const app = express();
app.use(pricingRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("single product barcode unit default", () => {
  it("scans the product at one base unit even if an old barcode references a carton", async () => {
    const base = { id: "piece-product-unit", unitId: "piece", isBase: true, canSell: true, unit: { name: "Piece" } };
    mocks.lookup.mockResolvedValue({ id: "barcode-1", productId: "product-1", productUnitId: "carton-product-unit", packageQuantity: "24", product: { id: "product-1", isActive: true, units: [base] }, productUnit: { id: "carton-product-unit" }, variant: null });
    mocks.price.mockResolvedValue({ finalUnitPrice: 1000 });
    const response = await request(app).get("/shop-1/barcode-lookup/ABC123").expect(200);
    expect(response.body).toMatchObject({ known: true, packageQuantity: 1, productUnit: { id: base.id } });
    expect(mocks.price).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ productUnitId: base.id, quantity: expect.anything() }));
    expect(String(mocks.price.mock.calls[0]![2].quantity)).toBe("1");
  });
});
