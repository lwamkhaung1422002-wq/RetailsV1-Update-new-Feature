import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  api: {
    products: { list: vi.fn(), get: vi.fn() },
    categories: { list: vi.fn() },
    pricing: { barcodeLookup: vi.fn(), wholesalePricing: vi.fn(), saveWholesalePricing: vi.fn(), createPrice: vi.fn(), bulkPrices: vi.fn() },
  },
  runWithApproval: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, isGuest: false, hasPermission: () => true }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: mocks.runWithApproval }) }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({
  default: ({ open, onDetected }) => open ? <div role="dialog" aria-label="Scan barcode"><button onClick={() => onDetected("885123")}>Detect barcode</button></div> : null,
}));

import AddPricePage from "./AddPricePage";

const fullProducts = [
  { id: "coke", name: "Coke", sku: "COKE", price: 1500, cost: 800, category: { name: "Drinks" }, barcodes: [{ value: "885123", isPrimary: true }], units: [
    { id: "piece", isBase: true, conversionFactor: 1, canSell: true, unit: { name: "Piece", isActive: true } },
    { id: "carton", isBase: false, conversionFactor: 24, canSell: true, unit: { name: "Carton", isActive: true } },
  ] },
  { id: "water", name: "Water", sku: "WATER", price: 1000, cost: 500, category: { name: "Drinks" }, units: [{ id: "water-piece", isBase: true, conversionFactor: 1, canSell: true, unit: { name: "Piece", isActive: true } }] },
];

function LocationProbe() { return <span data-testid="location">{useLocation().pathname}</span>; }
function renderPage(path = "/price/add") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/price/add" element={<AddPricePage />} />
    <Route path="/price" element={<div>Price list</div>} />
  </Routes><LocationProbe /></MemoryRouter></QueryClientProvider>);
}

async function selectCoke() {
  fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
  fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "coke" } });
  fireEvent.click(await screen.findByRole("button", { name: "Select Coke" }));
  await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.categories.list.mockResolvedValue({ categories: [{ id: "drinks", name: "Drinks" }] });
  mocks.api.products.list.mockResolvedValue({ products: fullProducts.map(({ id, name, sku, price, category, barcodes }) => ({ id, name, sku, price, category, barcodes })) });
  mocks.api.products.get.mockImplementation(async (id) => ({ product: fullProducts.find((item) => item.id === id) }));
  mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: true, product: { id: "coke", isActive: true } });
  mocks.api.pricing.wholesalePricing.mockResolvedValue({ tiers: [] });
  mocks.api.pricing.saveWholesalePricing.mockResolvedValue({ tiers: [] });
  mocks.api.pricing.createPrice.mockResolvedValue({});
  mocks.api.pricing.bulkPrices.mockResolvedValue({});
  mocks.runWithApproval.mockImplementation(async (_details, submit) => submit("approval-token"));
});
afterEach(cleanup);

describe("Add Price setup", () => {
  it("shows no catalog or tabs before Individual selection, then defaults to Retail and preserves its draft across tabs", async () => {
    renderPage();
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
    expect(screen.getByText("Search for a product to continue.")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Wholesale" })).toBeNull();
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "coke" } });
    await waitFor(() => expect(mocks.api.products.list).toHaveBeenCalledWith({ status: "active", search: "coke", page: 1, pageSize: 25 }));
    fireEvent.click(await screen.findByRole("button", { name: "Select Coke" }));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Retail" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Apply Retail Price" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Margin percentage"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("tab", { name: "Wholesale" }));
    expect(screen.getAllByRole("button", { name: "Save Wholesale Pricing" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Retail" }));
    expect(screen.getByLabelText("Margin percentage").value).toBe("15");
  });

  it("saves calculated Wholesale tiers from the one footer CTA without invoking Retail pricing", async () => {
    renderPage();
    await selectCoke();
    fireEvent.click(screen.getByRole("tab", { name: "Wholesale" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Selling Unit" }));
    fireEvent.click(await screen.findByRole("option", { name: "Carton" }));
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getByLabelText("Minimum Qty"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    const save = screen.getByRole("button", { name: "Save Wholesale Pricing" });
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(mocks.api.pricing.saveWholesalePricing).toHaveBeenCalledWith("coke", {
      productUnitId: "carton", variantId: null, levels: [{ minimumQuantity: 1, unitPrice: 22080 }],
    }));
    expect(mocks.api.pricing.createPrice).not.toHaveBeenCalled();
  });

  it("uses barcode lookup for direct selection and resets product-specific Retail drafts on Change", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    expect(screen.getByRole("dialog", { name: "Scan barcode" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detect barcode" }));
    await waitFor(() => expect(mocks.api.pricing.barcodeLookup).toHaveBeenCalledWith("885123"));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Retail" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByLabelText("New Sell Price"), { target: { value: "1900" } });
    fireEvent.click(screen.getByRole("tab", { name: "Wholesale" }));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByRole("tab", { name: "Wholesale" })).toBeNull();
    mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: false });
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    fireEvent.click(screen.getByRole("button", { name: "Detect barcode" }));
    await waitFor(() => expect(screen.getByText("No product found for this barcode.")).toBeTruthy());
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "water" } });
    fireEvent.click(await screen.findByRole("button", { name: "Select Water" }));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Retail" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("New Sell Price").value).toBe("");
  });

  it("keeps Wholesale draft levels while switching tabs for the same product", async () => {
    renderPage();
    await selectCoke();
    fireEvent.click(screen.getByRole("tab", { name: "Wholesale" }));
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getByLabelText("Minimum Qty"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("tab", { name: "Retail" }));
    fireEvent.click(screen.getByRole("tab", { name: "Wholesale" }));
    expect(screen.getByLabelText("Minimum Qty").value).toBe("5");
    expect(screen.getByLabelText("Margin %").value).toBe("12");
  });

  it("preserves Retail override approval payload and Category bulk behavior", async () => {
    const view = renderPage();
    await selectCoke();
    fireEvent.change(screen.getByLabelText("New Sell Price"), { target: { value: "1900" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Price update" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Retail Price" }));
    await waitFor(() => expect(mocks.api.pricing.createPrice).toHaveBeenCalledWith(expect.objectContaining({
      productId: "coke", unitPrice: 1900, reason: "Price update",
    }), "approval-token"));
    expect(mocks.runWithApproval).toHaveBeenCalledWith(expect.objectContaining({ permission: "price.edit", action: "price.override" }), expect.any(Function));
    view.unmount();
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Category" }));
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Drinks" }));
    fireEvent.change(screen.getByLabelText("Margin percentage"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Bulk update" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Price" }));
    await waitFor(() => expect(mocks.api.pricing.bulkPrices).toHaveBeenCalledWith({ scope: "CATEGORY", categoryId: "drinks", marginPercent: 15, reason: "Bulk update" }));
  });

  it("loads edit product directly and keeps Category/All without Wholesale tabs", async () => {
    const view = renderPage("/price/add?edit=coke");
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledWith("coke");
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Retail Price" })).toBeTruthy();
    view.unmount();
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Category" }));
    expect(screen.queryByRole("tab", { name: "Wholesale" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.queryByRole("tab", { name: "Wholesale" })).toBeNull();
  });
});
