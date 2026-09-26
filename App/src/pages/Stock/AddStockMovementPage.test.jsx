import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: true,
  multiUnit: false,
  api: {
    inventory: { create: vi.fn(), adjust: vi.fn(), adjustByCost: vi.fn() },
    pricing: { barcodeLookup: vi.fn() },
    products: { get: vi.fn() },
  },
  runWithApproval: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: mocks.runWithApproval }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useAllActiveProductsQuery: () => ({
    data: { products: [{ id: "product-1", name: "Coffee", sku: "COF-1", currentStock: 4, cost: 500, barcodes: [], units: mocks.multiUnit ? [
      { id: "piece-product-unit", unitId: "piece", isBase: true, canPurchase: true, conversionFactor: 1, unit: { name: "Piece" } },
      { id: "carton-product-unit", unitId: "carton", canPurchase: true, conversionFactor: 24, unit: { name: "Carton" } },
    ] : [] }] },
    isLoading: false,
    error: null,
  }),
  useInventoryQuery: () => ({ data: { inventory: [{ id: "batch-1", productId: "product-1", quantity: 4, reservedQuantity: 0, unitCost: 500 }] } }),
}));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: () => null }));

import AddStockMovementPage from "./AddStockMovementPage";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/stock/movement/add"]}>
        <AddStockMovementPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function selectProductAndQuantity() {
  fireEvent.change(screen.getByPlaceholderText("Search product or enter barcode"), { target: { value: "Coffee" } });
  fireEvent.change(screen.getByLabelText("Quantity *"), { target: { value: "2" } });
}

beforeEach(() => {
  mocks.multiUnit = false;
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
  mocks.api.inventory.create.mockResolvedValue({ inventoryBatch: { id: "batch-2" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Add Stock movement polish", () => {
  it("saves Stock In without Notes and returns to Inventory", async () => {
    mocks.mobile = true;
    renderPage();
    selectProductAndQuantity();

    fireEvent.click(screen.getByRole("button", { name: "Save Stock In" }));

    await waitFor(() => expect(mocks.api.inventory.create).toHaveBeenCalledWith(expect.not.objectContaining({ note: expect.anything() })));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/stock"));
  });

  it("selects cartons for Stock In and submits entered quantity and carton cost", async () => {
    mocks.mobile = true;
    mocks.multiUnit = true;
    renderPage();
    selectProductAndQuantity();
    fireEvent.mouseDown(screen.getByLabelText("Purchase Unit"));
    fireEvent.click(screen.getByRole("option", { name: "Carton" }));
    fireEvent.change(screen.getByLabelText("Quantity *"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Cost Price *"), { target: { value: "18000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Stock In" }));
    await waitFor(() => expect(mocks.api.inventory.create).toHaveBeenCalledWith(expect.objectContaining({
      unitId: "carton", quantity: 10, unitCost: 18_000,
    })));
  });

  it("keeps a Reason required for Stock Adjustment", () => {
    mocks.mobile = true;
    renderPage();
    selectProductAndQuantity();
    fireEvent.click(screen.getByRole("button", { name: "Stock Adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Adjustment" }));

    expect(screen.getByText("Notes are required")).toBeTruthy();
    expect(mocks.api.inventory.adjust).not.toHaveBeenCalled();
  });

  it("returns a successful Stock Adjustment to Inventory", async () => {
    mocks.mobile = true;
    mocks.api.inventory.adjust.mockResolvedValue({ adjustment: { id: "adjustment-1" } });
    mocks.runWithApproval.mockImplementation((_request, execute) => execute("approval-token"));
    renderPage();
    selectProductAndQuantity();
    fireEvent.click(screen.getByRole("button", { name: "Stock Adjustment" }));
    fireEvent.change(screen.getByLabelText("Notes *"), { target: { value: "Count correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Adjustment" }));

    await waitFor(() => expect(mocks.api.inventory.adjust).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/stock"));
  });

  it("returns Mobile Back to Inventory", () => {
    mocks.mobile = true;
    renderPage();
    fireEvent.click(screen.getByLabelText("Back to inventory"));
    expect(screen.getByTestId("location").textContent).toBe("/stock");
  });

  it("removes only the Desktop subtitle", () => {
    mocks.mobile = false;
    renderPage();
    expect(screen.getByText("Add Stock Movement")).toBeTruthy();
    expect(screen.queryByText("Record stock in or an inventory adjustment.")).toBeNull();
  });
});
