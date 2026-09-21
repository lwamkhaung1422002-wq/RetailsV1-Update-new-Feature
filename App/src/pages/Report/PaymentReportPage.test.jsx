import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
  data: {
    summary: { collected: 1000, refunds: 100, netCollected: 900, outstanding: 250 },
    methods: [{ method: "Cash", collected: 1000, refunds: 100, netCollected: 900 }],
    recent: [{ id: "payment-1", type: "Collection", source: "INV-1", paidAt: "2026-09-21T08:00:00.000Z", method: "Cash", actor: { name: "John" }, amount: 900 }],
    staff: [{ id: "staff-1", name: "John" }],
  },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/useApiResource", () => ({
  usePosApi: () => ({ reports: { payments: vi.fn() } }),
  useApiResource: () => ({ data: mocks.data, loading: false, error: null, reload: vi.fn() }),
}));

import { paymentMethodGridColumns } from "../../lib/payment-report-layout";
import PaymentReportPage from "./PaymentReportPage";

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
});

afterEach(() => {
  cleanup();
  mocks.mobile = false;
});

describe("Payment Report responsive layout", () => {
  it("stacks payment method values in one shrink-safe column on mobile", () => {
    const viewportWidth = 320;
    expect(paymentMethodGridColumns(viewportWidth <= 768)).toBe("minmax(0,1fr)");
  });

  it("preserves the existing four-column desktop layout", () => {
    expect(paymentMethodGridColumns(false)).toBe("1fr repeat(3,minmax(90px,1fr))");
  });

  it.each([
    ["desktop", false],
    ["mobile", true],
  ])("continues rendering approved report data on %s", (_view, mobile) => {
    mocks.mobile = mobile;
    render(<MemoryRouter><PaymentReportPage /></MemoryRouter>);

    expect(screen.getByText("Payment Methods")).toBeTruthy();
    expect(screen.getByText("Recent Payments")).toBeTruthy();
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    expect(screen.getByText("Collection")).toBeTruthy();
    expect(screen.getByText("INV-1")).toBeTruthy();
  });
});
