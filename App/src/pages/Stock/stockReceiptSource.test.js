import { describe, expect, it } from "vitest";

import { initialStockReceiptPayload, stockInReceiptPayload, supplierNameOptions } from "./stockReceiptSource";

describe("stock receipt source payloads", () => {
  it("attaches source metadata to a positive initial stock receipt", () => {
    expect(initialStockReceiptPayload({
      productId: "product-1",
      stock: "12",
      cost: "450",
      supplierName: "  Golden Supply  ",
      invoiceReference: "  INV-001  ",
    })).toEqual({
      productId: "product-1",
      quantity: 12,
      unitCost: 450,
      note: "Initial stock created with product.",
      supplierName: "Golden Supply",
      invoiceReference: "INV-001",
    });
  });

  it("creates no receipt payload when initial stock is zero", () => {
    expect(initialStockReceiptPayload({
      productId: "product-1",
      stock: "0",
      cost: "450",
      supplierName: "Golden Supply",
      invoiceReference: "INV-001",
    })).toBeNull();
  });

  it("keeps source fields optional without changing stock quantity or cost", () => {
    expect(stockInReceiptPayload({
      productId: "product-1",
      quantity: "7",
      cost: "600",
      notes: "Stock in",
      supplierName: "",
      invoiceReference: "",
    })).toEqual({ productId: "product-1", quantity: 7, unitCost: 600, note: "Stock in" });
  });

  it("submits source metadata for Stock In", () => {
    expect(stockInReceiptPayload({
      productId: "product-1",
      quantity: "7",
      cost: "600",
      notes: "Stock in",
      supplierName: "Golden Supply",
      invoiceReference: "INV-002",
    })).toMatchObject({ supplierName: "Golden Supply", invoiceReference: "INV-002" });
  });

  it.each([
    ["supplier only", "Golden Supply", "", { supplierName: "Golden Supply" }],
    ["invoice only", "", "INV-003", { invoiceReference: "INV-003" }],
  ])("allows %s source metadata", (_label, supplierName, invoiceReference, expected) => {
    const payload = stockInReceiptPayload({
      productId: "product-1",
      quantity: "3",
      cost: "500",
      notes: "Stock in",
      supplierName,
      invoiceReference,
    });
    expect(payload).toMatchObject(expected);
  });

  it("offers normalized supplier suggestions with the selected product first", () => {
    expect(supplierNameOptions([
      { productId: "other", supplierName: " Other Supplier " },
      { productId: "selected", supplierName: "Golden Supply" },
      { productId: "selected", supplierName: " golden supply " },
      { productId: "other", supplierName: "" },
    ], "selected")).toEqual(["Golden Supply", "Other Supplier"]);
  });
});
