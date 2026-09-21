import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  records: [],
  api: { suppliers: { create: vi.fn(), updateDeliveryRecord: vi.fn(), deliveryRecord: vi.fn() } },
  invalidateQueries: vi.fn(),
}));

vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => mocks.api }));
vi.mock("../../hooks/usePosQueries", () => ({ useSupplierDeliveriesQuery: () => ({ data: { records: mocks.records } }) }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

import SupplierForm from "./SupplierForm";
import { buildSupplierHistoryOptions } from "./supplierHistory";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.records = [];
});

describe("Supplier history suggestions", () => {
  it("trims and deduplicates names case-insensitively while preserving distinct names", () => {
    const options = buildSupplierHistoryOptions([
      { id: "1", supplierName: " Unilever ", supplierPhone: "091", receivedAt: "2026-09-01" },
      { id: "2", supplierName: "unilever", supplierPhone: "092", receivedAt: "2026-09-02" },
      { id: "3", supplierName: "Unilever Distribution", supplierPhone: "093", receivedAt: "2026-09-03" },
    ]);
    expect(options).toEqual([
      { name: "Unilever Distribution", phone: "093" },
      { name: "unilever", phone: "092" },
    ]);
  });

  it("uses the latest known non-empty phone deterministically", () => {
    const options = buildSupplierHistoryOptions([
      { id: "old", supplierName: "Golden", supplierPhone: "091", receivedAt: "2026-08-01" },
      { id: "latest-empty", supplierName: "Golden", supplierPhone: "", receivedAt: "2026-09-03" },
      { id: "latest-phone", supplierName: "Golden", supplierPhone: "099", receivedAt: "2026-09-02" },
      { id: "none", supplierName: "No Phone", supplierPhone: "", receivedAt: "2026-09-04" },
    ]);
    expect(options).toEqual([
      { name: "No Phone", phone: "" },
      { name: "Golden", phone: "099" },
    ]);
  });

  it("supports freeSolo names and only auto-fills an editable phone after selecting history", async () => {
    mocks.records = [
      { id: "old", supplierName: "Unilever", supplierPhone: "091", receivedAt: "2026-09-01" },
      { id: "new", supplierName: "unilever", supplierPhone: "099", receivedAt: "2026-09-02" },
    ];
    render(<SupplierForm formId="supplier-form" />);

    const supplierName = screen.getByPlaceholderText("Enter supplier name");
    fireEvent.change(supplierName, { target: { value: "uni" } });
    fireEvent.click(await screen.findByText("unilever"));
    const phone = screen.getByPlaceholderText("Enter phone number");
    expect(phone.value).toBe("099");
    fireEvent.change(phone, { target: { value: "098" } });
    expect(phone.value).toBe("098");

    fireEvent.change(supplierName, { target: { value: "Brand New Supplier" } });
    expect(supplierName.value).toBe("Brand New Supplier");
    expect(screen.queryByLabelText(/Receiver Name/i)).toBeNull();
  });
});
