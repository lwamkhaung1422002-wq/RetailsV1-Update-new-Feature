import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ movements: vi.fn(), returns: vi.fn(), orders: vi.fn(), allocations: vi.fn(), orderItems: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  inventoryMovement: { findMany: mocks.movements }, orderItemAllocation: { findMany: mocks.allocations },
  orderItem: { findMany: mocks.orderItems }, customerReturn: { findMany: mocks.returns }, order: { findMany: mocks.orders },
} }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "owner-1" }) }));

import { inventoryRouter } from "./inventory.routes.js";

const app = express();
app.use(inventoryRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("customer return movement history", () => {
  it("links a CUSTOMER_RETURN movement to its originating sale invoice", async () => {
    mocks.movements.mockResolvedValue([{ id: "movement-1", type: "CUSTOMER_RETURN", direction: "IN", sourceType: "CustomerReturn", sourceId: "return-1", inventoryBatch: null, product: { name: "Coffee", barcodes: [] }, variant: null }]);
    mocks.allocations.mockResolvedValue([]);
    mocks.orderItems.mockResolvedValue([]);
    mocks.returns.mockResolvedValue([{ id: "return-1", orderId: "order-1" }]);
    mocks.orders.mockResolvedValue([{ id: "order-1", orderNumber: "INV-00025" }]);
    const result = await request(app).get("/shop-1/inventory-movements").expect(200);
    expect(result.body.movements[0]).toMatchObject({ type: "CUSTOMER_RETURN", direction: "IN", invoiceNumber: "INV-00025" });
  });
});
