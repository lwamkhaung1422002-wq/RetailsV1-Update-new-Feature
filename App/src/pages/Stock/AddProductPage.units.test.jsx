import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({ api: {
  categories: { list: vi.fn() }, units: { list: vi.fn(), create: vi.fn() }, inventory: { list: vi.fn() },
  products: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
} }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../components/Barcode/BarcodeManagerDialog", () => ({ default: () => null }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: () => null }));
import AddProductPage from "./AddProductPage";

const piece = { id: "piece", name: "Piece", symbol: "pc", precision: 0, isActive: true };
const carton = { id: "carton", name: "Carton", symbol: "ctn", precision: 0, isActive: true };
const base = { unitId: "piece", isBase: true, conversionFactor: "1", canSell: true, canPurchase: true };
const extra = { unitId: "carton", isBase: false, conversionFactor: "24", minimumOrderQty: "3", canSell: true, canPurchase: true };

function renderPage(path = "/stock/add") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AddProductPage /></MemoryRouter></QueryClientProvider>);
}
function editProduct(units, baseUnitLocked = false) {
  mocks.api.products.get.mockResolvedValue({ product: { id: "product-1", name: "Coffee", price: 1000, cost: 750, minimumStock: 10, units, barcodes: [] }, activeBarcode: null, baseUnitLocked });
}
async function chooseUnit(name) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Unit" }));
  fireEvent.click(await screen.findByRole("option", { name }));
}
beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.api.categories.list.mockResolvedValue({ categories: [] });
  mocks.api.units.list.mockResolvedValue({ units: [piece, carton] });
  mocks.api.units.create.mockResolvedValue({ unit: carton });
  mocks.api.inventory.list.mockResolvedValue({ inventory: [] });
  mocks.api.products.create.mockResolvedValue({ product: { id: "product-1" } });
  mocks.api.products.update.mockResolvedValue({ product: { id: "product-1" } });
});
afterEach(cleanup);

describe("Add/Edit Product unit refinement", () => {
  it("shows one optional blank row, hides flags, and saves only the base unit", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("combobox", { name: "Unit" })).toHaveLength(1));
    expect(screen.getByText("Additional Units (Optional)")).toBeTruthy();
    expect(screen.getAllByLabelText("Quantity")).toHaveLength(1);
    expect(screen.getAllByLabelText("Minimum Sale Qty")).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: "Sell" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Purchase" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New Unit" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Add Another Unit" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Enter product name"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.products.create).toHaveBeenCalledWith(expect.objectContaining({
      units: [{ unitId: "piece", isBase: true, conversionFactor: 1, canSell: true, canPurchase: true }],
    })));
  });

  it.each(["unit", "conversion", "minimum"])("rejects a partial %s row", async (part) => {
    renderPage();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit" })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Enter product name"), { target: { value: "Coffee" } });
    if (part === "unit") await chooseUnit("Carton");
    if (part === "conversion") fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "24" } });
    if (part === "minimum") fireEvent.change(screen.getByLabelText("Minimum Sale Qty"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.api.products.create).not.toHaveBeenCalled();
    expect(screen.getByText(/Choose distinct units with valid conversion factors/)).toBeTruthy();
  });

  it("creates a UOM from the Unit dropdown, selects it, and preserves form state", async () => {
    mocks.api.units.list.mockResolvedValue({ units: [piece] });
    renderPage();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit" })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Enter product name"), { target: { value: "Coffee" } });
    await chooseUnit("+ Create New Unit");
    expect(screen.getByRole("dialog", { name: "Create New Unit" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Symbol")).toBeTruthy();
    expect(screen.queryByLabelText("Decimal Places")).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Carton" } });
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "ctn" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocks.api.units.create).toHaveBeenCalledWith({ name: "Carton", symbol: "ctn", precision: 0 }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create New Unit" })).toBeNull());
    expect(screen.getByRole("combobox", { name: "Unit" }).textContent).toContain("Carton");
    expect(screen.getByPlaceholderText("Enter product name").value).toBe("Coffee");
    expect(screen.getByText("1 Carton =")).toBeTruthy();
    expect(screen.getAllByText("Piece").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Minimum Sale Qty"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api.products.create).toHaveBeenCalledWith(expect.objectContaining({
      units: [
        expect.objectContaining({ unitId: "piece", isBase: true, canSell: true, canPurchase: true }),
        expect.objectContaining({ unitId: "carton", isBase: false, conversionFactor: 24, minimumOrderQty: 3, canSell: true, canPurchase: true }),
      ],
    })));
  });

  it("edits an active unit without an extra blank row or Sell/Purchase controls", async () => {
    editProduct([base, extra]);
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByText("1 Carton =")).toBeTruthy());
    expect(screen.getAllByLabelText("Quantity")).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: "Sell" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Purchase" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api.products.update).toHaveBeenCalledWith("product-1", expect.objectContaining({
      units: expect.arrayContaining([expect.objectContaining({ unitId: "carton", conversionFactor: 30, canSell: true, canPurchase: true })]),
    })));
  });

  it("updates conversion wording when the base and additional units change", async () => {
    const pack = { id: "pack", name: "Pack", symbol: "pk", precision: 0, isActive: true };
    mocks.api.units.list.mockResolvedValue({ units: [piece, pack, carton] });
    renderPage();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit" })).toBeTruthy());
    await chooseUnit("Carton");
    expect(screen.getByText("1 Carton =")).toBeTruthy();
    expect(screen.getAllByText("Piece").length).toBeGreaterThan(0);
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Pack" }));
    expect(screen.getAllByRole("combobox")[0].textContent).toContain("Pack");
    expect(screen.getAllByText("Pack").length).toBeGreaterThan(1);
  });

  it("removes an active additional unit while retaining the required base", async () => {
    editProduct([base, extra]);
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByText("1 Carton =")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("combobox", { name: "Unit" }).textContent).not.toContain("Carton");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api.products.update).toHaveBeenCalledWith("product-1", expect.objectContaining({
      units: [{ unitId: "piece", isBase: true, conversionFactor: 1, canSell: true, canPurchase: true }],
    })));
  });

  it("shows a used-unit removal rejection from the backend", async () => {
    editProduct([base, extra]);
    mocks.api.products.update.mockRejectedValue(new Error("Carton has transaction or configuration history and cannot be removed."));
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByText("1 Carton =")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByText("Carton has transaction or configuration history and cannot be removed.")).toBeTruthy());
  });

  it("does not display or reactivate a legacy false/false unit", async () => {
    editProduct([base, { ...extra, canSell: false, canPurchase: false }]);
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit" })).toBeTruthy());
    expect(screen.getByRole("combobox", { name: "Unit" }).textContent).not.toContain("Carton");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api.products.update).toHaveBeenCalledWith("product-1", expect.objectContaining({
      units: [{ unitId: "piece", isBase: true, conversionFactor: 1, canSell: true, canPurchase: true }],
    })));
  });

  it("locks a historical base unit while an unused base unit remains selectable", async () => {
    editProduct([base], true);
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getByText("Base unit cannot be changed after stock or sales activity.")).toBeTruthy());
    expect(screen.getAllByRole("combobox")[0].getAttribute("aria-disabled")).toBe("true");
    cleanup();
    editProduct([base], false);
    renderPage("/stock/add?edit=product-1");
    await waitFor(() => expect(screen.getAllByRole("combobox")[0].getAttribute("aria-disabled")).not.toBe("true"));
  });
});
