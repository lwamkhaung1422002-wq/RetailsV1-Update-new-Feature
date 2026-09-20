import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReturnRefundDialog from "./ReturnRefundDialog";

const mocks = vi.hoisted(() => ({ returnProducts: vi.fn(), runWithApproval: vi.fn() }));
vi.mock("../hooks/useApiResource", () => ({ usePosApi: () => ({ orders: { returnProducts: mocks.returnProducts } }) }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: mocks.runWithApproval }) }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.returnProducts.mockResolvedValue({ returns: [] });
  mocks.runWithApproval.mockImplementation((_request, action) => action());
});

describe("Return / Refund dialog", () => {
  it("collects return quantity without exposing condition, replacement, or payment fields", () => {
    render(<QueryClientProvider client={new QueryClient()}><ReturnRefundDialog open order={{ id: "order-1", subtotal: 10_000, discount: 0, items: [{ id: "item-1", productName: "Coffee", quantity: 1, lineTotal: 10_000, returns: [], product: { trackingMode: "NONE" } }], payments: [] }} onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Return / Refund" })).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.queryByLabelText("Condition")).toBeNull();
    expect(screen.queryByText("Items to return")).toBeNull();
    expect(screen.queryByText(/eligible refund is returned/i)).toBeNull();
    expect(screen.queryByLabelText(/payment method/i)).toBeNull();
    expect(screen.queryByText(/replacement items/i)).toBeNull();
  });

  it("submits the hidden condition as SELLABLE", async () => {
    const onSaved = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><ReturnRefundDialog open order={{ id: "order-1", orderNumber: "1", subtotal: 10_000, discount: 0, items: [{ id: "item-1", productName: "Coffee", quantity: 1, lineTotal: 10_000, returns: [], product: { trackingMode: "NONE" } }], payments: [] }} onClose={vi.fn()} onSaved={onSaved} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Changed mind" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Return" }));
    await waitFor(() => expect(mocks.returnProducts).toHaveBeenCalledWith(
      "order-1",
      { items: [{ orderItemId: "item-1", quantity: 1, condition: "SELLABLE", reason: "Changed mind" }] },
      expect.any(String),
      undefined,
    ));
  });
});
