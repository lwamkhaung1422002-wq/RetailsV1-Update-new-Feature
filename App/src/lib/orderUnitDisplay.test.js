import { describe, expect, it } from "vitest";
import { formatEnteredUnit } from "./orderUnitDisplay";

describe("historical order unit display", () => {
  it("uses saved entered quantity and unit symbol, not current product conversion", () => {
    expect(formatEnteredUnit({ quantity: 120, enteredQuantity: "5", conversionFactor: "24", pricingSnapshot: { unitSymbol: "ctn" }, product: { units: [{ conversionFactor: 30 }] } })).toBe("5 ctn");
  });

  it("keeps legacy single-unit orders readable", () => {
    expect(formatEnteredUnit({ quantity: 2 })).toBe("2");
  });
});
