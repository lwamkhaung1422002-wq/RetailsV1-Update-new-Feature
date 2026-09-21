import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  records: [],
  api: {
    suppliers: { deliveryRecord: vi.fn(), payDeliveryRecord: vi.fn() },
    shop: { getSettings: vi.fn() },
    expenses: { create: vi.fn(), remove: vi.fn() },
    payments: { addToOrder: vi.fn(), refundOrder: vi.fn() },
    orders: { get: vi.fn(), cancel: vi.fn() },
  },
  invalidateQueries: vi.fn(),
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  usePaymentWorklistQuery: () => ({ data: mocks.records }),
  useShopSettingsQuery: () => ({ data: { settings: { paymentMethods: [] } } }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

import PaymentPage from "./PaymentPage";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    media: "(max-width:768px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.records = [{
    recordKey: "supplier-delivery:delivery-1",
    id: "INV-1",
    apiId: "delivery-1",
    supplierId: null,
    name: "Golden",
    amount: 100,
    remainingAmount: 100,
    status: "Credit",
    method: "",
    date: "2026-09-30",
    isoDate: "2026-09-30",
    kind: "supplier-delivery",
    allowedActions: { pay: true, edit: true },
  }];
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { paymentMethods: [] } });
  mocks.api.suppliers.deliveryRecord.mockResolvedValue({ record: { id: "delivery-1", supplierName: "Golden", amount: 100, remaining: 100, payments: [] } });
  mocks.invalidateQueries.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Payment Page local workflows", () => {
  it("opens supplier Record Payment in Payment context without navigating to Suppliers", async () => {
    render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("More actions for Golden"));
    fireEvent.click(screen.getByText("Pay"));
    expect(await screen.findByText("Record Payment")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/payment");
  });

  it("keeps Add Payment as an in-page dialog", () => {
    render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Add Payment" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/payment");
  });
});
