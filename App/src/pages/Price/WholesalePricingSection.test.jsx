import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ wholesalePricing: vi.fn(), saveWholesalePricing: vi.fn(), canEdit: true }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission) => permission === "price.edit" && mocks.canEdit }) }));
vi.mock("../../hooks/useApiResource", () => {
  const api = { pricing: mocks };
  return { usePosApi: () => api };
});
import WholesalePricingSection from "./WholesalePricingSection";

const product = { id: "coke", name: "Coke", cost: 800, units: [
  { id: "piece-unit", isBase: true, canSell: true, conversionFactor: 1, unit: { name: "Piece", isActive: true } },
  { id: "carton-unit", isBase: false, canSell: true, conversionFactor: 24, unit: { name: "Carton", isActive: true } },
] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canEdit = true;
  mocks.wholesalePricing.mockResolvedValue({ tiers: [] });
  mocks.saveWholesalePricing.mockResolvedValue({ tiers: [] });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(cleanup);

describe("Wholesale Pricing section", () => {
  it("uses a selected selling unit and saves quantity levels without price-group IDs", async () => {
    render(<WholesalePricingSection product={product} />);
    await waitFor(() => expect(mocks.wholesalePricing).toHaveBeenCalledWith("coke"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Selling Unit" }));
    fireEvent.click(await screen.findByRole("option", { name: "Carton" }));
    fireEvent.click(screen.getByRole("button", { name: "Fixed Price" }));
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

  it("defaults a new target to Margin %, computes carton price, and saves only existing tier fields via the footer interface", async () => {
    const ref = createRef();
    render(<WholesalePricingSection ref={ref} product={product} hideSaveButton />);
    await waitFor(() => expect(screen.queryByText("Loading Wholesale Pricing…")).toBeNull());
    expect(screen.getByRole("button", { name: "Margin %" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Selling Unit" }));
    fireEvent.click(await screen.findByRole("option", { name: "Carton" }));
    expect(screen.getByText("1 Carton = 24 Pieces")).toBeTruthy();
    expect(screen.getByText("Cost / Carton").nextSibling.textContent).toBe("19,200");
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getByLabelText("Minimum Qty"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    expect(screen.getByLabelText("Price / Carton").value).toBe("22080");
    expect(screen.getByLabelText("Price / Carton").readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Save Wholesale Pricing" })).toBeNull();
    await act(async () => { await ref.current.save(); });
    expect(mocks.saveWholesalePricing).toHaveBeenCalledWith("coke", {
      productUnitId: "carton-unit", variantId: null, levels: [{ minimumQuantity: 1, unitPrice: 22080 }],
    });
  });

  it("defaults saved tiers to Fixed Price and preserves their payload unchanged", async () => {
    mocks.wholesalePricing.mockResolvedValue({ tiers: [{ id: "tier-1", productUnitId: "piece-unit", variantId: null, minimumQuantity: 1, unitPrice: 1000 }] });
    render(<WholesalePricingSection product={product} />);
    await waitFor(() => expect(screen.getByLabelText("Price / Piece").value).toBe("1000"));
    expect(screen.getByRole("button", { name: "Fixed Price" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    await waitFor(() => expect(mocks.saveWholesalePricing).toHaveBeenCalledWith("coke", {
      productUnitId: "piece-unit", variantId: null, levels: [{ id: "tier-1", minimumQuantity: 1, unitPrice: 1000 }],
    }));
  });

  it("derives an implied margin from a saved fixed price and rejects duplicate quantities or below-cost prices", async () => {
    mocks.wholesalePricing.mockResolvedValue({ tiers: [{ id: "tier-1", productUnitId: "piece-unit", variantId: null, minimumQuantity: 1, unitPrice: 880 }] });
    render(<WholesalePricingSection product={product} />);
    await screen.findByLabelText("Price / Piece");
    fireEvent.click(screen.getByRole("button", { name: "Margin %" }));
    expect(screen.getByLabelText("Margin %").value).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getAllByLabelText("Minimum Qty")[1], { target: { value: "1" } });
    fireEvent.change(screen.getAllByLabelText("Margin %")[1], { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    expect(screen.getByText(/unique positive minimum quantities/)).toBeTruthy();
    expect(mocks.saveWholesalePricing).not.toHaveBeenCalled();
    fireEvent.change(screen.getAllByLabelText("Minimum Qty")[1], { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Margin %")[1], { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    expect(screen.getByText(/cannot be below Cost/)).toBeTruthy();
    expect(mocks.saveWholesalePricing).not.toHaveBeenCalled();
  });

  it("handles zero cost without NaN/Infinity and stacks mobile price levels", async () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<WholesalePricingSection product={{ ...product, cost: 0 }} />);
    await waitFor(() => expect(screen.queryByText("Loading Wholesale Pricing…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    expect(screen.getByText("Price Level 1")).toBeTruthy();
    expect(screen.getByText(/Margin % cannot be calculated from zero cost/)).toBeTruthy();
    expect(screen.getByLabelText("Price / Piece").value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    expect(mocks.saveWholesalePricing).not.toHaveBeenCalled();
  });

  it("uses selected variant cost and rejects invalid margin before saving", async () => {
    render(<WholesalePricingSection product={{ ...product, variants: [{ id: "large", name: "Large", cost: 900 }] }} />);
    await waitFor(() => expect(screen.queryByText("Loading Wholesale Pricing…")).toBeNull());
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Variant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Large" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Selling Unit" }));
    fireEvent.click(await screen.findByRole("option", { name: "Carton" }));
    expect(screen.getByText("Cost / Carton").nextSibling.textContent).toBe("21,600");
    fireEvent.click(screen.getByRole("button", { name: /Add Price Level/ }));
    fireEvent.change(screen.getByLabelText("Minimum Qty"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "1e309" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Wholesale Pricing" }));
    expect(screen.getByText(/valid prices or margins/)).toBeTruthy();
    expect(mocks.saveWholesalePricing).not.toHaveBeenCalled();
  });

  it("does not save or replace tiers if existing Wholesale Pricing failed to load", async () => {
    mocks.wholesalePricing.mockRejectedValue(new Error("Unable to load existing tiers."));
    const ref = createRef();
    const onStatusChange = vi.fn();
    render(<WholesalePricingSection ref={ref} product={product} hideSaveButton onStatusChange={onStatusChange} />);
    expect(await screen.findByText("Unable to load existing tiers.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add Price Level/ }).disabled).toBe(true);
    await act(async () => { expect(await ref.current.save()).toBe(false); });
    expect(mocks.saveWholesalePricing).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenLastCalledWith({ loading: false, saving: false, available: false });
  });
});
