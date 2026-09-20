import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  api: { products: { remove: vi.fn() }, pricing: { barcodeLookup: vi.fn() } },
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
    matches: false,
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
