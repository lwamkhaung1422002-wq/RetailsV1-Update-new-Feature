import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiRequest: mocks.apiRequest }));

import ForgotPasswordPage from "./ForgotPasswordPage";

function renderPage(mobile = false) {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  return render(<MemoryRouter initialEntries={["/forgot-password"]}><Routes>
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/login" element={<div>Sign in destination</div>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  mocks.apiRequest.mockImplementation(async (path) => path.endsWith("/verify") ? { resetToken: "a".repeat(64) } : {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("submits owner email, accepts six digits, and shows a generic invalid-code message", async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: "OWNER@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));
  await screen.findByRole("heading", { name: "Verify Code" });
  expect(mocks.apiRequest).toHaveBeenCalledWith("/auth/forgot-password/request", { method: "POST", body: { email: "owner@example.test" } });
  expect(screen.getByText("owner@example.test")).toBeTruthy();

  const codeField = screen.getByLabelText(/Verification Code/);
  fireEvent.change(codeField, { target: { value: "12a34567" } });
  expect(codeField.value).toBe("123456");
  mocks.apiRequest.mockRejectedValueOnce(new Error("unknown account type"));
  fireEvent.click(screen.getByRole("button", { name: "Verify Code" }));
  expect(await screen.findByText("Invalid or expired verification code.")).toBeTruthy();
  expect(screen.queryByText("unknown account type")).toBeNull();
});

it("rejects a password mismatch, resets with the verified token, and returns to Login", async () => {
  renderPage(true);
  fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: "owner@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));
  await screen.findByRole("heading", { name: "Verify Code" });
  fireEvent.change(screen.getByLabelText(/Verification Code/), { target: { value: "482731" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify Code" }));
  await screen.findByRole("heading", { name: "Create New Password" });
  expect(mocks.apiRequest).toHaveBeenCalledWith("/auth/forgot-password/verify", { method: "POST", body: { email: "owner@example.test", code: "482731" } });

  fireEvent.change(screen.getByLabelText(/New Password/), { target: { value: "NewPassword123" } });
  fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: "Different123" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
  expect(screen.getByText("Password and confirmation do not match.")).toBeTruthy();
  expect(mocks.apiRequest.mock.calls.filter(([path]) => path.endsWith("/reset"))).toHaveLength(0);

  fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: "NewPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
  await screen.findByRole("heading", { name: "Password reset successfully." });
  expect(mocks.apiRequest).toHaveBeenCalledWith("/auth/forgot-password/reset", { method: "POST", body: { resetToken: "a".repeat(64), password: "NewPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Back to Sign In" }));
  expect(screen.getByText("Sign in destination")).toBeTruthy();
});

it("holds Resend Code for 60 seconds then sends another request for the same email", async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: "owner@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));
  await screen.findByRole("heading", { name: "Verify Code" });
  expect(screen.getByRole("button", { name: /Resend Code/ }).disabled).toBe(true);
  const future = Date.now() + 61_000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  await waitFor(() => expect(screen.getByRole("button", { name: "Resend Code" }).disabled).toBe(false), { timeout: 2_500 });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Resend Code" })); });
  expect(mocks.apiRequest.mock.calls.filter(([path]) => path.endsWith("/request"))).toHaveLength(2);
  expect(mocks.apiRequest).toHaveBeenLastCalledWith("/auth/forgot-password/request", { method: "POST", body: { email: "owner@example.test" } });
});
