import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  orders: [],
  api: { orders: { get: vi.fn() } },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useOrdersQuery: () => ({ data: { orders: mocks.orders } }),
  useOrderCancelMutation: () => ({ isPending: false }),
}));
vi.mock("../../components/PaymentCancellationDialog", () => ({ default: () => null }));
vi.mock("./OrderDetailsPage", () => ({
  default: ({ embeddedOrderId, embeddedOnClose, hideBackButton }) => <div><span>Embedded {embeddedOrderId}</span><span data-testid="embedded-hide-back">{String(hideBackButton)}</span><button onClick={embeddedOnClose}>Close embedded order</button></div>,
}));

import SalePage from "./SalePage";

beforeEach(() => {
  window.sessionStorage.clear();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: "(max-width:768px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.orders = [{
    id: "order-1",
    orderNumber: "INV-1",
    total: 100,
    effectiveTotal: 100,
    subtotal: 100,
    discount: 0,
    paymentStatus: "paid",
    fulfillmentStatus: "completed",
    createdAt: "2026-09-20T00:00:00.000Z",
    customer: { id: "customer-1", name: "Aye Aye" },
    items: [{ productName: "Coffee", quantity: 1 }],
    payments: [],
  }];
});

it("shows a separate desktop customer column and includes it in sale search", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><SalePage /></MemoryRouter></QueryClientProvider>);

  expect(screen.getByText("Aye Aye")).toBeTruthy();
  expect(screen.getByText("CUSTOMER")).toBeTruthy();
  expect(screen.getByText("INV-1").nextElementSibling.textContent).toBe("Aye Aye");
  fireEvent.change(screen.getByPlaceholderText(/Search by order number, customer/), { target: { value: "aye aye" } });
  expect(screen.getByText("INV-1")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/Search by order number, customer/), { target: { value: "missing customer" } });
  expect(screen.queryByText("INV-1")).toBeNull();
});

it("shows the customer before the invoice on mobile and keeps the Walk-in fallback", () => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.orders.push({ ...mocks.orders[0], id: "order-2", orderNumber: "INV-2", customer: null });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><SalePage /></MemoryRouter></QueryClientProvider>);

  expect(screen.getByText("Aye Aye").nextElementSibling.textContent).toBe("INV-1");
  expect(screen.getByText("Walk-in").nextElementSibling.textContent).toBe("INV-2");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps desktop Order Details in the existing dialog and wires its embedded close control", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><SalePage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(screen.getByLabelText("View INV-1 details"));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Embedded order-1")).toBeTruthy();
  expect(screen.getByTestId("embedded-hide-back").textContent).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Close embedded order" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
