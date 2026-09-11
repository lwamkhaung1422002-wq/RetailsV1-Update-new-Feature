import { describe, expect, it } from "vitest";

import { paymentMethodGridColumns } from "../../lib/payment-report-layout";

describe("Payment Report responsive layout", () => {
  it("stacks payment method values in one shrink-safe column on mobile", () => {
    const viewportWidth = 320;
    expect(paymentMethodGridColumns(viewportWidth <= 768)).toBe("minmax(0,1fr)");
  });

  it("preserves the existing four-column desktop layout", () => {
    expect(paymentMethodGridColumns(false)).toBe("1fr repeat(3,minmax(90px,1fr))");
  });
});
