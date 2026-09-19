import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({ permissions: new Set() }));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    logout: vi.fn(),
    shop: { id: "shop-1", name: "Main Shop", role: "OWNER", isOwner: true },
    hasPermission: (permission) => mocks.permissions.has(permission),
  }),
}));

vi.mock("../../context/AppPreferenceContext", () => ({
  useAppPreferences: () => ({ t: (value) => value }),
}));

import AppDrawer from "./AppDrawer";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderDrawer() {
  return render(<MemoryRouter initialEntries={["/"]}><AppDrawer expanded setExpanded={vi.fn()} /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => {
  mocks.permissions = new Set();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
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

describe("Desktop Operations navigation", () => {
  it("shows Operations for audit.view and navigates to the existing route", () => {
    mocks.permissions = new Set(["audit.view"]);
    renderDrawer();
    fireEvent.click(screen.getByText("Operations"));
    expect(screen.getByTestId("location").textContent).toBe("/report/operations");
  });

  it("hides Operations without audit.view", () => {
    renderDrawer();
    expect(screen.queryByText("Operations")).toBeNull();
  });
});
