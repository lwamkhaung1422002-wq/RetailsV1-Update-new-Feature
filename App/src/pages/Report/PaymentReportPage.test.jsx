import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const reportPage = {
  summary: { collected: 1000, refunds: 100, netCollected: 900, outstanding: 250 },
  methods: [{ method: "Cash", collected: 1000, refunds: 100, netCollected: 900 }],
  recent: [{ id: "payment-1", type: "Collection", source: "Sale Invoice #INV-1", paidAt: "2026-09-21T08:00:00.000Z", method: "Cash", actor: { name: "John" }, amount: 900 }],
  staff: [{ id: "staff-1", name: "John" }],
  pagination: { pageSize: 50, hasMore: false, nextCursor: null },
};

const mocks = vi.hoisted(() => ({
  mobile: false,
  pages: [],
  hasNextPage: false,
  queryOptions: [],
  payments: vi.fn(),
  fetchNextPage: vi.fn(),
  observerCallback: null,
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ shop: { id: "shop-1" } }) }));
vi.mock("../../hooks/useApiResource", () => ({ usePosApi: () => ({ reports: { payments: mocks.payments } }) }));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options) => {
    mocks.queryOptions.push(options);
    return {
      data: { pages: mocks.pages },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: mocks.hasNextPage,
      fetchNextPage: mocks.fetchNextPage,
      isFetchingNextPage: false,
    };
  },
}));

import PaymentReportPage from "./PaymentReportPage";

const yangonDateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const latestOptions = () => mocks.queryOptions.at(-1);
const renderReport = () => render(<MemoryRouter><PaymentReportPage /></MemoryRouter>);

beforeEach(() => {
  mocks.mobile = false;
  mocks.pages = [reportPage];
  mocks.hasNextPage = false;
  mocks.queryOptions = [];
  mocks.observerCallback = null;
  mocks.payments.mockReset().mockResolvedValue(reportPage);
  mocks.fetchNextPage.mockReset().mockResolvedValue(undefined);
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
  globalThis.IntersectionObserver = class {
    constructor(callback) { mocks.observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

describe("Payment Report query behavior", () => {
  it("defaults to the first day of the current Yangon month through today", () => {
    renderReport();
    const today = yangonDateKey();
    expect(latestOptions().queryKey.at(-1)).toMatchObject({
      from: `${today.slice(0, 7)}-01`,
      to: today,
      search: "",
    });
  });

  it("puts search in the authoritative query key and sends it with cursor pagination", async () => {
    renderReport();
    fireEvent.change(screen.getByLabelText("Search payments"), { target: { value: "Cash" } });
    const options = latestOptions();
    expect(options.queryKey.at(-1)).toMatchObject({ search: "Cash", method: "", staffId: "" });
    expect(options.initialPageParam).toBeNull();

    await options.queryFn({ pageParam: "payment-50" });
    expect(mocks.payments).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Cash", branchId: "shop-1", cursor: "payment-50", pageSize: 50 }));
  });

  it("loads the next page near the sentinel and deduplicates appended payments", async () => {
    mocks.hasNextPage = true;
    mocks.pages = [
      { ...reportPage, pagination: { pageSize: 1, hasMore: true, nextCursor: "payment-1" } },
      { ...reportPage, recent: [reportPage.recent[0], { ...reportPage.recent[0], id: "payment-2", type: "Refund", amount: -100 }], pagination: { pageSize: 2, hasMore: false, nextCursor: null } },
    ];
    renderReport();

    expect(screen.getAllByText("Collection")).toHaveLength(1);
    expect(screen.getAllByText("Refund")).toHaveLength(1);
    await waitFor(() => expect(mocks.observerCallback).toBeTypeOf("function"));
    act(() => mocks.observerCallback([{ isIntersecting: true }]));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe("Payment Report responsive structure", () => {
  it("renders the desktop KPI set, toolbar, methods breakdown, and recent table without KPI icons", () => {
    renderReport();

    const summary = screen.getByTestId("payment-summary");
    expect(screen.getAllByTestId("payment-summary-card")).toHaveLength(3);
    expect(within(summary).getByText("Collected")).toBeTruthy();
    expect(within(summary).getByText("Refunds")).toBeTruthy();
    expect(within(summary).getByText("Net Collected")).toBeTruthy();
    expect(within(summary).queryByText(/Outstanding|Credit/i)).toBeNull();
    expect(summary.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("Search payments")).toBeTruthy();
    expect(screen.getByLabelText("Payment method")).toBeTruthy();
    expect(screen.getByLabelText("Staff")).toBeTruthy();
    expect(screen.getByLabelText("Filter by date")).toBeTruthy();
    expect(screen.getByText("Payment Methods")).toBeTruthy();
    expect(screen.getByText("Date & Time")).toBeTruthy();
  });

  it("renders mobile search above three KPIs, spans Net Collected, hides methods, and uses exact three-row payment cards", () => {
    mocks.mobile = true;
    renderReport();

    const search = screen.getByLabelText("Search payments");
    const summary = screen.getByTestId("payment-summary");
    expect(search.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const cards = screen.getAllByTestId("payment-summary-card");
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute("data-full-width")).toBe("false");
    expect(cards[1].getAttribute("data-full-width")).toBe("false");
    expect(cards[2].getAttribute("data-full-width")).toBe("true");
    expect(summary.querySelector("svg")).toBeNull();
    expect(screen.queryByText("Payment Methods")).toBeNull();

    expect(screen.getAllByTestId("payment-row-primary")).toHaveLength(1);
    expect(within(screen.getByTestId("payment-row-primary")).getByText("Collection")).toBeTruthy();
    expect(within(screen.getByTestId("payment-row-primary")).getByText("+900 MMK")).toBeTruthy();
    expect(within(screen.getByTestId("payment-row-source")).getByText("Sale Invoice #INV-1")).toBeTruthy();
    expect(within(screen.getByTestId("payment-row-source")).getByText("John")).toBeTruthy();
    expect(within(screen.getByTestId("payment-row-meta")).getByText("Cash")).toBeTruthy();
    expect(within(screen.getByTestId("payment-row-meta")).getByText(/Sep 21/)).toBeTruthy();
  });
});
