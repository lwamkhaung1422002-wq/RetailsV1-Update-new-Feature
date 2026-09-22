import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const desktopPages = [
  ["Inventory", "./Stock/StockPage.jsx"],
  ["Suppliers", "./Suppliers/SuppliersPage.jsx"],
  ["Price & Discount", "./Price/PricePage.jsx"],
  ["Payment", "./Payment/PaymentPage.jsx"],
  ["Sale Report", "./Report/SalesReportPage.jsx"],
  ["Product Report", "./Report/ProductReportPage.jsx"],
  ["Payment Report", "./Report/PaymentReportPage.jsx"],
  ["Settings", "./Settings/SettingsPage.jsx"],
];

describe("desktop page workspace width", () => {
  it.each(desktopPages)("lets %s use the available AppLayout workspace", (_name, relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).toMatch(/width:\s*["']100%["'][\s\S]{0,100}maxWidth:\s*["']none["'][\s\S]{0,100}mx:\s*0/);
  });

  it("keeps the already-compliant Staff & Access owner wrapper full width", () => {
    const relativePath = "./StaffAccess/StaffAccessPage.jsx";
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).toMatch(/width:\s*["']100%["'][\s\S]{0,100}maxWidth:\s*["']none["'][\s\S]{0,100}mx:\s*0/);
  });
});
