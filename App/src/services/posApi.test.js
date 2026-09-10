import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../lib/api";
import { createPosApi } from "./posApi";

describe("authenticated POS requests", () => {
  afterEach(() => vi.clearAllMocks());

  it("refreshes once and retries after an expired access token", async () => {
    apiRequest
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ orders: [] });
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-access-token");
    const onUnauthorized = vi.fn();
    const api = createPosApi({ token: "expired-access-token", shopId: "shop-1", refreshAccessToken, onUnauthorized });

    await expect(api.orders.list()).resolves.toEqual({ orders: [] });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/shops/shop-1/orders", { token: "expired-access-token" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/shops/shop-1/orders", { token: "fresh-access-token" });
  });

  it("ends the local session only when refresh is rejected", async () => {
    apiRequest.mockRejectedValueOnce({ status: 401 });
    const refreshAccessToken = vi.fn().mockRejectedValue({ status: 401 });
    const onUnauthorized = vi.fn();
    const api = createPosApi({ token: "expired-access-token", shopId: "shop-1", refreshAccessToken, onUnauthorized });

    await expect(api.orders.list()).rejects.toEqual({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("keeps every request scoped to the selected branch", async () => {
    apiRequest.mockResolvedValue({ inventory: [] });
    const main = createPosApi({ token: "token", shopId: "main" });
    const branch = createPosApi({ token: "token", shopId: "hledan" });

    await main.inventory.list();
    await branch.inventory.list();

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/shops/main/inventory", { token: "token" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/shops/hledan/inventory", { token: "token" });
  });
});
