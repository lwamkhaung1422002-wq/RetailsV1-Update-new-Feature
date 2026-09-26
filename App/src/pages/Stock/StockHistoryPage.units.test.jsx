import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({ movements: vi.fn() }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => ({ inventory: { movements: mocks.movements } }) }));

import StockHistoryPage from "./StockHistoryPage";

afterEach(cleanup);

describe("stock history entered unit", () => {
  it("shows the saved carton quantity with its selected unit", async () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.movements.mockResolvedValue({ movements: [{
      id: "movement-1", direction: "IN", enteredQuantity: "10", baseQuantity: "240", conversionFactor: "24",
      unit: { symbol: "ctn" }, product: { name: "Coffee", barcodes: [] }, occurredAt: "2026-09-26T00:00:00.000Z",
      type: "OPENING", sourceId: "batch-1", unitCost: 750,
    }] });
    render(<MemoryRouter><StockHistoryPage /></MemoryRouter>);
    expect(await screen.findByText("+10 ctn")).toBeTruthy();
  });
});
