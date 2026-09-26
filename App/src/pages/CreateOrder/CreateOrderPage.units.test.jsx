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
  customers: [],
}));

const units = [
  { id: "piece-product-unit", unitId: "piece", isBase: true, canSell: true, conversionFactor: 1, minimumOrderQty: null, unit: { name: "Piece", symbol: "pc" } },
  { id: "carton-product-unit", unitId: "carton", canSell: true, conversionFactor: 24, minimumOrderQty: 3, unit: { name: "Carton", symbol: "ctn" } },
];

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  useProductsQuery: () => ({ data: { products: [{ id: "product-1", name: "Coffee", price: 1000, currentStock: 120, units, barcodes: [] }] }, error: null, refetch: vi.fn() }),
  useAllCustomersQuery: () => ({ data: { customers: mocks.customers } }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../components/BarcodeScanner/BarcodeScannerDialog", () => ({ default: ({ open, onDetected }) => open ? <button onClick={() => onDetected("123456")}>Detect barcode</button> : null }));
vi.mock("../Customers/CustomerDialog", () => ({ default: ({ open, onSaved }) => open ? <button onClick={() => onSaved({ id: "new-customer", name: "New Customer", priceGroupId: null })}>Save new customer</button> : null }));

import CreateOrderPage from "./CreateOrderPage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customers = [];
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

  it("reprices an existing cart from walk-in to legacy saved customers and back", async () => {
    mocks.customers = [
      { id: "legacy-retail", name: "ABC Trading", priceGroupId: null },
      { id: "legacy-wholesale", name: "Retail Buyer", priceGroupId: "old-group" },
    ];
    mocks.api.pricing.resolve.mockImplementation(async ({ customerId, quantity }) => {
      const tierUnitPrice = customerId && quantity >= 20 ? 800 : customerId && quantity >= 10 ? 900 : null;
      return { pricing: { regularUnitPrice: 1000, tierUnitPrice, finalUnitPrice: tierUnitPrice ?? 1000, promotionId: null } };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CreateOrderPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Coffee" }));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ productId: "product-1", customerId: null })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const customerInput = screen.getByPlaceholderText("Search or select customer...");
    fireEvent.change(customerInput, { target: { value: "ABC" } });
    fireEvent.click(await screen.findByText("ABC Trading"));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ productId: "product-1", customerId: "legacy-retail", quantity: 1 })));
    fireEvent.change(screen.getByLabelText("Quantity for Coffee"), { target: { value: "10" } });
    fireEvent.blur(screen.getByLabelText("Quantity for Coffee"));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ customerId: "legacy-retail", quantity: 10 })));
    await waitFor(() => expect(screen.getAllByText(/9,000/).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText("Quantity for Coffee"), { target: { value: "20" } });
    fireEvent.blur(screen.getByLabelText("Quantity for Coffee"));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ customerId: "legacy-retail", quantity: 20 })));
    await waitFor(() => expect(screen.getAllByText(/16,000/).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByPlaceholderText("Search or select customer..."), { target: { value: "Retail" } });
    fireEvent.click(await screen.findByText("Retail Buyer"));
    await waitFor(() => expect(mocks.api.pricing.resolve.mock.calls.at(-1)?.[0]).toMatchObject({ productId: "product-1", customerId: "legacy-wholesale", quantity: 20 }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(mocks.api.pricing.resolve.mock.calls.at(-1)?.[0]).toMatchObject({ productId: "product-1", customerId: null, quantity: 20 }));
    await waitFor(() => expect(screen.getAllByText(/20,000/).length).toBeGreaterThan(0));
  });

  it.each([null, "legacy-retail"])("barcode add uses %s customer context", async (customerId) => {
    mocks.customers = [{ id: "legacy-retail", name: "ABC Trading", priceGroupId: null }];
    mocks.api.pricing.barcodeLookup.mockResolvedValue({ known: true, product: { id: "product-1" }, pricing: { regularUnitPrice: 1000, finalUnitPrice: 1000, promotionId: null } });
    mocks.api.pricing.resolve.mockImplementation(async () => ({ pricing: { regularUnitPrice: 1000, tierUnitPrice: 900, finalUnitPrice: 900, promotionId: null } }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CreateOrderPage /></MemoryRouter></QueryClientProvider>);
    if (customerId) {
      fireEvent.change(screen.getByPlaceholderText("Search or select customer..."), { target: { value: "ABC" } });
      fireEvent.click(await screen.findByText("ABC Trading"));
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Scan barcode" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Detect barcode" }));
    await waitFor(() => expect(mocks.api.pricing.barcodeLookup).toHaveBeenCalledWith("123456"));
    if (customerId) {
      await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ customerId })));
      await waitFor(() => expect(screen.getAllByText(/900/).length).toBeGreaterThan(0));
    } else {
      await waitFor(() => expect(screen.getByLabelText("Quantity for Coffee")).toBeTruthy());
      expect(mocks.api.pricing.resolve).not.toHaveBeenCalled();
    }
  });

  it("reprices an existing cart as soon as Add New Customer saves", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CreateOrderPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Coffee" }));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ customerId: null })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add New Customer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save new customer" }));
    await waitFor(() => expect(mocks.api.pricing.resolve).toHaveBeenCalledWith(expect.objectContaining({ customerId: "new-customer" })));
  });
});
