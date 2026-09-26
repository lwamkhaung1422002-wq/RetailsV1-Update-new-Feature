import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: {
    products: { list: vi.fn(), get: vi.fn() },
    pricing: { barcodeLookup: vi.fn() },
  },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, isGuest: false }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({
  default: ({ open, onDetected, onClose }) => open ? <div role="dialog" aria-label="Scan barcode">
    <button onClick={() => onDetected("885123")}>Detect known barcode</button>
    <button onClick={() => onDetected("unknown")}>Detect unknown barcode</button>
    <button onClick={onClose}>Close scanner</button>
  </div> : null,
}));

import ProductSearchSelector from "./ProductSearchSelector";

const results = Array.from({ length: 10 }, (_, index) => ({
  id: `product-${index + 1}`, name: index === 0 ? "Coca Cola 330ml" : `Product ${index + 1}`,
  sku: index === 0 ? "COKE-330" : `SKU-${index + 1}`,
  barcodes: index === 0 ? [{ value: "885123", isPrimary: true }] : [],
  category: { name: "Drinks" }, price: 1500,
}));

function Harness({ initialProductId }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  return <ProductSearchSelector selectedProduct={selectedProduct} onSelect={setSelectedProduct} onChange={() => setSelectedProduct(null)} initialProductId={initialProductId} />;
}

function renderSelector(initialProductId) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><Harness initialProductId={initialProductId} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.products.list.mockResolvedValue({ products: results });
  mocks.api.products.get.mockImplementation(async (id) => ({ product: { ...results.find((item) => item.id === id), id, cost: 900, units: [] } }));
  mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: true, product: { id: "product-1", isActive: true } });
});
afterEach(cleanup);

describe("shared Product selector", () => {
  it("keeps blank search empty and debounces server search to eight visible results", async () => {
    renderSelector();
    expect(screen.getByText("Search for a product to continue.")).toBeTruthy();
    expect(screen.queryByText("Search Results")).toBeNull();
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    const search = screen.getByPlaceholderText("Search name / SKU / barcode...");
    fireEvent.change(search, { target: { value: "co" } });
    fireEvent.change(search, { target: { value: "coke" } });
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.api.products.list).toHaveBeenCalledWith({ status: "active", search: "coke", page: 1, pageSize: 25 }));
    expect(mocks.api.products.list).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(8));
    expect(screen.getByText("SKU: COKE-330 · Barcode: 885123")).toBeTruthy();
    expect(screen.getAllByText("Drinks · Current Price: 1,500")).toHaveLength(8);
    expect(mocks.api.products.get).not.toHaveBeenCalled();
  });

  it("selects one full product after search and hides search/results until Change", async () => {
    renderSelector();
    fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "COKE-330" } });
    await screen.findByRole("button", { name: "Select Coca Cola 330ml" });
    fireEvent.click(screen.getByRole("button", { name: "Select Coca Cola 330ml" }));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledTimes(1);
    expect(mocks.api.products.get).toHaveBeenCalledWith("product-1");
    expect(screen.queryByPlaceholderText("Search name / SKU / barcode...")).toBeNull();
    expect(screen.queryByText("Search Results")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...").value).toBe("");
    expect(screen.getByText("Search for a product to continue.")).toBeTruthy();
  });

  it("uses barcode lookup then full GET, and leaves search usable for an unknown barcode", async () => {
    renderSelector();
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    expect(screen.getByRole("dialog", { name: "Scan barcode" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detect known barcode" }));
    await waitFor(() => expect(mocks.api.pricing.barcodeLookup).toHaveBeenCalledWith("885123"));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledWith("product-1");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: false });
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    fireEvent.click(screen.getByRole("button", { name: "Detect unknown barcode" }));
    await waitFor(() => expect(screen.getByText("No product found for this barcode.")).toBeTruthy());
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...")).toBeTruthy();
  });

  it("loads an edit target directly without a catalog search", async () => {
    renderSelector("product-1");
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledWith("product-1");
    expect(mocks.api.products.list).not.toHaveBeenCalled();
  });

  it("passes SKU and barcode text through the same server search without local catalog filtering", async () => {
    renderSelector();
    const search = screen.getByPlaceholderText("Search name / SKU / barcode...");
    fireEvent.change(search, { target: { value: "COKE-330" } });
    await waitFor(() => expect(mocks.api.products.list).toHaveBeenCalledWith(expect.objectContaining({ search: "COKE-330" })));
    fireEvent.change(search, { target: { value: "885123" } });
    await waitFor(() => expect(mocks.api.products.list).toHaveBeenCalledWith(expect.objectContaining({ search: "885123" })));
    expect(await screen.findByRole("button", { name: "Select Coca Cola 330ml" })).toBeTruthy();
  });

  it("shows a full-product load error without selecting an incomplete search result", async () => {
    mocks.api.products.get.mockRejectedValue(new Error("Product details unavailable."));
    renderSelector();
    fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "coke" } });
    fireEvent.click(await screen.findByRole("button", { name: "Select Coca Cola 330ml" }));
    await waitFor(() => expect(screen.getByText("Product details unavailable.")).toBeTruthy());
    expect(screen.queryByText("Selected Product")).toBeNull();
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...")).toBeTruthy();
  });
});
