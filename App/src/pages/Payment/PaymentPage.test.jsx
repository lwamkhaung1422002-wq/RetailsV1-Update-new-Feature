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
vi.mock("../Sale/OrderDetailsPage", () => ({ default: ({ embeddedOrderId }) => <div>Order detail {embeddedOrderId}</div> }));

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
  mocks.api.payments.addToOrder.mockResolvedValue({ payment: { id: "payment-1" } });
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

  it("defaults to Payments and places only active customer sales in Customer Credit", () => {
    mocks.records.push({ recordKey: "sale:order-1", id: "INV-1", apiId: "order-1", kind: "sale", name: "Sale", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true, amount: 1000, remainingAmount: 300, status: "Partial", method: "Cash", dueAt: null, date: "2026-09-20", isoDate: "2026-09-20" });
    mocks.records.push({ recordKey: "sale:order-2", id: "INV-2", apiId: "order-2", kind: "sale", name: "Sale", customerId: "customer-2", customerName: "Settled Shop", paymentTracking: true, amount: 1000, remainingAmount: 0, status: "Paid", date: "2026-09-20", isoDate: "2026-09-20" });
    render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Add Payment" })).toBeTruthy();
    expect(screen.queryByText("ABC Store")).toBeNull();
    expect(screen.getByText("Golden")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Customer Credit" }));
    expect(screen.getByText("ABC Store")).toBeTruthy();
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByText("300 ကျပ်")).toBeTruthy();
    expect(screen.queryByText("Golden")).toBeNull();
    expect(screen.queryByText("Settled Shop")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Payment" })).toBeNull();
  });

  it("collects a partial customer payment through the existing OrderPaymentForm", async () => {
    mocks.records.push({ recordKey: "sale:order-1", id: "INV-1", apiId: "order-1", kind: "sale", name: "Sale", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true, amount: 1000, remainingAmount: 300, status: "Partial", method: "Cash", dueAt: null, date: "2026-09-20", isoDate: "2026-09-20" });
    render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Customer Credit" }));
    fireEvent.click(screen.getByLabelText("More actions for ABC Store"));
    fireEvent.click(screen.getByText("Pay"));
    expect(screen.getByText("Record Sale Payment")).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Record Payment" }));
    await screen.findByText("ABC Store");
    expect(mocks.api.payments.addToOrder).toHaveBeenCalledWith("order-1", expect.objectContaining({ amount: 100, method: "Cash" }));
  });

  it("removes a fully settled invoice from active Customer Credit while keeping History available", () => {
    mocks.records.push({ recordKey: "sale:order-1", id: "INV-1", apiId: "order-1", kind: "sale", name: "Sale", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true, amount: 1000, remainingAmount: 300, status: "Partial", dueAt: null, date: "2026-09-20", isoDate: "2026-09-20" });
    const result = render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Customer Credit" }));
    expect(screen.getByText("ABC Store")).toBeTruthy();
    mocks.records = mocks.records.map((record) => record.apiId === "order-1" ? { ...record, remainingAmount: 0, status: "Paid" } : record);
    result.rerender(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /><LocationProbe /></MemoryRouter>);
    expect(screen.queryByText("ABC Store")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByTestId("location").textContent).toBe("/payment/history");
  });

  it("opens a report-linked payment in existing desktop order details", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<MemoryRouter initialEntries={["/payment?orderId=order-1"]}><PaymentPage /></MemoryRouter>);
    expect(screen.getByText("Order detail order-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByText("Order detail order-1")).toBeNull();
  });

  it("reuses the existing desktop sale card detail interaction in Customer Credit", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.records.push({ recordKey: "sale:order-1", id: "INV-1", apiId: "order-1", kind: "sale", name: "Sale", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true, amount: 1000, remainingAmount: 300, status: "Partial", dueAt: null, date: "2026-09-20", isoDate: "2026-09-20" });
    render(<MemoryRouter initialEntries={["/payment"]}><PaymentPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Customer Credit" }));
    expect(screen.getByText("ABC Store")).toBeTruthy();
    fireEvent.click(screen.getByText("ABC Store"));
    expect(screen.getByText("Order detail order-1")).toBeTruthy();
  });
});
