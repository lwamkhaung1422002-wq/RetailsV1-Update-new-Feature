import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  api: {
    suppliers: { deliveryRecord: vi.fn(), payDeliveryRecord: vi.fn() },
    purchases: { list: vi.fn(), pay: vi.fn() },
    shop: { getSettings: vi.fn() },
  },
  invalidateQueries: vi.fn(),
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

import RecordSupplierPaymentPage from "./RecordSupplierPaymentPage";

beforeEach(() => {
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.api.suppliers.deliveryRecord.mockResolvedValue({
    record: { id: "delivery-1", supplierName: "Golden", amount: 100, remaining: 100, payments: [] },
  });
  mocks.api.suppliers.payDeliveryRecord.mockResolvedValue({ payment: { id: "payment-1" } });
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { paymentMethods: [{ id: "kpay", name: "KPay", active: true }] } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("shared local supplier Record Payment", () => {
  it("uses the real payment mutation, refreshes authoritative data, closes through the host, and does not navigate", async () => {
    const onSaved = vi.fn();
    render(
      <MemoryRouter initialEntries={["/payment"]}>
        <RecordSupplierPaymentPage embeddedRecord={{ deliveryOnly: true, apiId: "delivery-1", name: "Golden", amount: 100 }} onSaved={onSaved} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Outstanding Balance/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByLabelText("Payment Method *"));
    fireEvent.click(await screen.findByRole("option", { name: "KPay" }));
    fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Receiver Mobile Payment User Name *"), { target: { value: "Accounts" } });
    fireEvent.change(screen.getByLabelText("Receiver Mobile Payment Number *"), { target: { value: "091234567" } });
    fireEvent.change(screen.getByLabelText("Transaction ID *"), { target: { value: "TX-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Payment" }));

    await waitFor(() => expect(mocks.api.suppliers.payDeliveryRecord).toHaveBeenCalledWith("delivery-1", expect.objectContaining({ amount: 100, method: "KPay", reference: "TX-1" })));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["shops", "shop-1", "payments"] });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).not.toContain("/suppliers/");
  });
});
