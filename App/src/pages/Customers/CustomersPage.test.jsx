import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
  customers: [],
  permissions: new Set(["sale.create", "price.edit", "settings.manage"]),
  customerQuery: vi.fn(),
  api: {
    customers: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), get: vi.fn(), creditReport: vi.fn() },
    shop: { getSettings: vi.fn(), updateSettings: vi.fn() },
  },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, hasPermission: (permission) => mocks.permissions.has(permission) }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({ useAllCustomersQuery: (options) => { mocks.customerQuery(options); return { data: { customers: mocks.customers }, isLoading: false }; } }));

import CustomersPage from "./CustomersPage";
import CustomerDetailsPage from "./CustomerDetailsPage";
import CustomerDialog from "./CustomerDialog";

function LocationProbe() { const location = useLocation(); return <span data-testid="location">{location.pathname}</span>; }
function renderRoutes(path = "/customers") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/customers" element={<CustomersPage />} />
    <Route path="/customers/:customerId" element={<CustomerDetailsPage />} />
    <Route path="/settings" element={<div>Settings screen</div>} />
  </Routes><LocationProbe /></MemoryRouter></QueryClientProvider>);
}
function renderDialog(customer = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><CustomerDialog open customer={customer} onClose={vi.fn()} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mobile = false;
  mocks.permissions = new Set(["sale.create", "price.edit", "settings.manage"]);
  mocks.customers = [
    { id: "customer-1", name: "Aye Aye", phone: "091111", address: "Main Road", city: "Yangon", pricingType: "WHOLESALE", hasHistory: true, visitCount: 12, totalAmount: 1_250_000, effectiveCreditLimit: 500_000, effectivePaymentTermsDays: 30 },
    { id: "customer-2", name: "Ko Min", phone: "092222", address: "Lake Road", city: "Mandalay", pricingType: "RETAIL", hasHistory: false, visitCount: 0, totalAmount: 0, effectiveCreditLimit: 500_000, effectivePaymentTermsDays: 30 },
  ];
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: mocks.mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.customers.create.mockResolvedValue({ customer: { id: "customer-3", name: "Su Su" } });
  mocks.api.customers.update.mockResolvedValue({ customer: { ...mocks.customers[0], name: "Aye Aye Win" } });
  mocks.api.customers.remove.mockResolvedValue(undefined);
  mocks.api.customers.get.mockImplementation(async (id) => ({ customer: mocks.customers.find((item) => item.id === id) }));
  mocks.api.customers.creditReport.mockResolvedValue({ report: { effectiveCreditLimit: 500_000, outstanding: 0, availableCredit: 500_000, overdueAmount: 0, creditInvoices: 0, paidOnTime: 0, paidLate: 0, currentlyOverdue: 0, averageDaysLate: 0, longestDelay: 0, lastPayment: null, recentInvoices: [] } });
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { defaultCreditLimit: 500_000, defaultPaymentTermsDays: 30 } });
  mocks.api.shop.updateSettings.mockResolvedValue({ settings: { defaultCreditLimit: 2_000_000, defaultPaymentTermsDays: 15 } });
});
afterEach(() => { cleanup(); });

