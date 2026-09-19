import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  shop: { id: "shop-1", name: "Main Shop" },
  api: { reports: { operations: vi.fn() } },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ shop: mocks.shop }),
}));

vi.mock("../../hooks/useApiResource", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, usePosApi: () => mocks.api };
});

import OperationsPage from "./OperationsPage";

beforeEach(() => {
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
  mocks.api.reports.operations.mockResolvedValue({
    summary: {},
    staff: [],
    branches: [{ id: "branch-2", name: "North Branch" }],
    groups: [{
      group: "Staff Activity",
      events: [{
        id: "event-1",
        label: "Role updated",
        entity: "Staff",
        entityId: "staff-1",
        branch: { id: "branch-2", name: "North Branch" },
        actor: { name: "Owner", role: "OWNER" },
        approver: null,
        authorizationMode: "owner",
        createdAt: "2026-09-17T00:00:00.000Z",
      }],
    }],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Operations Report V1 presentation", () => {
  it("hides Branch presentation and scopes the request to the active shop", async () => {
    render(<OperationsPage />);

    await waitFor(() => expect(mocks.api.reports.operations).toHaveBeenCalled());
    expect(mocks.api.reports.operations).toHaveBeenCalledWith(expect.objectContaining({ branchId: "shop-1" }));
    expect(await screen.findByText("Role updated")).toBeTruthy();
    expect(screen.queryByText("Branch")).toBeNull();
    expect(screen.queryByText("All branches")).toBeNull();
    expect(screen.queryByText("North Branch")).toBeNull();
  });
});
