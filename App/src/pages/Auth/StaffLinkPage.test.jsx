import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../lib/api";
import StaffLinkPage from "./StaffLinkPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderPage(mode = "invite") {
  render(<MemoryRouter initialEntries={[`/staff/${mode === "reset" ? "reset-login" : "invite"}?token=${"a".repeat(48)}`]}><StaffLinkPage mode={mode} /></MemoryRouter>);
}

describe("public Staff secure-link pages", () => {
  it("lets a new User choose and confirm a password", async () => {
    apiRequest.mockResolvedValueOnce({ invitation: { email: "new@example.test", role: "CASHIER", shopName: "Main Shop", newPasswordRequired: true } }).mockResolvedValueOnce({ status: "ACTIVE" });
    renderPage();
    fireEvent.change(await screen.findByLabelText(/New Password/), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Set Up Account" }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/staff-invites/accept", expect.objectContaining({ method: "POST", body: expect.objectContaining({ password: "Password123!" }) })));
    expect(await screen.findByText("Your Staff invitation has been accepted.")).toBeTruthy();
  });

  it("requires an existing User's current password without showing confirmation", async () => {
    apiRequest.mockResolvedValueOnce({ invitation: { email: "existing@example.test", role: "MANAGER", shopName: "Main Shop", newPasswordRequired: false } }).mockResolvedValueOnce({ status: "ACTIVE" });
    renderPage();
    const field = await screen.findByLabelText(/Existing Password/);
    expect(screen.queryByLabelText(/Confirm Password/)).toBeNull();
    fireEvent.change(field, { target: { value: "ExistingPassword!" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept Invitation" }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/staff-invites/accept", expect.objectContaining({ body: expect.objectContaining({ password: "ExistingPassword!" }) })));
  });

  it("handles invalid, expired, revoked, or already-used links", async () => {
    apiRequest.mockRejectedValueOnce(new Error("invalid"));
    renderPage();
    expect(await screen.findByText(/invalid, expired, revoked, or already used/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set Up Account" })).toBeNull();
  });

  it("completes a reset without restoring a session", async () => {
    apiRequest.mockResolvedValueOnce({ reset: { email: "staff@example.test", shopName: "Main Shop" } }).mockResolvedValueOnce(null);
    renderPage("reset");
    fireEvent.change(await screen.findByLabelText(/New Password/), { target: { value: "NewPassword123!" } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: "NewPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Set New Password" }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/staff-login-reset/complete", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Your password has been reset.")).toBeTruthy();
  });
});
