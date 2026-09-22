import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
  api: {
    products: { get: vi.fn(), remove: vi.fn(), costHistory: vi.fn(), sourceHistory: vi.fn() },
    inventory: { movements: vi.fn() },
    pricing: { barcodeLookup: vi.fn() },
  },
  productResult: { products: [] },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useAllActiveProductsQuery: () => ({ data: mocks.productResult, error: null }),
  useCategoriesQuery: () => ({ data: { categories: [] }, error: null }),
  useInventoryQuery: () => ({ data: { inventory: [] }, error: null, refetch: vi.fn() }),
}));
vi.mock("../../components/Barcode/BarcodeManagerDialog", () => ({ default: () => null }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: () => null }));

import StockPage from "./StockPage";

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
  mocks.productResult = {
    products: [
      { id: "low", name: "Low Threshold Product", currentStock: 8, minimumStock: 10, cost: 100, price: 120, barcodes: [] },
      { id: "healthy", name: "Healthy Threshold Product", currentStock: 8, minimumStock: 5, cost: 100, price: 120, barcodes: [] },
    ],
  };
  mocks.api.products.get.mockResolvedValue({
    product: { id: "low", name: "Low Threshold Product", description: "Details", sku: "LOW-1", category: { name: "General" }, barcodes: [], cost: 100, price: 120, currentStock: 8, minimumStock: 10, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" },
    activeBarcode: null,
    hasSaleHistory: false,
  });
  mocks.api.inventory.movements.mockResolvedValue({ movements: [] });
  mocks.api.products.costHistory.mockResolvedValue({ history: [] });
  mocks.api.products.sourceHistory.mockResolvedValue({ sources: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.mobile = false;
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

it("filters Low Stock using each product's persisted minimumStock", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><StockPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Low Stock" }));
  expect(screen.getByText(/Low Threshold Product/)).toBeTruthy();
  expect(screen.queryByText(/Healthy Threshold Product/)).toBeNull();
});

it("opens desktop Product Details in place and restores the Inventory context when closed", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/stock"]}>
        <StockPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const search = screen.getByPlaceholderText("Search by product code, name or barcode...");
  fireEvent.change(search, { target: { value: "Low" } });
  fireEvent.click(screen.getByText(/Low Threshold Product/));

  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(await screen.findByText("Total Stock Value")).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toBe("/stock");
  fireEvent.click(screen.getByLabelText("Close product details"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(search.value).toBe("Low");
  expect(screen.getByTestId("location").textContent).toBe("/stock");
});

it("keeps mobile product clicks on the existing Product Details route", () => {
  mocks.mobile = true;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/stock"]}>
        <Routes>
          <Route path="/stock" element={<><StockPage /><LocationProbe /></>} />
          <Route path="/stock/:productId" element={<><span>Mobile Product Details Route</span><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByText(/Low Threshold Product/));
  expect(screen.getByText("Mobile Product Details Route")).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toBe("/stock/low");
});
