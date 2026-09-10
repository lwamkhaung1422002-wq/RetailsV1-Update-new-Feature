import { describe, expect, it } from "vitest";
import { translateUi } from "./uiLanguage";

describe("translateUi", () => {
  it("translates registered system labels", () => {
    expect(translateUi("Myanmar", "Products")).toBe("ကုန်ပစ္စည်းများ");
    expect(translateUi("Myanmar", "Payment")).toBe("ငွေပေးချေမှု");
  });

  it("leaves user-entered values unchanged", () => {
    expect(translateUi("Myanmar", "Rice 25kg")).toBe("Rice 25kg");
    expect(translateUi("Myanmar", "ABC Trading")).toBe("ABC Trading");
    expect(translateUi("Myanmar", "INV-00125")).toBe("INV-00125");
  });
});
