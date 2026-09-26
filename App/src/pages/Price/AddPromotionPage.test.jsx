import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({
  api: {
    products: { list: vi.fn(), get: vi.fn() },
    categories: { list: vi.fn() },
    pricing: { barcodeLookup: vi.fn(), promotionCampaigns: vi.fn(), createPromotionCampaign: vi.fn(), updatePromotionCampaign: vi.fn() },
  },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, isGuest: false }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({
  default: ({ open, onDetected }) => open ? <div role="dialog" aria-label="Scan barcode">
    <button onClick={() => onDetected("885123")}>Detect known barcode</button>
    <button onClick={() => onDetected("missing")}>Detect missing barcode</button>
  </div> : null,
}));

import AddPromotionPage from "./AddPromotionPage";

const product = { id: "coke", name: "Coca Cola", sku: "COKE", price: 1500, category: { name: "Drinks" }, barcodes: [{ value: "885123", isPrimary: true }] };
const campaign = { id: "campaign-1", name: "Coke Offer", scope: "PRODUCT", version: 3, promotions: [{
  id: "promotion-1", productId: "coke", name: "Coke Offer", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-30T00:00:00.000Z",
  type: "PERCENTAGE", value: 10, reason: "Existing offer", audienceType: "RETAIL",
}] };

function renderPage(path = "/price/promotion/add") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/price/promotion/add" element={<AddPromotionPage />} />
    <Route path="/price" element={<div>Price list</div>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

async function selectProduct() {
  fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
  fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "COKE" } });
  fireEvent.click(await screen.findByRole("button", { name: "Select Coca Cola" }));
  await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.categories.list.mockResolvedValue({ categories: [{ id: "drinks", name: "Drinks" }] });
  mocks.api.products.list.mockResolvedValue({ products: [product] });
  mocks.api.products.get.mockResolvedValue({ product });
  mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: true, product: { id: "coke", isActive: true } });
  mocks.api.pricing.promotionCampaigns.mockResolvedValue({ campaigns: [] });
  mocks.api.pricing.createPromotionCampaign.mockResolvedValue({});
  mocks.api.pricing.updatePromotionCampaign.mockResolvedValue({});
});
afterEach(cleanup);

describe("Add Promotion setup", () => {
  it("starts Individual with no catalog, then shows the existing form only after full product selection", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
    expect(screen.getByText("Search for a product to continue.")).toBeTruthy();
    expect(screen.queryByLabelText("Promotion name")).toBeNull();
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Search name / SKU / barcode..."), { target: { value: "COKE" } });
    fireEvent.click(await screen.findByRole("button", { name: "Select Coca Cola" }));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Search Results")).toBeNull();
    expect(screen.getByText("Current Price: 1,500", { exact: false })).toBeTruthy();
    expect(screen.getByLabelText("Promotion name")).toBeTruthy();
    expect(screen.getByLabelText("Audience")).toBeTruthy();
    expect(screen.getByLabelText("Reason")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...").value).toBe("");
    expect(screen.queryByLabelText("Promotion name")).toBeNull();
  });

  it("connects the shared scanner and keeps manual search available after unknown barcode", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    fireEvent.click(screen.getByRole("button", { name: "Detect known barcode" }));
    await waitFor(() => expect(mocks.api.pricing.barcodeLookup).toHaveBeenCalledWith("885123"));
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: false });
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    fireEvent.click(screen.getByRole("button", { name: "Detect missing barcode" }));
    await waitFor(() => expect(screen.getByText("No product found for this barcode.")).toBeTruthy());
    expect(screen.getByPlaceholderText("Search name / SKU / barcode...")).toBeTruthy();
  });

  it("keeps PRODUCT campaign create payload and Audience semantics", async () => {
    renderPage();
    await selectProduct();
    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Coke Deal" } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Audience" }));
    fireEvent.click(await screen.findByRole("option", { name: "Wholesale Only" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("Discount percentage"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "October offer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Promotion" }));
    await waitFor(() => expect(mocks.api.pricing.createPromotionCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: "Coke Deal", scope: "PRODUCT", productId: "coke", audienceType: "WHOLESALE",
      type: "PERCENTAGE", value: 10, channel: "ALL", minimumQuantity: 1, discountBase: "REGULAR_PRICE", state: "SCHEDULED",
    })));
  });

  it("preserves Category/All flows without showing the Individual selector", async () => {
    const view = renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Category" }));
    expect(screen.queryByPlaceholderText("Search name / SKU / barcode...")).toBeNull();
    expect(screen.getByLabelText("Promotion name")).toBeTruthy();
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Drinks" }));
    expect(screen.getByText(/the Drinks category/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Drinks Deal" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("Discount percentage"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Category offer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Promotion" }));
    await waitFor(() => expect(mocks.api.pricing.createPromotionCampaign).toHaveBeenCalledWith(expect.objectContaining({ scope: "CATEGORY", categoryId: "drinks", audienceType: "ALL", type: "PERCENTAGE", value: 5 })));
    expect(mocks.api.pricing.createPromotionCampaign.mock.calls[0][0]).not.toHaveProperty("productId");
    view.unmount();
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.queryByPlaceholderText("Search name / SKU / barcode...")).toBeNull();
    expect(screen.getByText("All Products")).toBeTruthy();
  });

  it("loads existing PRODUCT campaign selection and cannot move its target on edit", async () => {
    mocks.api.pricing.promotionCampaigns.mockResolvedValue({ campaigns: [campaign] });
    renderPage("/price/promotion/add?edit=campaign-1");
    await waitFor(() => expect(screen.getByText("Selected Product")).toBeTruthy());
    expect(mocks.api.products.get).toHaveBeenCalledWith("coke");
    expect(mocks.api.products.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Individual" }).disabled).toBe(true);
    await waitFor(() => expect(screen.getByLabelText("Discount percentage").value).toBe("10"));
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));
    await waitFor(() => expect(mocks.api.pricing.updatePromotionCampaign).toHaveBeenCalledWith("campaign-1", expect.objectContaining({
      expectedVersion: 3, audienceType: "RETAIL", type: "PERCENTAGE", value: 10,
    })));
    expect(mocks.api.pricing.updatePromotionCampaign.mock.calls[0][1]).not.toHaveProperty("productId");
    expect(mocks.api.pricing.createPromotionCampaign).not.toHaveBeenCalled();
  });
});
