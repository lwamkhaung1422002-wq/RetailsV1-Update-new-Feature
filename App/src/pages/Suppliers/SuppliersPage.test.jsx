import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const mocks = vi.hoisted(() => ({
  mobile: false,
  deliveries: [],
  api: {
    suppliers: { create: vi.fn(), updateDeliveryRecord: vi.fn(), deliveryRecord: vi.fn() },
    shop: { getSettings: vi.fn() },
  },
  invalidateQueries: vi.fn(),
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({
  usePurchasesQuery: () => ({ data: { purchases: [] } }),
  useSupplierDeliveriesQuery: () => ({ data: { records: mocks.deliveries } }),
  useSuppliersQuery: () => ({ data: { suppliers: [] } }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../context/approval-context", () => ({ useManagerApproval: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

import SuppliersPage, { DesktopSuppliers } from "./SuppliersPage";
import { SupplierDetailsCards } from "./SupplierDetailsPage";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

beforeEach(() => {
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
  mocks.api.shop.getSettings.mockResolvedValue({ settings: { paymentMethods: [] } });
  mocks.api.suppliers.deliveryRecord.mockImplementation(async (id) => ({ record: mocks.deliveries.find((record) => record.id === id) }));
  mocks.api.suppliers.create.mockResolvedValue({ record: { id: "delivery-new" } });
  mocks.invalidateQueries.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.mobile = false;
  mocks.deliveries = [];
});

describe("Add Supplier hosts", () => {
  it("keeps desktop Amount and Actions in separate aligned columns without changing row actions", () => {
    const record = {
      id: "INV-1",
      apiId: "delivery-1",
      supplierId: "supplier-1",
      name: "Golden",
      amount: 100,
      totalAmount: 100,
      remainingAmount: 100,
      status: "Credit",
      receiveDate: "2026-09-20",
      date: "2026-09-30",
      dateLabel: "Due",
      deliveryOnly: true,
      allowedActions: { pay: true, edit: true },
    };

    render(<MemoryRouter><DesktopSuppliers records={[record]} /></MemoryRouter>);

    expect(getComputedStyle(screen.getByText("ACTIONS")).textAlign).toBe("right");
    expect(getComputedStyle(screen.getByTestId("desktop-supplier-amount")).textAlign).toBe("right");
    expect(getComputedStyle(screen.getByTestId("desktop-supplier-amount")).paddingRight).toBe("16px");
    expect(screen.getByTestId("desktop-supplier-actions").previousElementSibling).toBe(screen.getByTestId("desktop-supplier-amount"));
    expect(screen.getByLabelText("Pay Golden")).toBeTruthy();
    expect(screen.getByLabelText("Edit Golden")).toBeTruthy();
    expect(screen.getByLabelText("Delete Golden")).toBeTruthy();
  });

  it("opens and saves the real Add Supplier form in a desktop modal without navigating", async () => {
    render(<MemoryRouter initialEntries={["/suppliers"]}><DesktopSuppliers records={[]} /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Add Supplier" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Supplier Name *")).toBeTruthy();
    expect(screen.queryByLabelText(/Receiver Name/i)).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/suppliers");
    fireEvent.change(screen.getByLabelText("Supplier Name *"), { target: { value: "Golden" } });
    fireEvent.change(screen.getByLabelText("Phone *"), { target: { value: "091" } });
    fireEvent.change(screen.getByLabelText("Invoice Number *"), { target: { value: "INV-1" } });
    fireEvent.change(screen.getByLabelText("Delivery Name *"), { target: { value: "Truck" } });
    fireEvent.change(screen.getByLabelText("Delivery Phone *"), { target: { value: "099" } });
    fireEvent.change(screen.getByLabelText("Receive Date *"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("Due Date *"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "50000" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add Supplier" }).at(-1));
    await waitFor(() => expect(mocks.api.suppliers.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Golden", deliveryRecord: expect.not.objectContaining({ receiverName: expect.anything() }) })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }, 10000);

  it("keeps mobile Add Supplier on the existing full-page route", () => {
    mocks.mobile = true;
    render(
      <MemoryRouter initialEntries={["/suppliers"]}>
        <Routes>
          <Route path="/suppliers" element={<><SuppliersPage /><LocationProbe /></>} />
          <Route path="/suppliers/add" element={<><span>Mobile Add Supplier Page</span><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Supplier" }));
    expect(screen.getByText("Mobile Add Supplier Page")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/suppliers/add");
  });

  it("opens Supplier Pay locally on mobile without a route bounce", async () => {
    mocks.mobile = true;
    mocks.deliveries = [{
      id: "delivery-1",
      invoiceNumber: "INV-1",
      supplierName: "Golden",
      supplierPhone: "091",
      amount: 100,
      remaining: 100,
      activePaid: 0,
      activePaymentCount: 0,
      invoiceStatus: "Credit",
      status: "active",
      receivedAt: "2026-09-20T00:00:00.000Z",
      dueAt: "2026-09-30T00:00:00.000Z",
      createdAt: "2026-09-20T00:00:00.000Z",
      payments: [],
      allowedActions: { pay: true, edit: true, cancelInvoice: true, cancelPayment: false },
    }];
    render(<MemoryRouter initialEntries={["/suppliers"]}><SuppliersPage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText("More actions for Golden"));
    fireEvent.click(screen.getByText("Pay"));
    expect(await screen.findByText("Record Payment")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/suppliers");
  });

  it("keeps desktop Supplier Pay local with a top close control and no duplicate Cancel footer", async () => {
    const record = {
      id: "INV-1",
      apiId: "delivery-1",
      supplierId: "supplier-1",
      name: "Golden",
      amount: 100,
      totalAmount: 100,
      remainingAmount: 100,
      status: "Credit",
      receiveDate: "2026-09-20",
      date: "2026-09-30",
      dateLabel: "Due",
      deliveryOnly: true,
      allowedActions: { pay: true, edit: true },
    };
    mocks.api.suppliers.deliveryRecord.mockResolvedValue({
      record: {
        id: "delivery-1",
        supplierName: "Golden",
        amount: 100,
        remaining: 100,
        payments: [],
      },
    });
    render(<MemoryRouter initialEntries={["/suppliers"]}><DesktopSuppliers records={[record]} /><LocationProbe /></MemoryRouter>);

    fireEvent.click(screen.getByLabelText("Pay Golden"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Close supplier payment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add Payment" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/suppliers");
  });

  it("shows delivery creator as Recorded By while preserving payment receiver labels", () => {
    render(<SupplierDetailsCards supplier={{ name: "Golden", phone: "091" }} delivery={{ invoiceNumber: "INV-1", deliveryName: "Truck", deliveryPhone: "099", receiverName: "Staff A", receivedAt: "2026-09-20", dueAt: "2026-09-30", amount: 100, status: "active" }} payments={[{ id: "pay-1", amount: 100, method: "Cash", payerName: "Cash Receiver", payerPhone: "092", paidAt: "2026-09-21" }]} />);
    expect(screen.getByText("Recorded By")).toBeTruthy();
    expect(screen.getByText("Staff A")).toBeTruthy();
    expect(screen.getByText("Receiver Name")).toBeTruthy();
    expect(screen.getByText("Cash Receiver")).toBeTruthy();
  });
});
