import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  api: {
    categories: { list: vi.fn() }, units: { list: vi.fn(), create: vi.fn() }, inventory: { list: vi.fn() },
    products: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../components/Barcode/BarcodeManagerDialog", () => ({ default: () => null }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: () => null }));

import AddProductPage from "./AddProductPage";

function renderPage(path = "/stock/add") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AddProductPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.categories.list.mockResolvedValue({ categories: [] });
  mocks.api.units.list.mockResolvedValue({ units: [{ id: "piece", name: "Piece", symbol: "pc", precision: 0, isActive: true }] });
  mocks.api.units.create.mockResolvedValue({ unit: { id: "carton", name: "Carton", symbol: "ctn", precision: 0, isActive: true } });
  mocks.api.inventory.list.mockResolvedValue({ inventory: [] });
  mocks.api.products.create.mockResolvedValue({ product: { id: "product-1" } });
  mocks.api.products.update.mockResolvedValue({ product: { id: "product-1" } });
});

afterEach(cleanup);

describe("Add/Edit Product units", () => {
  it("creates a UnitOfMeasure in the product form and submits Piece plus Carton", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Add Unit" })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Enter product name"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Unit" }));
    fireEvent.click(screen.getAllByRole("button", { name: "+ New Unit" })[1]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Carton" } });
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "ctn" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Unit" }));
    await waitFor(() => expect(mocks.api.units.create).toHaveBeenCalledWith({ name: "Carton", symbol: "ctn", precision: 0 }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add New Unit" })).toBeNull());
    fireEvent.change(screen.getByLabelText("Base pc per unit"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("MOQ"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.products.create).toHaveBeenCalledWith(expect.objectContaining({
      units: [
        expect.objectContaining({ unitId: "piece", isBase: true, conversionFactor: 1 }),
        expect.objectContaining({ unitId: "carton", isBase: false, conversionFactor: 24, minimumOrderQty: 3, canSell: true, canPurchase: true }),
      ],
    })));
  });

  it("persists an updated conversion and disabled purchasing on edit", async () => {
    mocks.api.products.get.mockResolvedValue({ product: {
      id: "product-1", name: "Coffee", price: 1000, cost: 750, minimumStock: 10,
      units: [
        { unitId: "piece", isBase: true, conversionFactor: "1", canSell: true, canPurchase: true },
        { unitId: "carton", isBase: false, conversionFactor: "24", minimumOrderQty: "3", canSell: true, canPurchase: true },
      ],
      barcodes: [],
    }, activeBarcode: null });
    mocks.api.units.list.mockResolvedValue({ units: [
      { id: "piece", name: "Piece", symbol: "pc", precision: 0, isActive: true },
      { id: "carton", name: "Carton", symbol: "ctn", precision: 0, isActive: true },
    ] });
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByLabelText("Base pc per unit")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Base pc per unit"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Purchase" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api.products.update).toHaveBeenCalledWith("product-1", expect.objectContaining({
      units: expect.arrayContaining([expect.objectContaining({ unitId: "carton", conversionFactor: 30, canPurchase: false })]),
    })));
  });
});
