import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  customers: [
    { id: "customer-1", name: "Aye Aye", phone: "091111", address: "Main Road", city: "Yangon", visitCount: 12, totalAmount: 1250000 },
    { id: "customer-2", name: "Ko Min", phone: "092222", address: "Lake Road", city: "Mandalay", visitCount: 0, totalAmount: 0 },
  ],
  permissions: new Set(["order.view", "sale.create"]),
  customerQuery: vi.fn(),
  api: { customers: { create: vi.fn(), update: vi.fn(), creditReport: vi.fn() }, shop: { getSettings: vi.fn() } },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, hasPermission: (permission) => mocks.permissions.has(permission) }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({ useAllCustomersQuery: (options) => { mocks.customerQuery(options); return { data: { customers: mocks.customers }, isLoading: false }; } }));

import CustomersPage from "./CustomersPage";
import CustomerDialog from "./CustomerDialog";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.permissions = new Set(["order.view", "sale.create"]);
  mocks.api.customers.create.mockResolvedValue({ customer: { id: "customer-3", name: "Su Su" } });
  mocks.api.customers.update.mockResolvedValue({ customer: { ...mocks.customers[0], name: "Aye Aye Win" } });
  mocks.api.customers.creditReport.mockResolvedValue({ report: { effectiveCreditLimit: 0, outstanding: 0, availableCredit: 0, overdueAmount: 0, creditInvoices: 0, paidOnTime: 0, paidLate: 0, currentlyOverdue: 0, averageDaysLate: 0, longestDelay: 0, lastPayment: null, recentInvoices: [] } });
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { defaultCreditLimit: 0, defaultPaymentTermsDays: 30 } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Customers page", () => {
  it("shows desktop top controls and all eight customer columns with backend stats", () => {
    renderPage();
    expect(mocks.customerQuery).toHaveBeenCalledWith({ includeStats: true });
    expect(screen.queryByText("Manage saved customer contact information.")).toBeNull();
    expect(screen.queryByText("Customers")).toBeNull();
    const labels = ["NO.", "CUSTOMER", "PHONE", "ADDRESS", "CITY", "VISITS", "AMOUNT", "ACTIONS"];
    expect(labels.map((label) => screen.getByText(label).textContent)).toEqual(labels);
    expect(screen.getByText("1,250,000 ကျပ်")).toBeTruthy();
    const searchControl = screen.getByPlaceholderText("Search by name or phone").closest(".MuiFormControl-root");
    expect(searchControl.parentElement.contains(screen.getByRole("button", { name: "Add Customer" }))).toBe(true);
  });

  it("searches by name and phone and exposes Edit without Delete", () => {
    renderPage();
    expect(screen.getByText("Aye Aye")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search by name or phone"), { target: { value: "092222" } });
    expect(screen.getByText("Ko Min")).toBeTruthy();
    expect(screen.queryByText("Aye Aye")).toBeNull();
  }, 20_000);

  it("creates customers with only the supported fields", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add Customer" }));
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Su Su" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "093333" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Market Road" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bago" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.api.customers.create).toHaveBeenCalledWith({ name: "Su Su", phone: "093333", address: "Market Road", city: "Bago", pricingType: "RETAIL", creditLimitOverride: null, paymentTermsDaysOverride: null }));
  }, 20_000);

  it("edits a saved customer", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Aye Aye Win" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", { name: "Aye Aye Win", phone: "091111", address: "Main Road", city: "Yangon", pricingType: "RETAIL", creditLimitOverride: null, paymentTermsDaysOverride: null }));
  }, 20_000);

  it("returns the newly created customer so Quick Add can select it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSaved = vi.fn();
    render(<QueryClientProvider client={queryClient}><CustomerDialog open onClose={vi.fn()} onSaved={onSaved} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Su Su" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "customer-3", name: "Su Su" }));
  }, 20_000);

  it("keeps explicit zero credit overrides and shows the factual report for an existing customer", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><CustomerDialog open customer={mocks.customers[0]} onClose={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("Credit Summary")).toBeTruthy());
    expect(mocks.api.customers.creditReport).toHaveBeenCalledWith("customer-1");
    fireEvent.mouseDown(screen.getByLabelText("Credit Limit"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom Credit Limit"), { target: { value: "0" } });
    fireEvent.mouseDown(screen.getByLabelText("Payment Terms"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom Payment Terms (days)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", expect.objectContaining({ creditLimitOverride: 0, paymentTermsDaysOverride: 0 })));
  }, 20_000);

  it("uses the compact mobile row action menu with Edit only", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderPage();

    expect(screen.getByLabelText("Back to More")).toBeTruthy();
    expect(screen.getByText("Aye Aye").parentElement.contains(screen.getByText("091111"))).toBe(true);
    expect(screen.getByText("Main Road").parentElement.contains(screen.getByText("Yangon"))).toBe(true);
    expect(screen.getByText("Main Road").parentElement.contains(screen.getByLabelText("Actions for Aye Aye"))).toBe(true);
    expect(screen.getByText("Visits 12")).toBeTruthy();
    expect(screen.getByText("1,250,000 ကျပ်")).toBeTruthy();
    expect(screen.getByText("Visits 12").parentElement.contains(screen.getByText("1,250,000 ကျပ်"))).toBe(true);
    expect(screen.getByRole("button", { name: "Add Customer" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Actions for Aye Aye"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).toBeNull();
  }, 20_000);

  it("opens Add from the mobile FAB", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add Customer" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("hides desktop and mobile mutation controls without sale.create", () => {
    mocks.permissions = new Set(["order.view"]);
    const view = renderPage();
    expect(screen.getByText("Aye Aye")).toBeTruthy();
    expect(screen.getByText("1,250,000 ကျပ်")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Customer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search by name or phone"), { target: { value: "092222" } });
    expect(screen.getByText("Ko Min")).toBeTruthy();
    view.unmount();
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderPage();
    expect(screen.queryByRole("button", { name: "Add Customer" })).toBeNull();
    expect(screen.queryByLabelText("Actions for Aye Aye")).toBeNull();
  });
});
