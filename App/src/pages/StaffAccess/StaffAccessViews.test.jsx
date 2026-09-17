import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffDialog, LinkResultDialog } from "./StaffAccessPage";
import { StaffMemberCard } from "./StaffAccessViews";

afterEach(() => cleanup());

const member = (status, extra = {}) => ({
  id: "member-1",
  role: "CASHIER",
  active: status === "ACTIVE",
  status,
  lastLoginAt: status === "ACTIVE" ? "2026-09-16T09:00:00.000Z" : null,
  user: { id: "user-1", name: "Test Staff", email: "staff@example.test" },
  ...extra,
});

function renderCard(value, callbacks = {}) {
  render(<StaffMemberCard member={value} number={1} compact={false} {...callbacks} />);
  const action = screen.queryByRole("button", { name: `Actions for ${value.user.name}` });
  if (action) fireEvent.click(action);
}

describe("Staff lifecycle UI", () => {
  it("keeps Add Staff to Full Name, Email Address, and Role only", () => {
    render(<StaffDialog open mode="add" form={{ name: "", email: "", role: "CASHIER" }} setForm={vi.fn()} saving={false} error="" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Full Name")).toBeTruthy();
    expect(screen.getByText("Email Address")).toBeTruthy();
    expect(screen.getByText("Role")).toBeTruthy();
    expect(screen.queryByText(/password/i)).toBeNull();
    expect(screen.queryByText(/active/i)).toBeNull();
    expect(screen.queryByText(/branch/i)).toBeNull();
  });

  it("shows Setup Required invite actions and Never as last login", () => {
    renderCard(member("SETUP_REQUIRED", { id: "invite:invite-1", inviteId: "invite-1" }));
    expect(screen.getByText("Setup Required")).toBeTruthy();
    expect(screen.getByText("Never")).toBeTruthy();
    expect(screen.getByText("Generate New Invite Link")).toBeTruthy();
    expect(screen.getByText("Cancel Invite")).toBeTruthy();
    expect(screen.queryByText(/Resend Invite/i)).toBeNull();
  });

  it("shows only the required Active actions", () => {
    renderCard(member("ACTIVE"));
    expect(screen.getByText("Edit Role")).toBeTruthy();
    expect(screen.getByText("Reset Login")).toBeTruthy();
    expect(screen.getByText("Deactivate")).toBeTruthy();
    expect(screen.queryByText("Logout")).toBeNull();
  });

  it("shows Reactivate only for deactivated Staff and hides Owner actions", () => {
    const { unmount } = render(<StaffMemberCard member={member("DEACTIVATED")} number={1} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Test Staff" }));
    expect(screen.getByText("Reactivate")).toBeTruthy();
    expect(screen.queryByText("Edit Role")).toBeNull();
    unmount();
    render(<StaffMemberCard member={member("ACTIVE", { role: "OWNER", user: { id: "owner-1", name: "Owner", email: "owner@example.test" } })} number={1} compact={false} />);
    expect(screen.queryByRole("button", { name: "Actions for Owner" })).toBeNull();
  });

  it("shows and copies a one-time manual invite result without email delivery UI", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<LinkResultDialog result={{ type: "invite", title: "Staff Invitation Created", name: "New Staff", role: "Cashier", email: "staff@example.test", url: "https://pos.test/staff/invite?token=secret" }} onClose={vi.fn()} />);
    expect(screen.getByText("Staff Invitation Created")).toBeTruthy();
    expect(screen.getByDisplayValue(/token=secret/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy Invite Link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://pos.test/staff/invite?token=secret"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.queryByText(/email sent|email failed|retry email/i)).toBeNull();
  });
});
