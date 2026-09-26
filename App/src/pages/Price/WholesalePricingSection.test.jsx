import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ wholesalePricing: vi.fn(), saveWholesalePricing: vi.fn(), canEdit: true }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission) => permission === "price.edit" && mocks.canEdit }) }));
vi.mock("../../hooks/useApiResource", () => {
  const api = { pricing: mocks };
  return { usePosApi: () => api };
});
import WholesalePricingSection from "./WholesalePricingSection";

const product = { id: "coke", name: "Coke", units: [
  { id: "piece-unit", isBase: true, canSell: true, unit: { name: "Piece", isActive: true } },
  { id: "carton-unit", isBase: false, canSell: true, unit: { name: "Carton", isActive: true } },
] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canEdit = true;
  mocks.wholesalePricing.mockResolvedValue({ tiers: [] });
  mocks.saveWholesalePricing.mockResolvedValue({ tiers: [] });
});
afterEach(cleanup);

describe("Wholesale Pricing section", () => {
  it("uses a selected selling unit and saves quantity levels without price-group IDs", async () => {
    render(<WholesalePricingSection product={product} />);
    await waitFor(() => expect(mocks.wholesalePricing).toHaveBeenCalledWith("coke"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Unit" }));
    fireEvent.click(await screen.findByRole("option", { name: "Carton" }));
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getByLabelText("Minimum Qty"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Price / Carton"), { target: { value: "20500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    await waitFor(() => expect(mocks.saveWholesalePricing).toHaveBeenCalledWith("coke", {
      productUnitId: "carton-unit", variantId: null, levels: [{ minimumQuantity: 5, unitPrice: 20500 }],
    }));
  }, 20000);

  it("shows tiers read-only without price.edit", async () => {
    mocks.canEdit = false;
    mocks.wholesalePricing.mockResolvedValue({ tiers: [{ id: "tier-1", productUnitId: "piece-unit", variantId: null, minimumQuantity: 1, unitPrice: 1_000 }] });
    render(<WholesalePricingSection product={product} />);
    expect(await screen.findByLabelText("Minimum Qty")).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Save Wholesale Pricing" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Price Level/ })).toBeNull();
  });
});
