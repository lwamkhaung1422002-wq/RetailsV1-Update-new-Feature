import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: true,
  permissions: new Set(),
  shop: { id: "shop-1", name: "Main Shop", role: "CASHIER", isOwner: false },
  logout: vi.fn(),
  api: {
    shop: { getSettings: vi.fn().mockResolvedValue({ settings: {} }), updateSettings: vi.fn() },
    notifications: { list: vi.fn().mockResolvedValue({ notifications: [] }), markRead: vi.fn() },
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    shop: mocks.shop,
    user: { id: "user-1", shops: [mocks.shop] },
    logout: mocks.logout,
    selectShop: vi.fn(),
    hasPermission: (permission) => mocks.permissions.has(permission),
  }),
}));
vi.mock("../../context/AppPreferenceContext", () => ({
  useAppPreferences: () => ({ shop: { name: "Main Shop", address: "", logo: "" }, setShop: vi.fn(), uiLanguage: "English", setUiLanguage: vi.fn(), t: (value) => value }),
}));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../routeChunks", () => ({ prefetchSettingsRouteChunks: vi.fn().mockResolvedValue([]) }));
vi.mock("../../components/Barcode/BarcodeManagerDialog", () => ({ default: () => null }));

import MobileBottomNavigation from "../../components/MobileBottomNavigation/MobileBottomNavigation";
import Header from "../../components/Header/Header";
import SettingsPage from "./SettingsPage";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderAt(element, path = "/settings") {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

function setAccess({ role, isOwner = false, permissions = [] }) {
  mocks.shop = { id: "shop-1", name: "Main Shop", role, isOwner };
  mocks.permissions = new Set(permissions);
}

beforeEach(() => {
  mocks.mobile = true;
  setAccess({ role: "CASHIER" });
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
  vi.clearAllMocks();
});

describe("Mobile More navigation", () => {
  it.each(["OWNER", "MANAGER", "CASHIER", "STOCK_STAFF"])("shows More to %s without requiring settings.manage and keeps /settings", (role) => {
    setAccess({ role, isOwner: role === "OWNER" });
    renderAt(<><MobileBottomNavigation /><LocationProbe /></>, "/");
    fireEvent.click(screen.getByText("More"));
    expect(screen.getByTestId("location").textContent).toBe("/settings");
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("keeps Owner management destinations available without exposing Branches", () => {
    setAccess({ role: "OWNER", isOwner: true, permissions: ["payment.view", "supplier.view", "price.view", "report.viewSales", "audit.view", "settings.manage"] });
    renderAt(<SettingsPage />);
    for (const label of ["Payment", "Suppliers", "Price & Promotion", "Sale Report", "Product Report", "Payment Report", "Operations", "Shop Details", "Categories", "Payment Methods", "Staff & Access"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("Branches")).toBeNull();
  });

  it("keeps Customer Credit off Settings because Credit Defaults is on Customers", () => {
    setAccess({ role: "OWNER", isOwner: true, permissions: ["settings.manage"] });
    const mobileView = renderAt(<SettingsPage />);
    expect(screen.queryByText("Customer Credit")).toBeNull();
    mobileView.unmount();
    mocks.mobile = false;
    renderAt(<SettingsPage />);
    expect(screen.queryByText("Customer Credit")).toBeNull();
  });

  it("shows Manager only authorized feature rows while preserving existing Staff access", () => {
    setAccess({ role: "MANAGER", permissions: ["payment.view", "report.viewSales"] });
    renderAt(<SettingsPage />);
    expect(screen.getByText("Payment")).toBeTruthy();
    expect(screen.getByText("Sale Report")).toBeTruthy();
    expect(screen.getByText("Staff & Access")).toBeTruthy();
    expect(screen.queryByText("Suppliers")).toBeNull();
    expect(screen.queryByText("Shop Details")).toBeNull();
    expect(screen.queryByText("Operations")).toBeNull();
  });

  it("shows Cashier payment and reports without settings-only or Staff rows", () => {
    setAccess({ role: "CASHIER", permissions: ["payment.view", "report.viewSales"] });
    renderAt(<SettingsPage />);
    expect(screen.getByText("Payment")).toBeTruthy();
    expect(screen.getByText("Sale Report")).toBeTruthy();
    expect(screen.getByText("Product Report")).toBeTruthy();
    expect(screen.getByText("Payment Report")).toBeTruthy();
    expect(screen.queryByText("Shop Details")).toBeNull();
    expect(screen.queryByText("Categories")).toBeNull();
    expect(screen.queryByText("Payment Methods")).toBeNull();
    expect(screen.queryByText("Staff & Access")).toBeNull();
  });

  it("shows Stock Staff Suppliers only while that permission exists", () => {
    setAccess({ role: "STOCK_STAFF", permissions: ["supplier.view"] });
    const view = renderAt(<SettingsPage />);
    expect(screen.getByText("Suppliers")).toBeTruthy();
    expect(screen.queryByText("Payment")).toBeNull();
    expect(screen.queryByText("Shop Details")).toBeNull();
    mocks.permissions = new Set();
    view.rerender(<MemoryRouter initialEntries={["/settings"]}><SettingsPage /></MemoryRouter>);
    expect(screen.queryByText("Suppliers")).toBeNull();
  });

  it("uses More in the mobile header while Desktop remains Settings", () => {
    const mobileView = renderAt(<Header />);
    expect(screen.getByText("More")).toBeTruthy();
    mobileView.unmount();
    mocks.mobile = false;
    renderAt(<Header />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.queryByText("More")).toBeNull();
  });

  it("leaves the Desktop Settings branch unchanged", () => {
    mocks.mobile = false;
    renderAt(<SettingsPage />);
    expect(screen.getByText("Shop Details")).toBeTruthy();
    expect(screen.getByText("Categories")).toBeTruthy();
    expect(screen.getByText("Payment Method")).toBeTruthy();
    expect(screen.queryByText("Payment Methods")).toBeNull();
    expect(screen.queryByText("Suppliers")).toBeNull();
  });
});
