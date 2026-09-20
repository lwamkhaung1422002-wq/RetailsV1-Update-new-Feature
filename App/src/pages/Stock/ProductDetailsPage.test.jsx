import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
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
  mocks.api.products.get.mockResolvedValue({
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
    hasSaleHistory: false,
  });
  mocks.api.inventory.movements.mockResolvedValue({ movements: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/stock/product-1"]}>
      <Routes><Route path="/stock/:productId" element={<ProductDetailsPage />} /></Routes>
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
  });
});
