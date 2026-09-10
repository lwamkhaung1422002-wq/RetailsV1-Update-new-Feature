// Keep route imports in one place so the router and app shell can share the
// same chunk promises. This only changes when code is fetched, never routing.
export const loadAuthPage = () => import("./pages/Auth/AuthPage");
export const loadSalePage = () => import("./pages/Sale/SalePage");
export const loadStockPage = () => import("./pages/Stock/StockPage");
export const loadAddProductPage = () => import("./pages/Stock/AddProductPage");
export const loadStockHistoryPage = () => import("./pages/Stock/StockHistoryPage");
export const loadAddStockMovementPage = () => import("./pages/Stock/AddStockMovementPage");
export const loadProductDetailsPage = () => import("./pages/Stock/ProductDetailsPage");
export const loadNotePage = () => import("./pages/Note/NotePage");
export const loadPaymentPage = () => import("./pages/Payment/PaymentPage");
export const loadPricePage = () => import("./pages/Price/PricePage");
export const loadAddPricePage = () => import("./pages/Price/AddPricePage");
export const loadAddPromotionPage = () => import("./pages/Price/AddPromotionPage");
export const loadPriceHistoryPage = () => import("./pages/Price/PriceHistoryPage");
export const loadPromotionReportPage = () => import("./pages/Price/PromotionReportPage");
export const loadReportPage = () => import("./pages/Report/ReportPage");
export const loadProductReportPage = () => import("./pages/Report/ProductReportPage");
export const loadSalesReportPage = () => import("./pages/Report/SalesReportPage");
export const loadSaleRecordPage = () => import("./pages/SaleRecord/SaleRecordPage");
export const loadSuppliersPage = () => import("./pages/Suppliers/SuppliersPage");
export const loadAddSupplierPage = () => import("./pages/Suppliers/AddSupplierPage");
export const loadRecordSupplierPaymentPage = () => import("./pages/Suppliers/RecordSupplierPaymentPage");
export const loadSupplierDetailsPage = () => import("./pages/Suppliers/SupplierDetailsPage");
export const loadSupplierHistoryPage = () => import("./pages/Suppliers/SupplierHistoryPage");
export const loadSettingsPage = () => import("./pages/Settings/SettingsPage");
export const loadCategoryManagementPage = () => import("./pages/Settings/CategoryManagementPage");
export const loadPaymentMethodManagementPage = () => import("./pages/Settings/PaymentMethodManagementPage");
export const loadShopDetailsPage = () => import("./pages/Settings/ShopDetailsPage");
export const loadStaffAccessPage = () => import("./pages/StaffAccess/StaffAccessPage");
export const loadBranchesPage = () => import("./pages/Branches/BranchesPage");
export const loadCreateOrderPage = () => import("./pages/CreateOrder/CreateOrderPage");
export const loadOrderDetailsPage = () => import("./pages/Sale/OrderDetailsPage");

// Warm the cashier's most common destinations only when the browser is idle.
// The calls reuse Vite's module cache and do not fetch any API data.
export function prefetchCommonRouteChunks() {
  return Promise.allSettled([
    loadSalePage(),
    loadCreateOrderPage(),
    loadStockPage(),
    loadPaymentPage(),
    loadSuppliersPage(),
  ]);
}

export function prefetchSettingsRouteChunks() {
  return Promise.allSettled([
    loadSuppliersPage(),
    loadPaymentPage(),
    loadPricePage(),
    loadReportPage(),
    loadSalesReportPage(),
  ]);
}
