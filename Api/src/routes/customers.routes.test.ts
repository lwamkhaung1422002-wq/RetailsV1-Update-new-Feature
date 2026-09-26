import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  shopAccess: vi.fn(),
  shopPermission: vi.fn(),
  permissions: new Set(["sale.create", "price.edit", "settings.manage"]),
  transaction: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  upsertGroup: vi.fn(),
  orderGroupBy: vi.fn(),
  orderFindMany: vi.fn(),
  orderFindFirst: vi.fn(),
  settingsFind: vi.fn(),
  paymentFindMany: vi.fn(),
  customerDelete: vi.fn(),
  lockCustomer: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  $transaction: mocks.transaction,
  customer: {
    findMany: mocks.findMany,
    count: mocks.count,
    create: mocks.create,
    findFirst: mocks.findFirst,
    update: mocks.update,
    delete: mocks.customerDelete,
  },
  order: { groupBy: mocks.orderGroupBy, findMany: mocks.orderFindMany },
  payment: { findMany: mocks.paymentFindMany },
  customerPriceGroup: { upsert: mocks.upsertGroup },
  shopSetting: { findUnique: mocks.settingsFind },
} }));
vi.mock("../lib/shop-access.js", () => ({
  assertUserOwnsShop: mocks.access,
  assertShopAccess: mocks.shopAccess,
  assertShopPermission: mocks.shopPermission,
  hasShopPermission: (access: { permissions: string[] }, permission: string) => access.permissions.includes(permission),
}));
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
    mocks.permissions = new Set(["sale.create", "price.edit", "settings.manage"]);
    mocks.shopAccess.mockImplementation(async () => ({ isOwner: false, permissions: [...mocks.permissions] }));
    mocks.shopPermission.mockImplementation(async (_userId: string, _shopId: string, permission: string) => {
      if (!mocks.permissions.has(permission)) throw Object.assign(new Error("You do not have permission for this action."), { name: "ForbiddenError" });
      return { isOwner: false, permissions: [...mocks.permissions] };
    });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.orderGroupBy.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue([]);
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.upsertGroup.mockResolvedValue({ id: "wholesale-1", shopId: "shop-1", name: "Wholesale", isActive: true });
    mocks.settingsFind.mockResolvedValue({ defaultCreditLimit: 0, defaultPaymentTermsDays: 30 });
    mocks.paymentFindMany.mockResolvedValue([]);
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
      expect.objectContaining({ id: "customer-1", name: "Aye Aye", pricingType: "RETAIL", priceGroupId: null, visitCount: 125, totalAmount: 1_450_000 }),
      expect.objectContaining({ id: "customer-2", name: "Ko Min", pricingType: "RETAIL", priceGroupId: null, visitCount: 0, totalAmount: 0 }),
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
    mocks.permissions = new Set(["sale.create"]);
    const customer = { id: "customer-1", name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" };
    mocks.create.mockResolvedValue(customer);

    const result = await request(app).post("/shop-1/customers").send({ name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" }).expect(201);

    expect(result.body.customer).toMatchObject({ ...customer, pricingType: "RETAIL", priceGroupId: null });
    expect(mocks.create).toHaveBeenCalledWith({ data: { shopId: "shop-1", name: "Aye Aye", phone: "09123", address: "Main Road", city: "Yangon" }, include: { priceGroup: true, _count: { select: { orders: true } } } });
  });

  it("edits a customer within the active shop", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.update.mockResolvedValue({ id: "customer-1", name: "Aye Aye Win", phone: "09456" });

    await request(app).patch("/shop-1/customers/customer-1").send({ name: "Aye Aye Win", phone: "09456", address: "Main Road", city: "Yangon" }).expect(200);

    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "customer-1", shopId: "shop-1" }, select: { id: true } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "customer-1" }, data: { name: "Aye Aye Win", phone: "09456", address: "Main Road", city: "Yangon" }, include: { priceGroup: true, _count: { select: { orders: true } } } });
  });

  it("maps Wholesale to the shop's single system group and Retail back to null", async () => {
    mocks.create.mockResolvedValue({ id: "customer-1", name: "ABC Trading", priceGroupId: "wholesale-1", priceGroup: { name: "Wholesale", isActive: true } });
    const created = await request(app).post("/shop-1/customers").send({ name: "ABC Trading", pricingType: "WHOLESALE" }).expect(201);
    expect(created.body.customer.pricingType).toBe("WHOLESALE");
    expect(created.body.customer.priceGroupId).toBe("wholesale-1");
    expect(mocks.upsertGroup).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId_name: { shopId: "shop-1", name: "Wholesale" } } }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "ABC Trading", shopId: "shop-1", priceGroupId: "wholesale-1" } }));

    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.update.mockResolvedValue({ id: "customer-1", name: "ABC Trading", priceGroupId: null, priceGroup: null });
    const updated = await request(app).patch("/shop-1/customers/customer-1").send({ pricingType: "RETAIL" }).expect(200);
    expect(updated.body.customer.pricingType).toBe("RETAIL");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { priceGroupId: null } }));
  });

  it("exposes effective credit values and a factual report only when requested", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1", shopId: "shop-1", creditLimitOverride: 200_000, paymentTermsDaysOverride: 15 });
    mocks.settingsFind.mockResolvedValue({ defaultCreditLimit: 500_000, defaultPaymentTermsDays: 30 });
    mocks.orderFindMany.mockResolvedValue([]);
    const report = await request(app).get("/shop-1/customers/customer-1/credit-report").expect(200);
    expect(report.body.report).toMatchObject({ effectiveCreditLimit: 200_000, outstanding: 0, availableCredit: 200_000, creditInvoices: 0 });
    expect(mocks.orderFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.paymentFindMany).not.toHaveBeenCalled();

    mocks.create.mockResolvedValue({ id: "customer-2", name: "Cash only", creditLimitOverride: 0, paymentTermsDaysOverride: null });
    const created = await request(app).post("/shop-1/customers").send({ name: "Cash only", creditLimitOverride: 0, paymentTermsDaysOverride: null }).expect(201);
    expect(created.body.customer).toMatchObject({ effectiveCreditLimit: 0, effectivePaymentTermsDays: 30 });
  });

  it.each(["fully paid", "unpaid", "cancelled"])("refuses to delete a customer with %s order history", async (historyType) => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.orderFindFirst.mockResolvedValue({ id: "order-1", paymentStatus: historyType === "fully paid" ? "paid" : "unpaid", cancelledAt: historyType === "cancelled" ? new Date() : null });
    mocks.transaction.mockImplementation((run: (tx: unknown) => unknown) => run({
      $queryRaw: mocks.lockCustomer,
      order: { findFirst: mocks.orderFindFirst },
      customer: { delete: mocks.customerDelete },
    }));
    const result = await request(app).delete("/shop-1/customers/customer-1").expect(400);
    expect(result.body.message).toMatch(/transaction history/);
    expect(mocks.lockCustomer).toHaveBeenCalled();
    expect(mocks.orderFindFirst).toHaveBeenCalledWith({ where: { shopId: "shop-1", customerId: "customer-1" }, select: { id: true } });
    expect(mocks.customerDelete).not.toHaveBeenCalled();
  });

  it("deletes a customer without any order history after a transaction recheck", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.transaction.mockImplementation((run: (tx: unknown) => unknown) => run({
      $queryRaw: mocks.lockCustomer,
      order: { findFirst: mocks.orderFindFirst },
      customer: { delete: mocks.customerDelete },
    }));
    await request(app).delete("/shop-1/customers/customer-1").expect(204);
    expect(mocks.orderFindFirst).toHaveBeenCalledOnce();
    expect(mocks.customerDelete).toHaveBeenCalledWith({ where: { id: "customer-1" } });
  });

  it("requires settings.manage for deletion", async () => {
    mocks.permissions = new Set(["sale.create"]);
    await request(app).delete("/shop-1/customers/customer-1").expect(400);
    expect(mocks.customerDelete).not.toHaveBeenCalled();
  });

  it("shows history on list and directly loaded customer detail", async () => {
    mocks.findMany.mockResolvedValue([{ id: "customer-1", name: "Aye Aye", _count: { orders: 1 } }, { id: "customer-2", name: "Su Su", _count: { orders: 0 } }]);
    mocks.count.mockResolvedValue(2);
    const list = await request(app).get("/shop-1/customers").expect(200);
    expect(list.body.customers.map((customer: { hasHistory: boolean }) => customer.hasHistory)).toEqual([true, false]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { priceGroup: true, _count: { select: { orders: true } } } }));
    mocks.findFirst.mockResolvedValue({ id: "customer-1", name: "Aye Aye", _count: { orders: 1 } });
    const detail = await request(app).get("/shop-1/customers/customer-1").expect(200);
    expect(detail.body.customer.hasHistory).toBe(true);
  });

  it("permits sale.create contact editing but protects pricing and credit fields separately", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.update.mockResolvedValue({ id: "customer-1", name: "Updated" });
    mocks.permissions = new Set(["sale.create"]);
    await request(app).patch("/shop-1/customers/customer-1").send({ name: "Updated" }).expect(200);
    await request(app).patch("/shop-1/customers/customer-1").send({ pricingType: "WHOLESALE" }).expect(400);
    await request(app).patch("/shop-1/customers/customer-1").send({ creditLimitOverride: 9_000_000 }).expect(400);
    await request(app).patch("/shop-1/customers/customer-1").send({ paymentTermsDaysOverride: 365 }).expect(400);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("rejects protected fields during customer creation without their permissions", async () => {
    mocks.permissions = new Set(["sale.create"]);
    await request(app).post("/shop-1/customers").send({ name: "New", pricingType: "WHOLESALE" }).expect(400);
    await request(app).post("/shop-1/customers").send({ name: "New", creditLimitOverride: 1_000 }).expect(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows price.edit pricing and settings.manage credit policy mutations", async () => {
    mocks.findFirst.mockResolvedValue({ id: "customer-1" });
    mocks.update.mockResolvedValue({ id: "customer-1", name: "Aye Aye" });
    mocks.permissions = new Set(["price.edit", "settings.manage"]);
    await request(app).patch("/shop-1/customers/customer-1").send({ pricingType: "RETAIL" }).expect(200);
    await request(app).patch("/shop-1/customers/customer-1").send({ creditLimitOverride: 500_000, paymentTermsDaysOverride: 15 }).expect(200);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
