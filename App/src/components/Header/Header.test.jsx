import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({ notifications: vi.fn() }));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1", name: "Shop" }, user: { shops: [] }, selectShop: vi.fn() }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => ({ notifications: { list: mocks.notifications, markRead: vi.fn() } }) }));
vi.mock("../../context/AppPreferenceContext", () => ({ useAppPreferences: () => ({ t: (value) => value }) }));

import Header from "./Header";

beforeEach(() => {
  mocks.notifications.mockResolvedValue({ notifications: [] });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: "(max-width:768px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("desktop report titles", () => {
  it.each([
    ["/report/payments", "Payment Report"],
    ["/report/sales", "Sale Report"],
    ["/report/products", "Product Report"],
    ["/report/operations", "Reports"],
  ])("resolves %s without changing neighboring report titles", (path, title) => {
    render(<MemoryRouter initialEntries={[path]}><Header /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  });
});
