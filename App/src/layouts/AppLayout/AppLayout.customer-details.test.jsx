import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  creditReport: vi.fn(),
  notifications: vi.fn(),
}));

vi.mock("../../components/AppDrawer/AppDrawer", () => ({ default: () => null }));
vi.mock("../../components/MobileBottomNavigation/MobileBottomNavigation", () => ({ default: () => <div data-testid="mobile-bottom-navigation" /> }));
vi.mock("../../routeChunks", () => ({ prefetchCommonRouteChunks: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isGuest: false, shop: { id: "shop-1", name: "POS System" }, user: { shops: [] }, hasPermission: () => true }),
}));
vi.mock("../../context/AppPreferenceContext", () => ({ useAppPreferences: () => ({ t: (value) => value }) }));
vi.mock("../../hooks/useApiResource", () => ({
  usePosApi: () => ({
    customers: { get: mocks.get, creditReport: mocks.creditReport },
    notifications: { list: mocks.notifications },
  }),
}));

import AppLayout from "./AppLayout";
import CustomerDetailsPage from "../../pages/Customers/CustomerDetailsPage";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  mocks.get.mockResolvedValue({ customer: { id: "customer-1", name: "Aye Aye", pricingType: "RETAIL", hasHistory: false, effectiveCreditLimit: 50_000, effectivePaymentTermsDays: 30 } });
  mocks.creditReport.mockResolvedValue({ report: { effectiveCreditLimit: 50_000, outstanding: 0, availableCredit: 50_000, overdueAmount: 0, creditInvoices: 0, recentInvoices: [] } });
  mocks.notifications.mockResolvedValue({ notifications: [] });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("mobile Customer Details route", () => {
  it("uses one stable local AppBar and hides the global header and bottom navigation", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/customers/customer-1"]}><Routes>
      <Route element={<AppLayout />}>
        <Route path="/customers/:customerId" element={<CustomerDetailsPage />} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("Customer Information")).toBeTruthy());
    const header = screen.getByRole("banner");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(header.textContent).toBe("Customer Details");
    expect(screen.getByLabelText("Back to Customers")).toBeTruthy();
    expect(screen.getByLabelText("Customer actions")).toBeTruthy();
    expect(screen.queryByText("POS System")).toBeNull();
    expect(screen.queryByTestId("mobile-bottom-navigation")).toBeNull();
    const toolbar = header.querySelector(".MuiToolbar-root");
    expect(getComputedStyle(toolbar).gridTemplateColumns).toBe("48px minmax(0, 1fr) 48px");
    fireEvent.scroll(window);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("banner")).toBe(header);
  });
});
