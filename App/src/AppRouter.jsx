import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Alert, Box } from "@mui/material";
import { LoadingState } from "./components/ApiState/ApiState";
import RouteErrorBoundary from "./components/RouteErrorBoundary/RouteErrorBoundary";
import { useAuth } from "./context/AuthContext";
import { canAccessFeatureRoute } from "./lib/feature-route-access";

import App from "./App";
import Home from "./pages/Home/HomePage";
import {
  loadAddPricePage, loadAddProductPage, loadAddPromotionPage, loadAddStockMovementPage,
  loadAuthPage, loadCategoryManagementPage, loadCreateOrderPage, loadNotePage, loadPaymentMethodManagementPage,
  loadOrderDetailsPage, loadPaymentPage, loadPriceHistoryPage, loadPromotionReportPage,
  loadPricePage, loadProductDetailsPage, loadProductReportPage, loadRecordSupplierPaymentPage,
  loadReportPage, loadSalePage, loadSaleRecordPage, loadSalesReportPage, loadSettingsPage,
  loadShopDetailsPage, loadStockHistoryPage, loadStockPage, loadSupplierDetailsPage,
  loadSupplierHistoryPage, loadSuppliersPage, loadCustomersPage, loadAddSupplierPage, loadStaffAccessPage, loadStaffLinkPage, loadBranchesPage, loadPaymentReportPage, loadOperationsPage,
} from "./routeChunks";

const AuthPage = lazy(loadAuthPage);
const StaffLinkPage = lazy(loadStaffLinkPage);
const Sale = lazy(loadSalePage);
const Stock = lazy(loadStockPage);
const AddProduct = lazy(loadAddProductPage);
const StockHistory = lazy(loadStockHistoryPage);
const AddStockMovement = lazy(loadAddStockMovementPage);
const ProductDetails = lazy(loadProductDetailsPage);
const Note = lazy(loadNotePage);
const Payment = lazy(loadPaymentPage);
const Price = lazy(loadPricePage);
const AddPrice = lazy(loadAddPricePage);
const AddPromotion = lazy(loadAddPromotionPage);
const PriceHistory = lazy(loadPriceHistoryPage);
const PromotionReport = lazy(loadPromotionReportPage);
const Report = lazy(loadReportPage);
const ProductReport = lazy(loadProductReportPage);
const SalesReport = lazy(loadSalesReportPage);
const SaleRecord = lazy(loadSaleRecordPage);
const Suppliers = lazy(loadSuppliersPage);
const Customers = lazy(loadCustomersPage);
const AddSupplier = lazy(loadAddSupplierPage);
const RecordSupplierPayment = lazy(loadRecordSupplierPaymentPage);
const SupplierDetails = lazy(loadSupplierDetailsPage);
const SupplierHistory = lazy(loadSupplierHistoryPage);
const Settings = lazy(loadSettingsPage);
const CategoryManagement = lazy(loadCategoryManagementPage);
const PaymentMethodManagement = lazy(loadPaymentMethodManagementPage);
const ShopDetailsPage = lazy(loadShopDetailsPage);
const StaffAccessPage = lazy(loadStaffAccessPage);
const BranchesPage = lazy(loadBranchesPage);
const PaymentReportPage = lazy(loadPaymentReportPage);
const OperationsPage = lazy(loadOperationsPage);
const CreateOrder = lazy(loadCreateOrderPage);
const OrderDetails = lazy(loadOrderDetailsPage);

function RouteContent({ children }) {
  return <Suspense fallback={<LoadingState minHeight="100vh" />}>{children}</Suspense>;
}

function FeatureRoute({ rule, children }) {
  const { shop } = useAuth();
  if (!canAccessFeatureRoute(shop, rule)) return <Box sx={{ p: 3 }}><Alert severity="error">You do not have access to this page.</Alert></Box>;
  return children;
}

