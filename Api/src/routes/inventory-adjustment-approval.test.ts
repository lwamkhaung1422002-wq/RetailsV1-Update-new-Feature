import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  consume: vi.fn(),
  audit: vi.fn(),
  scopedBatch: vi.fn(),
  transactionBatch: vi.fn(),
  updateBatch: vi.fn(),
  createAdjustment: vi.fn(),
  recordMovement: vi.fn(),
  refreshCost: vi.fn(),
  user: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    inventoryBatch: { findFirst: mocks.scopedBatch },
    user: { findUnique: mocks.user },
    $transaction: async (run: (tx: unknown) => unknown) => run({
      inventoryBatch: { findFirst: mocks.transactionBatch, update: mocks.updateBatch },
      stockAdjustment: { create: mocks.createAdjustment },
      inventoryMovement: { update: vi.fn() },
    }),
  },
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/manager-approval.js", () => ({
  approvalAccessToken: () => "approval-token",
  approvalAuditMetadata: (authorization: { actorRole: string; authorizationMode: string; approvedById?: string; approvedByRole?: string; reason?: string }) => ({
    actorRole: authorization.actorRole,
    authorizationMode: authorization.authorizationMode,
    ...(authorization.approvedById ? { approvedById: authorization.approvedById } : {}),
    ...(authorization.approvedByRole ? { approvedByRole: authorization.approvedByRole } : {}),
    ...(authorization.reason ? { approvalReason: authorization.reason } : {}),
  }),
  authorizeSensitiveAction: mocks.authorize,
  consumeManagerApproval: mocks.consume,
}));
vi.mock("../lib/inventory-domain.js", () => ({ recordInventoryMovement: mocks.recordMovement }));
vi.mock("../lib/costing.js", () => ({ refreshProductWeightedCost: mocks.refreshCost }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "cashier-1", email: "cashier@example.com" }),
}));

import { inventoryRouter } from "./inventory.routes.js";

const app = express();
app.use(express.json());
app.use(inventoryRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(400).json({ message: error.message });
});

const directAuthorization = { actorRole: "OWNER", authorizationMode: "direct" };
const managerAuthorization = {
  actorRole: "CASHIER",
  authorizationMode: "manager-override",
  approvedById: "manager-1",
  approvedByRole: "MANAGER",
  reason: "Approved count correction",
  approvalTokenId: "approval-1",
};

describe("inventory batch adjustment approval metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scopedBatch.mockResolvedValue({ id: "batch-1", productId: "product-1" });
    mocks.transactionBatch.mockResolvedValue({
      id: "batch-1",
      shopId: "shop-1",
      productId: "product-1",
      variantId: null,
      quantity: 10,
      reservedQuantity: 0,
      unitCost: 1_000,
    });
    mocks.updateBatch.mockResolvedValue({ id: "batch-1", quantity: 12, product: {}, variant: null });
    mocks.createAdjustment.mockResolvedValue({ id: "adjustment-1" });
    mocks.recordMovement.mockResolvedValue(null);
    mocks.refreshCost.mockResolvedValue(1_000);
    mocks.user.mockResolvedValue({ name: "Authenticated Cashier" });
  });

  it.each([
    ["direct", directAuthorization],
    ["manager-approved", managerAuthorization],
  ])("persists only StockAdjustment fields for a %s adjustment", async (_label, authorization) => {
    mocks.authorize.mockResolvedValue(authorization);

    await request(app)
      .post("/shop-1/inventory/batch-1/adjustments")
      .send({ action: "ADD", quantity: 2, reason: "Count correction", staffName: "Spoofed Name" })
      .expect(201);

    expect(mocks.createAdjustment).toHaveBeenCalledWith({
      data: {
        shopId: "shop-1",
        productId: "product-1",
        inventoryBatchId: "batch-1",
        action: "ADD",
        quantity: 2,
        beforeQuantity: 10,
        afterQuantity: 12,
        reason: "Count correction",
        staffName: "Authenticated Cashier",
      },
    });
    expect(mocks.consume).toHaveBeenCalledWith(expect.anything(), authorization);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: "stock.adjust",
      targetId: "product-1",
      payload: {
        mode: "batch",
        productId: "product-1",
        inventoryBatchId: "batch-1",
        action: "ADD",
        quantity: 2,
        reason: "Count correction",
      },
    }));
  });

  it("writes manager approval metadata only to the AuditLog", async () => {
    mocks.authorize.mockResolvedValue(managerAuthorization);

    await request(app)
      .post("/shop-1/inventory/batch-1/adjustments")
      .send({ action: "ADD", quantity: 2, reason: "Count correction", staffName: "Spoofed Name" })
      .expect(201);

    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: expect.objectContaining({
        inventoryBatchId: "batch-1",
        actorRole: "CASHIER",
        authorizationMode: "manager-override",
        approvedById: "manager-1",
        approvedByRole: "MANAGER",
        approvalReason: "Approved count correction",
      }),
    }));
    const adjustmentData = mocks.createAdjustment.mock.calls[0]?.[0]?.data;
    expect(adjustmentData).not.toHaveProperty("actorRole");
    expect(adjustmentData).not.toHaveProperty("authorizationMode");
    expect(adjustmentData).not.toHaveProperty("approvedById");
    expect(adjustmentData).not.toHaveProperty("approvedByRole");
    expect(adjustmentData).not.toHaveProperty("approvalReason");
  });

  it("corrects only the selected stock source record and audits the old values", async () => {
    mocks.scopedBatch.mockResolvedValue({ id: "batch-1", supplierName: "Old Supplier", invoiceReference: "OLD-1" });
    mocks.updateBatch.mockResolvedValue({ id: "batch-1", supplierName: "New Supplier", invoiceReference: "NEW-1" });

    await request(app)
      .patch("/shop-1/inventory/batch-1")
      .send({ supplierName: "New Supplier", invoiceReference: "NEW-1" })
      .expect(200);

    expect(mocks.updateBatch).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { supplierName: "New Supplier", invoiceReference: "NEW-1" },
      include: { product: true, variant: true },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "inventory.update",
      entityId: "batch-1",
      metadata: expect.objectContaining({ previousSupplierName: "Old Supplier", previousInvoiceReference: "OLD-1" }),
    }));
  });
});
