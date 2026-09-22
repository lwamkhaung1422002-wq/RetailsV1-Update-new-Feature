import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  $transaction: mocks.transaction,
  customer: {
    findMany: mocks.findMany,
    count: mocks.count,
    create: mocks.create,
    findFirst: mocks.findFirst,
    update: mocks.update,
    delete: vi.fn(),
  },
} }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: mocks.access }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { customersRouter } from "./customers.routes.js";

const app = express();
app.use(express.json());
app.use(customersRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("customer routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("lists customers and searches by name and phone", async () => {
    mocks.findMany.mockResolvedValue([{ id: "customer-1", name: "Aye Aye", phone: "09123" }]);
    mocks.count.mockResolvedValue(1);

    const result = await request(app).get("/shop-1/customers?search=aye&sort=name&direction=asc&pageSize=100").expect(200);

    expect(result.body.customers).toHaveLength(1);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shopId: "shop-1",
        OR: expect.arrayContaining([
          { name: { contains: "aye", mode: "insensitive" } },
          { phone: { contains: "aye", mode: "insensitive" } },
        ]),
      }),
    }));
  });

  it("creates a customer with the supported contact fields", async () => {
    const customer = { id: "customer-1", name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" };
    mocks.create.mockResolvedValue(customer);

    const result = await request(app).post("/shop-1/customers").send({ name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" }).expect(201);

    expect(result.body.customer).toEqual(customer);
    expect(mocks.create).toHaveBeenCalledWith({ data: { shopId: "shop-1", name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" } });
  });

  it("edits a customer within the active shop", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.update.mockResolvedValue({ id: "customer-1", name: "Aye Aye Win", phone: "09456" });

    await request(app).patch("/shop-1/customers/customer-1").send({ name: "Aye Aye Win", phone: "09456", address: "Main Road", city: "Yangon" }).expect(200);

    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "customer-1", shopId: "shop-1" }, select: { id: true } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "customer-1" }, data: { name: "Aye Aye Win", phone: "09456", address: "Main Road", city: "Yangon" } });
  });
});