describe("Customers page", () => {
  it("keeps desktop search, secondary Credit Defaults, then primary Add Customer and opens details in a modal", async () => {
    renderRoutes();
    expect(mocks.customerQuery).toHaveBeenCalledWith({ includeStats: true });
    const search = screen.getByPlaceholderText("Search by name or phone");
    const defaults = screen.getByRole("button", { name: "Credit Defaults" });
    const add = screen.getByRole("button", { name: "Add Customer" });
    expect(search.compareDocumentPosition(defaults) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(defaults.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(defaults.className).toContain("MuiButton-outlined");
    expect(add.className).toContain("MuiButton-contained");
    expect(screen.getByText("1,250,000 ကျပ်")).toBeTruthy();
    expect(mocks.api.customers.creditReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View Aye Aye" }));
    expect(screen.getByTestId("location").textContent).toBe("/customers");
    const details = await screen.findByRole("dialog", { name: "Customer Details" });
    expect(getComputedStyle(details).width).toBe("810px");
    expect(getComputedStyle(details).maxHeight).toBe("86vh");
    expect(within(details).getByText("Customer Information")).toBeTruthy();
    expect(mocks.api.customers.get).toHaveBeenCalledWith("customer-1");
    expect(mocks.api.customers.creditReport).toHaveBeenCalledWith("customer-1");
    expect(within(details).getByRole("button", { name: "Edit" }).querySelector("svg")).toBeNull();
    const deleteButton = within(details).getByRole("button", { name: "Delete" });
    expect(deleteButton.querySelector("svg")).toBeNull();
    expect(deleteButton.disabled).toBe(true);
    expect(within(details).queryByLabelText("Customer actions")).toBeNull();
  });

  it("closes desktop details without losing the Customer list search", async () => {
    renderRoutes();
    fireEvent.change(screen.getByPlaceholderText("Search by name or phone"), { target: { value: "Ko Min" } });
    expect(screen.queryByRole("button", { name: "View Aye Aye" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Ko Min" }));
    const details = await screen.findByRole("dialog", { name: "Customer Details" });
    expect(within(details).getByRole("button", { name: "Delete" }).disabled).toBe(false);
    fireEvent.click(within(details).getByRole("button", { name: "Close Customer Details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Customer Details" })).toBeNull());
    expect(screen.getByPlaceholderText("Search by name or phone").value).toBe("Ko Min");
    expect(screen.getByRole("button", { name: "View Ko Min" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/customers");
  });

  it("keeps kebab actions from navigating and disables Delete for any history", async () => {
    renderRoutes();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Aye Aye" }));
    expect(screen.getByTestId("location").textContent).toBe("/customers");
    expect(screen.queryByRole("dialog", { name: "Customer Details" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Delete" }).title).toMatch(/transaction history/);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit Customer" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/customers");
  });

  it("confirms and deletes a no-history customer without reloading the app", async () => {
    renderRoutes();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ko Min" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText('Delete "Ko Min"?')).toBeTruthy();
    expect(screen.getByText("This customer has no transaction history.")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog", { name: 'Delete "Ko Min"?' })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.api.customers.remove).toHaveBeenCalledWith("customer-2"));
  });

  it("keeps mobile Back/Customers/Credit Defaults header and existing Add FAB; card opens details", async () => {
    mocks.mobile = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderRoutes();
    expect(screen.getByLabelText("Back to More")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Credit Defaults" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Customer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ko Min" }));
    expect(screen.getByTestId("location").textContent).toBe("/customers");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit Customer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "View Ko Min" }));
    expect(screen.getByTestId("location").textContent).toBe("/customers/customer-2");
    await waitFor(() => expect(screen.getByText("Customer Information")).toBeTruthy());
  });

  it("hides Credit Defaults and Delete without settings.manage", () => {
    mocks.permissions = new Set(["sale.create"]);
    const view = renderRoutes();
    expect(screen.queryByRole("button", { name: "Credit Defaults" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ko Min" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    view.unmount();
    mocks.mobile = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderRoutes();
    expect(screen.queryByRole("button", { name: "Credit Defaults" })).toBeNull();
  });

  it("loads and saves Credit Defaults after clearing stale validation errors", async () => {
    renderRoutes();
    fireEvent.click(screen.getByRole("button", { name: "Credit Defaults" }));
    expect(screen.getByText(/Custom customer limits and terms are not changed/)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Default Credit Limit").value).toBe("500000"));
    fireEvent.change(screen.getByLabelText("Default Credit Limit"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Enter a nonnegative credit limit/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Default Credit Limit"), { target: { value: "2000000" } });
    expect(screen.queryByText(/Enter a nonnegative credit limit/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Default Payment Terms (days)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.shop.updateSettings).toHaveBeenCalledWith({ defaultCreditLimit: 2_000_000, defaultPaymentTermsDays: 15 }));
    expect(mocks.api.customers.update).not.toHaveBeenCalled();
  });

  it("lets sale.create edit contact fields without sending protected pricing or credit fields", async () => {
    mocks.permissions = new Set(["sale.create"]);
    renderRoutes();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Aye Aye" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.queryByLabelText("Pricing Type")).toBeNull();
    expect(screen.queryByLabelText("Credit Limit")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Aye Aye Win" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", { name: "Aye Aye Win", phone: "091111", address: "Main Road", city: "Yangon" }));
  });

  it("omits Pricing Type when adding a customer and sends only existing contact and credit fields", async () => {
    renderDialog();
    expect(screen.queryByLabelText("Pricing Type")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Su Su" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Su Su" })));
    expect(mocks.api.customers.create.mock.calls[0][0]).not.toHaveProperty("pricingType");
  });

  it("keeps explicit zero overrides in the edit dialog but moves the report out", async () => {
    renderDialog(mocks.customers[0]);
    expect(screen.queryByText("Credit Summary")).toBeNull();
    expect(mocks.api.customers.creditReport).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByLabelText("Credit Limit"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom Credit Limit"), { target: { value: "0" } });
    fireEvent.mouseDown(screen.getByLabelText("Payment Terms"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom Payment Terms (days)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", expect.objectContaining({ creditLimitOverride: 0, paymentTermsDaysOverride: 0 })));
  });

  it("omits Pricing Type when editing and does not send legacy classification", async () => {
    mocks.permissions = new Set(["sale.create", "price.edit"]);
    renderDialog(mocks.customers[0]);
    expect(screen.queryByLabelText("Pricing Type")).toBeNull();
    expect(screen.queryByLabelText("Credit Limit")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", expect.any(Object)));
    expect(mocks.api.customers.update.mock.calls[0][1]).not.toHaveProperty("pricingType");
    expect(mocks.api.customers.update.mock.calls[0][1]).not.toHaveProperty("creditLimitOverride");
  });

  it("does not show an empty Edit action to a price.edit-only user", async () => {
    mocks.permissions = new Set(["price.edit"]);
    renderRoutes();
    expect(screen.queryByRole("button", { name: "Add Customer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions for Aye Aye" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Aye Aye" }));
    const details = await screen.findByRole("dialog", { name: "Customer Details" });
    expect(within(details).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("lets settings.manage change credit policy without submitting contact or pricing fields", async () => {
    mocks.permissions = new Set(["settings.manage"]);
    renderDialog(mocks.customers[0]);
    expect(screen.getByLabelText(/Customer Name/).disabled).toBe(true);
    expect(screen.queryByLabelText("Pricing Type")).toBeNull();
    fireEvent.mouseDown(screen.getByLabelText("Credit Limit"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom Credit Limit"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", { creditLimitOverride: 1_000_000, paymentTermsDaysOverride: null }));
  });

  it("shows Customer Details after direct refresh with four metrics, empty behavior, and Historical legacy invoices", async () => {
    mocks.api.customers.creditReport.mockResolvedValue({ report: {
      effectiveCreditLimit: 500_000, outstanding: 50_000, availableCredit: 450_000, overdueAmount: 0,
      creditInvoices: 0, paidOnTime: 0, paidLate: 0, currentlyOverdue: 0, averageDaysLate: 0, longestDelay: 0,
      lastPayment: "2026-09-05T00:00:00.000Z",
      recentInvoices: [{ orderId: "order-1", orderNumber: "00003", effectiveAmount: 60_000, outstanding: 50_000, dueAt: null, finalPaidAt: null, status: "LEGACY", daysLate: 0 }],
    } });
    renderRoutes("/customers/customer-1");
    expect(screen.getByRole("dialog", { name: "Customer Details" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Customer Information")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("No tracked credit payment history yet.")).toBeTruthy());
    expect(screen.getByText("Commercial Terms")).toBeTruthy();
    expect(screen.queryByText("Pricing Type")).toBeNull();
    expect(screen.getAllByText("Shop Default")).toHaveLength(2);
    expect(screen.queryByText("Limit Source")).toBeNull();
    expect(screen.queryByText("Terms Source")).toBeNull();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Aye Aye")).toBeTruthy();
    expect(screen.getByText("Credit Summary")).toBeTruthy();
    expect(screen.getAllByText("Outstanding")).toHaveLength(2);
    expect(screen.getByText("Available Credit")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Historical")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.queryByText("LEGACY")).toBeNull();
    expect(screen.getByText("Last Credit Payment")).toBeTruthy();
    expect(screen.queryByText("Credit Invoices")).toBeNull();
  });

  it("attaches Custom captions to each commercial value without separate source rows", async () => {
    mocks.customers[0] = { ...mocks.customers[0], creditLimitOverride: 50_000, paymentTermsDaysOverride: 4, effectiveCreditLimit: 50_000, effectivePaymentTermsDays: 4 };
    renderRoutes("/customers/customer-1");
    await waitFor(() => expect(screen.getByText("Commercial Terms")).toBeTruthy());
    const terms = screen.getByText("Commercial Terms").closest(".MuiCard-root");
    expect(within(terms).getAllByText("Custom")).toHaveLength(2);
    expect(within(terms).getByText("Credit Limit").parentElement.textContent).toContain("50,000Custom");
    expect(within(terms).getByText("Payment Terms").parentElement.textContent).toContain("4 daysCustom");
    expect(within(terms).queryByText("Limit Source")).toBeNull();
    expect(within(terms).queryByText("Terms Source")).toBeNull();
  });

  it("shows tracked payment statistics and recent invoices on Customer Details", async () => {
    mocks.api.customers.creditReport.mockResolvedValue({ report: {
      effectiveCreditLimit: 500_000, outstanding: 100_000, availableCredit: 400_000, overdueAmount: 100_000,
      creditInvoices: 2, paidOnTime: 1, paidLate: 0, currentlyOverdue: 1, averageDaysLate: 0, longestDelay: 5,
      lastPayment: "2026-09-10T00:00:00.000Z", recentInvoices: [{ orderId: "order-1", orderNumber: "00125", effectiveAmount: 100_000, outstanding: 100_000, dueAt: "2026-09-10T00:00:00.000Z", finalPaidAt: null, status: "OVERDUE", daysLate: 5 }],
    } });
    renderRoutes("/customers/customer-1");
    await waitFor(() => expect(screen.getByText("Credit Invoices")).toBeTruthy());
    expect(screen.getByText("Last Credit Payment")).toBeTruthy();
    expect(screen.getByText("#00125")).toBeTruthy();
    expect(screen.getByText("Overdue · 5 days")).toBeTruthy();
  });

  it("keeps mobile Customer Details read-oriented with edit in the existing kebab", async () => {
    mocks.mobile = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderRoutes("/customers/customer-1");
    await waitFor(() => expect(screen.getByText("Customer Information")).toBeTruthy());
    expect(screen.getByLabelText("Back to Customers")).toBeTruthy();
    expect(screen.getByText("Customer Details")).toBeTruthy();
    expect(screen.queryByText("Pricing Type")).toBeNull();
    expect(screen.getAllByText("091111")).toHaveLength(1);
    const info = screen.getByText("Customer Information").closest(".MuiCard-root");
    expect(within(info).queryByText("Pricing Type")).toBeNull();
    expect(info.contains(screen.getByText("091111"))).toBe(true);
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.queryByText("Limit Source")).toBeNull();
    expect(screen.queryByText("Terms Source")).toBeNull();
    fireEvent.click(screen.getByLabelText("Customer actions"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByLabelText("Back to Customers"));
    expect(screen.getByTestId("location").textContent).toBe("/customers");
  });

  it("keeps mobile Edit available to sale.create cashiers without offering Delete", async () => {
    mocks.permissions = new Set(["sale.create"]);
    mocks.mobile = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderRoutes("/customers/customer-1");
    await waitFor(() => expect(screen.getByText("Customer Information")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Customer actions"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("renders recent credit invoices as compact mobile cards", async () => {
    mocks.mobile = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.api.customers.creditReport.mockResolvedValue({ report: {
      effectiveCreditLimit: 500_000, outstanding: 0, availableCredit: 500_000, overdueAmount: 0,
      creditInvoices: 1, paidOnTime: 0, paidLate: 1, currentlyOverdue: 0, averageDaysLate: 5, longestDelay: 5,
      lastPayment: "2026-09-15T00:00:00.000Z", recentInvoices: [{ orderId: "order-1", orderNumber: "00125", effectiveAmount: 800_000, outstanding: 0, dueAt: "2026-09-10T00:00:00.000Z", finalPaidAt: "2026-09-15T00:00:00.000Z", status: "LATE", daysLate: 5 }],
    } });
    renderRoutes("/customers/customer-1");
    await waitFor(() => expect(screen.getByText("#00125")).toBeTruthy());
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.getByText("Delay")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
