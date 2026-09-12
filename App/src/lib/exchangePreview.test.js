import { describe, expect, it } from "vitest";

import { previewExchangeDifference, previewReturnedValue } from "./exchangePreview";

describe("exchange preview", () => {
  const order = {
    subtotal: 100_000,
    discount: 10_000,
    items: [{ id: "item-1", quantity: 2, baseQuantity: "2", lineTotal: 100_000 }],
  };

  it("uses the persisted historical sale value and discount", () => {
    expect(previewReturnedValue(order, { "item-1": 1 })).toBe(45_000);
  });

  it.each([
    [30_000, 30_000, 0],
    [30_000, 40_000, 10_000],
    [40_000, 30_000, -10_000],
  ])("calculates the payment difference", (returned, replacement, expected) => {
    expect(previewExchangeDifference(returned, replacement)).toBe(expected);
  });
});
