import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReturnRefundDialog from "./ReturnRefundDialog";

vi.mock("../hooks/useApiResource", () => ({ usePosApi: () => ({ orders: { returnProducts: vi.fn() } }) }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: vi.fn() }) }));

afterEach(cleanup);

describe("Return / Refund dialog", () => {
  it("collects return quantity and condition without replacement or payment method fields", () => {
    render(<QueryClientProvider client={new QueryClient()}><ReturnRefundDialog open order={{ id: "order-1", subtotal: 10_000, discount: 0, items: [{ id: "item-1", productName: "Coffee", quantity: 1, lineTotal: 10_000, returns: [], product: { trackingMode: "NONE" } }], payments: [] }} onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Return / Refund" })).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByLabelText("Condition")).toBeTruthy();
    expect(screen.queryByLabelText(/payment method/i)).toBeNull();
    expect(screen.queryByText(/replacement items/i)).toBeNull();
  });
});
