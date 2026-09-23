import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAllCustomersQuery } from "./usePosQueries";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" }, isGuest: false }) }));
vi.mock("./useApiResource", () => ({ usePosApi: () => ({ customers: { list: mocks.list } }) }));

afterEach(() => vi.clearAllMocks());

function renderCustomers(options) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useAllCustomersQuery(options), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

it("requests stats for every customer page and combines more than 100 customers", async () => {
  mocks.list.mockImplementation(async ({ page }) => ({
    totalCount: 101,
    customers: page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: `customer-${index + 1}` })) : [{ id: "customer-101", visitCount: 125, totalAmount: 1_450_000 }],
  }));
  const { result } = renderCustomers({ includeStats: true });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.customers).toHaveLength(101);
  expect(result.current.data.customers[100]).toMatchObject({ visitCount: 125, totalAmount: 1_450_000 });
  expect(mocks.list).toHaveBeenCalledWith({ pageSize: 100, sort: "name", direction: "asc", includeStats: true, page: 1 });
  expect(mocks.list).toHaveBeenCalledWith({ pageSize: 100, sort: "name", direction: "asc", includeStats: true, page: 2 });
});

it("keeps the Create Order customer lookup lightweight by default", async () => {
  mocks.list.mockResolvedValue({ totalCount: 1, customers: [{ id: "customer-1" }] });
  const { result } = renderCustomers();

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mocks.list).toHaveBeenCalledWith({ pageSize: 100, sort: "name", direction: "asc", page: 1 });
});
