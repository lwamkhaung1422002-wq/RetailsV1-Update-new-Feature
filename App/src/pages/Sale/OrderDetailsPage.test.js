import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createElement } from "react";
import { getOrderReturnSummary } from "./orderSummary";
import { buildReturnActivity } from "../../lib/orderActivity";

const mocks = vi.hoisted(() => ({
  mobile: false,
  api: { shop: { get: vi.fn() } },
  order: null,
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useOrderQuery: () => ({ data: { order: mocks.order, receipt: null }, error: null, isLoading: false, refetch: vi.fn() }),
}));

import OrderDetailsPage from "./OrderDetailsPage";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: mocks.mobile,
    media: "(max-width:768px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.api.shop.get.mockResolvedValue({ shop: { name: "Shop" } });
  mocks.order = {
    id: "order-1",
    orderNumber: "INV-1",
    total: 100,
    subtotal: 100,
    discount: 0,
    effectiveTotal: 100,
    paymentStatus: "paid",
    fulfillmentStatus: "completed",
    createdAt: "2026-09-20T00:00:00.000Z",
    items: [{ id: "item-1", productName: "Coffee", quantity: 1, unitPrice: 100, lineTotal: 100, returns: [] }],
    payments: [],
    returns: [],
    exchanges: [],
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.mobile = false;
});

describe("Order Details return summary", () => {
  it("keeps a non-returned order summary clean", () => {
    expect(getOrderReturnSummary({ total: 90_000, items: [] }, null)).toEqual({
      originalTotal: 90_000,
      effectiveTotal: 90_000,
      returnedSaleValue: 0,
    });
  });

  it("uses returned sale value and the authoritative effective total rather than refund cash", () => {
    const record = {
      total: 90_000,
      effectiveTotal: 60_000,
      payments: [{ amount: -10_000 }],
      items: [{ id: "item-1", quantity: 3, lineTotal: 90_000, returns: [{ quantity: 1 }] }],
    };
    expect(getOrderReturnSummary(record, null)).toEqual({
      originalTotal: 90_000,
      effectiveTotal: 60_000,
      returnedSaleValue: 30_000,
    });
  });

  it("keeps detailed return activity as its own item-level history", () => {
    const activity = buildReturnActivity({
      returns: [{ id: "return-1", orderItemId: "item-1", itemName: "Coffee", quantity: 1, reason: "Damaged" }],
      exchanges: [],
    });
    expect(activity).toEqual([expect.objectContaining({ itemName: "Coffee", quantity: 1, reason: "Damaged" })]);
  });
});

describe("Order Details responsive header", () => {
  it("uses a top-right close control without a back arrow in the embedded desktop dialog content", async () => {
    const onClose = vi.fn();
    render(createElement(MemoryRouter, null, createElement(OrderDetailsPage, { embeddedOrderId: "order-1", embeddedOnClose: onClose, forceMobileLayout: true, hideBackButton: true })));

    expect(await screen.findByLabelText("Close order details")).toBeTruthy();
    expect(screen.queryByLabelText("Back to orders")).toBeNull();
    expect(screen.getByText("Order Summary")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close order details"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing back arrow on the normal mobile page", async () => {
    mocks.mobile = true;
    render(createElement(MemoryRouter, null, createElement(OrderDetailsPage, { embeddedOrderId: "order-1" })));

    expect(await screen.findByLabelText("Back to orders")).toBeTruthy();
    expect(screen.queryByLabelText("Close order details")).toBeNull();
  });
});
