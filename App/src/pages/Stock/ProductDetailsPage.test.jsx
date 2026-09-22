import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
  hasSaleHistory: false,
  api: {
    products: {
      get: vi.fn(),
      remove: vi.fn(),
      costHistory: vi.fn(),
      sourceHistory: vi.fn(),
    },
    inventory: { movements: vi.fn() },
  },
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));

import ProductDetailsPage from "./ProductDetailsPage";

beforeEach(() => {
  mocks.mobile = false;
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
  mocks.api.products.get.mockImplementation(async () => ({
    product: {
      id: "product-1",
      name: "Coffee",
      description: "Arabica",
      sku: "COF-1",
      category: { name: "Drinks" },
      barcodes: [],
      cost: 1_000,
      price: 1_500,
      currentStock: 2,
      minimumStock: 5,
      createdAt: "2026-09-19T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
    },
    activeBarcode: null,
    hasSaleHistory: mocks.hasSaleHistory,
  }));
  mocks.api.inventory.movements.mockResolvedValue({ movements: [] });
  mocks.api.products.costHistory.mockResolvedValue({ history: [] });
  mocks.api.products.sourceHistory.mockResolvedValue({ sources: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.hasSaleHistory = false;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/stock/product-1"]}>
      <Routes><Route path="/stock/:productId" element={<ProductDetailsPage />} /></Routes>
    </MemoryRouter>,
  );
}

function renderEmbedded(props = {}) {
  return render(
    <MemoryRouter>
      <ProductDetailsPage embeddedProductId="product-1" {...props} />
    </MemoryRouter>,
  );
}

describe("Product Details inventory polish", () => {
  it.each([
    ["desktop", false],
    ["mobile", true],
  ])("uses persisted stock values and preserves history controls on %s", async (_view, mobile) => {
    mocks.mobile = mobile;
    renderPage();

    expect(await screen.findByText("Total Stock Value")).toBeTruthy();
    expect(screen.getByText(/2,000/)).toBeTruthy();
    expect(screen.getByText("5 pcs")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.queryByText("Product History")).toBeNull();
    expect(screen.getByLabelText("View cost price history")).toBeTruthy();
    expect(screen.getByLabelText("View stock source history")).toBeTruthy();
    expect(screen.getByLabelText("Edit product").hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText("Delete product")).toBeTruthy();
  });

  it.each([
    ["desktop", false, false],
    ["desktop", false, true],
    ["mobile", true, false],
    ["mobile", true, true],
  ])("matches the Product List edit rule on %s (mobile: %s) when sale history is %s", async (_view, mobile, hasSaleHistory) => {
    mocks.mobile = mobile;
    mocks.hasSaleHistory = hasSaleHistory;
    renderPage();

    const edit = await screen.findByLabelText("Edit product");
    const remove = screen.getByLabelText("Delete product");
    expect(edit.hasAttribute("disabled")).toBe(hasSaleHistory);
    expect(remove.hasAttribute("disabled")).toBe(hasSaleHistory);
  });

  it("adds only the desktop embedded close control and preserves both history dialogs", async () => {
    const onClose = vi.fn();
    renderEmbedded({ embeddedOnClose: onClose });

    expect(await screen.findByText("Total Stock Value")).toBeTruthy();
    expect(screen.queryByLabelText("Back to inventory")).toBeNull();
    fireEvent.click(screen.getByLabelText("View cost price history"));
    expect(await screen.findByText("Cost Price History")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("View stock source history"));
    expect(await screen.findByText("Stock Source History")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close product details"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the mobile route header and back control unchanged", async () => {
    mocks.mobile = true;
    renderPage();
    expect(await screen.findByLabelText("Back to inventory")).toBeTruthy();
    expect(screen.queryByLabelText("Close product details")).toBeNull();
  });
});
