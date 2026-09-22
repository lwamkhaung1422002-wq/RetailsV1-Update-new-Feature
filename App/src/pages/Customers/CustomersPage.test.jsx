import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  customers: [
    { id: "customer-1", name: "Aye Aye", phone: "091111", address: "Main Road", city: "Yangon" },
    { id: "customer-2", name: "Ko Min", phone: "092222", address: "Lake Road", city: "Mandalay" },
  ],
  api: { customers: { create: vi.fn(), update: vi.fn() } },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({ useAllCustomersQuery: () => ({ data: { customers: mocks.customers }, isLoading: false }) }));

import CustomersPage from "./CustomersPage";
import CustomerDialog from "./CustomerDialog";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.customers.create.mockResolvedValue({ customer: { id: "customer-3", name: "Su Su" } });
  mocks.api.customers.update.mockResolvedValue({ customer: { ...mocks.customers[0], name: "Aye Aye Win" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Customers page", () => {
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

    await waitFor(() => expect(mocks.api.customers.create).toHaveBeenCalledWith({ name: "Su Su", phone: "093333", address: "Market Road", city: "Bago" }));
  }, 20_000);

  it("edits a saved customer", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Aye Aye Win" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.api.customers.update).toHaveBeenCalledWith("customer-1", { name: "Aye Aye Win", phone: "091111", address: "Main Road", city: "Yangon" }));
  }, 20_000);

  it("returns the newly created customer so Quick Add can select it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSaved = vi.fn();
    render(<QueryClientProvider client={queryClient}><CustomerDialog open onClose={vi.fn()} onSaved={onSaved} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: "Su Su" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "customer-3", name: "Su Su" }));
  }, 20_000);

  it("uses the compact mobile row action menu with Edit only", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderPage();

    expect(screen.getByLabelText("Back to More")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Actions for Aye Aye"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).toBeNull();
  }, 20_000);
});