const router = createBrowserRouter([
  { path: "/login", element: <RouteContent><AuthPage mode="login" /></RouteContent>, errorElement: <RouteErrorBoundary /> },
  { path: "/register", element: <RouteContent><AuthPage mode="register" /></RouteContent>, errorElement: <RouteErrorBoundary /> },
  { path: "/staff/invite", element: <RouteContent><StaffLinkPage mode="invite" /></RouteContent>, errorElement: <RouteErrorBoundary /> },
  { path: "/staff/reset-login", element: <RouteContent><StaffLinkPage mode="reset" /></RouteContent>, errorElement: <RouteErrorBoundary /> },
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "sale",
        element: <RouteContent><Sale /></RouteContent>,
      },
      {
        path: "sale/create",
        element: <RouteContent><CreateOrder /></RouteContent>,
      },
      {
        path: "customers",
        element: <RouteContent><Customers /></RouteContent>,
      },
      {
        path: "sale/:orderId",
        element: <RouteContent><OrderDetails /></RouteContent>,
      },
      {
        path: "stock",
        element: <RouteContent><Stock /></RouteContent>,
      },
      { path: "stock/add", element: <RouteContent><AddProduct /></RouteContent> },
      { path: "stock/history", element: <RouteContent><StockHistory /></RouteContent> },
      { path: "stock/movement/add", element: <RouteContent><AddStockMovement /></RouteContent> },
      { path: "stock/:productId", element: <RouteContent><ProductDetails /></RouteContent> },
      { path: "note", element: <RouteContent><Note /></RouteContent> },
      { path: "payment", element: <RouteContent><Payment /></RouteContent> },
      { path: "payment/history", element: <RouteContent><SupplierHistory /></RouteContent> },
      { path: "price", element: <RouteContent><Price /></RouteContent> },
      { path: "price/add", element: <RouteContent><AddPrice /></RouteContent> },
      { path: "price/promotion/add", element: <RouteContent><AddPromotion /></RouteContent> },
      { path: "price/history", element: <RouteContent><PriceHistory /></RouteContent> },
      { path: "price/promotion/:campaignId/report", element: <RouteContent><PromotionReport /></RouteContent> },
      { path: "report", element: <RouteContent><Report /></RouteContent> },
      { path: "report/products", element: <FeatureRoute rule="report.viewSales"><RouteContent><ProductReport /></RouteContent></FeatureRoute> },
      { path: "report/sales", element: <FeatureRoute rule="report.viewSales"><RouteContent><SalesReport /></RouteContent></FeatureRoute> },
      { path: "sale-record", element: <RouteContent><SaleRecord /></RouteContent> },
      { path: "suppliers", element: <RouteContent><Suppliers /></RouteContent> },
      { path: "suppliers/add", element: <RouteContent><AddSupplier /></RouteContent> },
      { path: "suppliers/history", element: <RouteContent><SupplierHistory /></RouteContent> },
      { path: "suppliers/:supplierId/pay", element: <RouteContent><RecordSupplierPayment /></RouteContent> },
      { path: "suppliers/delivery/:recordId/pay", element: <RouteContent><RecordSupplierPayment /></RouteContent> },
      { path: "supplier-delivery/:recordId", element: <RouteContent><SupplierDetails /></RouteContent> },
      { path: "suppliers/:supplierId", element: <RouteContent><SupplierDetails /></RouteContent> },
      { path: "settings", element: <RouteContent><Settings /></RouteContent> },
      { path: "settings/categories", element: <RouteContent><CategoryManagement /></RouteContent> },
      { path: "settings/payment-methods", element: <RouteContent><PaymentMethodManagement /></RouteContent> },
      { path: "settings/shop-details", element: <RouteContent><ShopDetailsPage /></RouteContent> },
      { path: "settings/staff-access", element: <FeatureRoute rule="staff-access"><RouteContent><StaffAccessPage /></RouteContent></FeatureRoute> },
      { path: "branches", element: <FeatureRoute rule="branches"><RouteContent><BranchesPage /></RouteContent></FeatureRoute> },
      { path: "report/payments", element: <FeatureRoute rule="report.viewSales"><RouteContent><PaymentReportPage /></RouteContent></FeatureRoute> },
      { path: "report/operations", element: <FeatureRoute rule="audit.view"><RouteContent><OperationsPage /></RouteContent></FeatureRoute> },
    ],
  },
]);
export default function AppRouter() {
  return <RouterProvider router={router} />;
}
