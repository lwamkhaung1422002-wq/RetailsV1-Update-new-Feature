import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), guest: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ login: mocks.login, register: mocks.register, continueAsGuest: mocks.guest }) }));

import AuthPage from "./AuthPage";

function renderPage(path, mobile = false) {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<div>Forgot password destination</div>} />
    <Route path="/" element={<div>Signed in destination</div>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  mocks.login.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.register.mockResolvedValue({ user: { id: "owner-1" } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows Forgot Password on desktop Login only and navigates to its public route", () => {
  renderPage("/login");
  fireEvent.click(screen.getByRole("link", { name: "Forgot Password?" }));
  expect(screen.getByText("Forgot password destination")).toBeTruthy();
});

it("shows Forgot Password on mobile Login but not on desktop or mobile Register", () => {
  const mobileLogin = renderPage("/login", true);
  expect(screen.getByRole("link", { name: "Forgot Password?" })).toBeTruthy();
  mobileLogin.unmount();
  const desktopRegister = renderPage("/register");
  expect(screen.queryByText("Forgot Password?")).toBeNull();
  desktopRegister.unmount();
  renderPage("/register", true);
  expect(screen.queryByText("Forgot Password?")).toBeNull();
});

it("keeps the existing desktop Login submit behavior", async () => {
  renderPage("/login");
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "owner@example.test" } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "OldPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ email: "owner@example.test", password: "OldPassword123" }));
  expect(await screen.findByText("Signed in destination")).toBeTruthy();
});

it("keeps the existing desktop Register submit behavior", async () => {
  renderPage("/register");
  fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Owner" } });
  fireEvent.change(screen.getByLabelText(/Shop name/), { target: { value: "Main Shop" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "owner@example.test" } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "NewPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ name: "Owner", shopName: "Main Shop", email: "owner@example.test", password: "NewPassword123" })));
  expect(await screen.findByText("Signed in destination")).toBeTruthy();
});
