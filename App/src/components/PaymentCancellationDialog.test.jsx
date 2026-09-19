import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PaymentCancellationDialog from "./PaymentCancellationDialog";

const mocks = vi.hoisted(() => ({ api: {
  suppliers: { deliveryRecord: vi.fn(), reverseDeliveryPayment: vi.fn(), cancelDeliveryRecord: vi.fn() },
  orders: { get: vi.fn(), cancel: vi.fn() }, payments: { refundOrder: vi.fn() },
} }));
vi.mock("../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
const payment = { id: "pay-1", amount: 5555, method: "Cash", paidAt: "2026-09-05" };
const close = vi.fn();
function show(kind) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><PaymentCancellationDialog kind={kind} recordId="record-1" onClose={close} /></QueryClientProvider>);
  return invalidate;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.suppliers.deliveryRecord.mockResolvedValue({ record: { status: "active", payments: [payment] } });
  mocks.api.orders.get.mockResolvedValue({ order: { total: 10000, fulfillmentStatus: "completed", payments: [payment] } });
});
afterEach(cleanup);

it("requires a reason, reverses the selected supplier payment and refreshes both lists", async () => {
  const invalidate = show("supplier");
  await screen.findByText("Cancel Supplier Payment");
  const button = screen.getByRole("button", { name: "Cancel Payment" });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Cancel Payment Reason/), { target: { value: "Wrong payment" } });
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.api.suppliers.reverseDeliveryPayment).toHaveBeenCalledWith("record-1", "pay-1", { reason: "Wrong payment" });
  expect(mocks.api.suppliers.cancelDeliveryRecord).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shops", "shop-1", "payments"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shops", "shop-1", "supplier-deliveries"] });
});
it("shows cancellation errors and allows retry", async () => {
  mocks.api.suppliers.reverseDeliveryPayment.mockRejectedValueOnce(new Error("Try again"));
  show("supplier");
  fireEvent.change(await screen.findByLabelText(/Cancel Payment Reason/), { target: { value: "Wrong payment" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel Payment" }));
  expect(await screen.findByText("Try again")).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel Payment" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
});
it("cancels an unpaid supplier invoice without calling payment reversal", async () => {
  mocks.api.suppliers.deliveryRecord.mockResolvedValue({ record: { status: "active", payments: [] } });
  show("supplier");
  fireEvent.change(await screen.findByLabelText(/Cancellation Reason/), { target: { value: "Wrong invoice" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel Invoice" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.api.suppliers.cancelDeliveryRecord).toHaveBeenCalledWith("record-1", { reason: "Wrong invoice" });
  expect(mocks.api.suppliers.reverseDeliveryPayment).not.toHaveBeenCalled();
});
it("refunds a sale payment without cancelling the order", async () => {
  show("sale");
  await screen.findByText("Refund Sale Payment");
  fireEvent.change(await screen.findByLabelText(/Refund Reason/), { target: { value: "Wrong collection" } });
  fireEvent.click(screen.getByRole("button", { name: "Refund Payment" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.api.payments.refundOrder).toHaveBeenCalledWith("record-1", { originalPaymentId: "pay-1", amount: 5555, note: "Wrong collection" });
  expect(mocks.api.orders.cancel).not.toHaveBeenCalled();
});
it("allows order cancellation after all payments have been reversed", async () => {
  mocks.api.orders.get.mockResolvedValue({ order: { total: 10000, fulfillmentStatus: "completed", payments: [payment, { id: "refund", originalPaymentId: "pay-1", amount: -5555 }] } });
  show("sale");
  fireEvent.change(await screen.findByLabelText(/Cancellation Reason/), { target: { value: "Wrong order" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel Order" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.api.orders.cancel).toHaveBeenCalledWith("record-1", { reason: "Wrong order" });
});
it("blocks cancellation if a payment was added while the dialog was open", async () => {
  mocks.api.orders.get.mockResolvedValueOnce({ order: { total: 10000, fulfillmentStatus: "completed", payments: [] } });
  show("sale");
  fireEvent.change(await screen.findByLabelText(/Cancellation Reason/), { target: { value: "Wrong order" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel Order" }));
  expect(await screen.findByText(/Cancel active payments before/)).toBeTruthy();
  expect(mocks.api.orders.cancel).not.toHaveBeenCalled();
});
it("refunds a fully paid sale payment instead of cancelling the order", async () => {
  mocks.api.orders.get.mockResolvedValue({ order: { total: 5555, fulfillmentStatus: "completed", payments: [payment] } });
  show("sale");
  fireEvent.change(await screen.findByLabelText(/Refund Reason/), { target: { value: "Wrong order" } });
  fireEvent.click(screen.getByRole("button", { name: "Refund Payment" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.api.orders.cancel).not.toHaveBeenCalled();
  expect(mocks.api.payments.refundOrder).toHaveBeenCalled();
});
