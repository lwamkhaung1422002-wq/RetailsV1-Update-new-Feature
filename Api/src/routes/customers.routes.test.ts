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
  orderGroupBy: vi.fn(),
  orderFindMany: vi.fn(),
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
  order: { groupBy: mocks.orderGroupBy, findMany: mocks.orderFindMany },
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
    mocks.orderGroupBy.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue([]);
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
    expect(mocks.orderGroupBy).not.toHaveBeenCalled();
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });

  it("returns completed visit counts and effective amounts from all saved orders only when requested", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "customer-1", name: "Aye Aye" },
      { id: "customer-2", name: "Ko Min" },
    ]);
    mocks.count.mockResolvedValue(2);
    mocks.orderGroupBy.mockResolvedValue([
      { customerId: "customer-1", _count: { _all: 125 }, _sum: { total: 1_500_000 } },
    ]);
    mocks.orderFindMany.mockResolvedValue([{
      customerId: "customer-1", total: 100_000, subtotal: 100_000, discount: 0, deliveryFee: 0,
      items: [{ id: "item-1", quantity: 2, baseQuantity: null, lineTotal: 100_000, returns: [{ quantity: 1 }] }],
    }]);

    const result = await request(app).get("/shop-1/customers?includeStats=true&pageSize=25").expect(200);

    expect(result.body.customers).toEqual([
      { id: "customer-1", name: "Aye Aye", visitCount: 125, totalAmount: 1_450_000 },
      { id: "customer-2", name: "Ko Min", visitCount: 0, totalAmount: 0 },
    ]);
    expect(mocks.orderGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { shopId: "shop-1", customerId: { in: ["customer-1", "customer-2"] }, fulfillmentStatus: "completed", cancelledAt: null },
    }));
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ fulfillmentStatus: "completed", cancelledAt: null, items: { some: { returns: { some: {} } } } }),
    }));
    expect(mocks.orderGroupBy.mock.calls).toHaveLength(1);
    expect(mocks.orderFindMany.mock.calls).toHaveLength(1);
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
