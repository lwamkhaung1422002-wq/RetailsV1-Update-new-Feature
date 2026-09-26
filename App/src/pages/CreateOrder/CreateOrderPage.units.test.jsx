import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  api: {
    shop: { getSettings: vi.fn() },
    pricing: { resolve: vi.fn(), barcodeLookup: vi.fn() },
    orders: { create: vi.fn(), updateStatus: vi.fn() },
  },
}));

const units = [
  { id: "piece-product-unit", unitId: "piece", isBase: true, canSell: true, conversionFactor: 1, minimumOrderQty: null, unit: { name: "Piece", symbol: "pc" } },
  { id: "carton-product-unit", unitId: "carton", canSell: true, conversionFactor: 24, minimumOrderQty: 3, unit: { name: "Carton", symbol: "ctn" } },
];

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useProductsQuery: () => ({ data: { products: [{ id: "product-1", name: "Coffee", price: 1000, currentStock: 120, units, barcodes: [] }] }, error: null, refetch: vi.fn() }),
  useAllCustomersQuery: () => ({ data: { customers: [] } }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: () => null }));
vi.mock("../Customers/CustomerDialog", () => ({ default: () => null }));

import CreateOrderPage from "./CreateOrderPage";

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { paymentMethods: [] } });
  mocks.api.pricing.resolve.mockImplementation(async ({ productUnitId }) => ({ pricing: {
    regularUnitPrice: productUnitId === "carton-product-unit" ? 24_000 : 1000,
    finalUnitPrice: productUnitId === "carton-product-unit" ? 24_000 : 1000,
    promotionId: null,
  } }));
});

afterEach(cleanup);

describe("Create Order manual selling unit", () => {
  it("defaults to Piece, changes to Carton, and resolves five entered cartons", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CreateOrderPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Coffee" }));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ productUnitId: "piece-product-unit", quantity: 1 })));
    fireEvent.mouseDown(screen.getByLabelText("Unit"));
    fireEvent.click(screen.getByRole("option", { name: "Carton" }));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ productUnitId: "carton-product-unit", quantity: 1 })));
    fireEvent.change(screen.getByLabelText("Quantity for Coffee"), { target: { value: "5" } });
    fireEvent.blur(screen.getByLabelText("Quantity for Coffee"));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ productUnitId: "carton-product-unit", quantity: 5 })));
  });
});
