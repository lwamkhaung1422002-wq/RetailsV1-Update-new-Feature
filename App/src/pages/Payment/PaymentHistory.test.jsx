import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PaymentPage from "./PaymentPage";
import SupplierHistoryPage from "../Suppliers/SupplierHistoryPage";

const mocks = vi.hoisted(() => {
  const records = ["income", "expense"].flatMap((kind) => [
    { id: kind, kind, name: `Test ${kind}`, status: "Paid", amount: 100, method: "Cash", occurredAt: "2026-09-05T01:00:00Z" },
    { id: `cancel-${kind}`, kind, name: `Test ${kind}`, status: "Cancelled", amount: 100, method: "Cash", occurredAt: "2026-09-05T02:00:00Z", reason: `${kind} cancelled` },
  ]);
  return { api: { payments: { history: vi.fn().mockResolvedValue({ records }) }, shop: { getSettings: vi.fn().mockResolvedValue({ settings: { paymentMethods: [] } }) } } };
});
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/usePosQueries", () => ({ usePaymentWorklistQuery: () => ({ data: [] }), useShopSettingsQuery: () => ({ data: { settings: {} } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("PC History button opens live history with both cancellation cards", async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><PaymentPage /></QueryClientProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText("income cancelled")).toBeTruthy();
  expect(await within(dialog).findByText("expense cancelled")).toBeTruthy();
  expect(within(dialog).getAllByText("Test income")).toHaveLength(2);
  expect(within(dialog).getAllByText("Test expense")).toHaveLength(2);
  expect(mocks.api.payments.history).toHaveBeenCalledWith({ view: "history" });
});

it("standalone history keeps original and cancelled events", async () => {
  render(<MemoryRouter><SupplierHistoryPage /></MemoryRouter>);
  expect(await screen.findByText("income cancelled")).toBeTruthy();
  expect(await screen.findByText("expense cancelled")).toBeTruthy();
  expect(screen.getAllByText("Test income")).toHaveLength(2);
});
