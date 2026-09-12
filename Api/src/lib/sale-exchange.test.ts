import { describe, expect, it } from "vitest";

import { exchangeDifference, historicalReturnedValue } from "./sale-exchange.js";

describe("sale exchange values", () => {
  const order = {
    subtotal: 100_000,
    discount: 0,
    items: [{ id: "original-item", quantity: 2, baseQuantity: null, lineTotal: 100_000 }],
  };

  it.each([
    [30_000, 30_000, 0],
    [30_000, 40_000, 10_000],
    [40_000, 30_000, -10_000],
  ])("supports equal, additional-payment, and refund exchanges", (returned, replacement, expected) => {
    expect(exchangeDifference(returned, replacement)).toBe(expected);
  });

  it("values multi-quantity returns from the persisted sold line", () => {
    expect(historicalReturnedValue(order, [{ orderItemId: "original-item", quantity: 1.5 }])).toBe(75_000);
  });

  it("keeps historical value when today's product price changes", () => {
    const product = { price: 250_000 };
    expect(product.price).toBe(250_000);
    expect(historicalReturnedValue(order, [{ orderItemId: "original-item", quantity: 1 }])).toBe(50_000);
  });

  it("preserves the original order discount when valuing a return", () => {
    expect(historicalReturnedValue(
      { ...order, discount: 20_000 },
      [{ orderItemId: "original-item", quantity: 1 }],
    )).toBe(40_000);
  });

  it("uses the persisted promotion-adjusted line total", () => {
    expect(historicalReturnedValue(
      { subtotal: 80_000, discount: 0, items: [{ id: "original-item", quantity: 2, baseQuantity: null, lineTotal: 80_000 }] },
      [{ orderItemId: "original-item", quantity: 1 }],
    )).toBe(40_000);
  });

  it("does not include delivery fees in returned merchandise value", () => {
    expect(historicalReturnedValue(
      { ...order, deliveryFee: 5_000 },
      [{ orderItemId: "original-item", quantity: 2 }],
    )).toBe(100_000);
  });
});
