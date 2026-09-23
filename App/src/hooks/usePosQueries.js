import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { queryKeys } from "../lib/queryKeys";
import { usePosApi } from "./useApiResource";
import { mapPaymentWorklistRecords } from "../lib/paymentWorklist";

const catalogOptions = { staleTime: 5 * 60_000 };

function useShopQuery(key, queryFn, options = {}) {
  const { shop, isGuest } = useAuth();
  const { enabled: isQueryEnabled = true, ...queryOptions } = options;
  return useQuery({
    queryKey: key(shop?.id),
    queryFn,
    ...queryOptions,
    enabled: Boolean(shop?.id) && !isGuest && isQueryEnabled,
  });
}

export const useDashboardQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.dashboard, () => api.dashboard());
};
export const useProductsQuery = (query = {}, options = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.products(shopId, query), () => api.products.list(query), { ...catalogOptions, ...options });
};
export const useAllActiveProductsQuery = () => {
  const api = usePosApi();
  const query = { status: "active", all: true };
  return useShopQuery((shopId) => queryKeys.products(shopId, query), async () => {
    const firstPage = await api.products.list({ page: 1, pageSize: 100, status: "active" });
    const totalCount = firstPage.totalCount || (firstPage.products || []).length;
    const pages = await Promise.all(Array.from(
      { length: Math.max(0, Math.ceil(totalCount / 100) - 1) },
      (_, index) => api.products.list({ page: index + 2, pageSize: 100, status: "active" }),
    ));
    return { ...firstPage, products: [firstPage, ...pages].flatMap((page) => page.products || []) };
  }, catalogOptions);
};
export const useProductQuery = (productId) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.product(shopId, productId), () => api.products.get(productId), { enabled: Boolean(productId) });
};
export const useCategoriesQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.categories, () => api.categories.list(), catalogOptions);
};
export const useUnitsQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.units, () => api.units.list(), catalogOptions);
};
export const useOrdersQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.orders(shopId, query), () => api.orders.list(query));
};
export const useOrderQuery = (orderId) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.order(shopId, orderId), () => api.orders.get(orderId), { enabled: Boolean(orderId) });
};
export const useInventoryQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.inventory(shopId, query), () => api.inventory.list(query));
};
export const useStockMovementsQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.movements(shopId, query), () => api.inventory.movements(query));
};
export const useShopDetailsQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.shopDetails, () => api.shop.get(), catalogOptions);
};
export const useShopSettingsQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.settings, () => api.shop.getSettings(), catalogOptions);
};
export const usePromotionCampaignsQuery = () => {
  const api = usePosApi();
  return useShopQuery(queryKeys.promotionCampaigns, () => api.pricing.promotionCampaigns());
};
export const usePromotionHistoryQuery = () => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.pricing(shopId, { promotionHistory: true }), () => api.pricing.promotionHistory());
};
export const usePriceHistoryQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.pricing(shopId, { history: true, ...query }), () => api.pricing.prices(query));
};
export const useProductReportQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.reports(shopId, "products", query), () => api.reports.products(query));
};
export const useSalesReportQuery = (query = {}, options = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.reports(shopId, "sales", query), () => api.reports.sales(query), options);
};
export const usePurchasesQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => ["shops", shopId, "purchases", query], () => api.purchases.list(query));
};
export const useSupplierDeliveriesQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.supplierDeliveries(shopId, query), () => api.suppliers.deliveryRecords(query));
};
export const useSuppliersQuery = (query = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.suppliers(shopId, query), () => api.suppliers.list(query), catalogOptions);
};
export const useCustomersQuery = (query = {}, options = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.customers(shopId, query), () => api.customers.list(query), { ...catalogOptions, ...options });
};
export const useAllCustomersQuery = ({ includeStats = false } = {}) => {
  const api = usePosApi();
  return useShopQuery((shopId) => queryKeys.customers(shopId, { all: true, includeStats }), async () => {
    const query = { pageSize: 100, sort: "name", direction: "asc", ...(includeStats ? { includeStats: true } : {}) };
    const firstPage = await api.customers.list({ ...query, page: 1 });
    const totalCount = firstPage.totalCount || (firstPage.customers || []).length;
    const pages = await Promise.all(Array.from(
      { length: Math.max(0, Math.ceil(totalCount / 100) - 1) },
      (_, index) => api.customers.list({ ...query, page: index + 2 }),
    ));
    return { ...firstPage, customers: [firstPage, ...pages].flatMap((page) => page.customers || []) };
  }, catalogOptions);
};
export const usePaymentWorklistQuery = () => {
  const api = usePosApi();
  const query = { view: "worklist" };
  return useShopQuery(
    (shopId) => queryKeys.payments(shopId, query),
    async () => mapPaymentWorklistRecords(await api.payments.history(query)),
    catalogOptions,
  );
};

export function useShopMutation(mutationFn, { critical = [], background = [] } = {}) {
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      // Only data required by the caller's current workflow blocks completion.
      // Secondary dashboard/report data remains correct, but refreshes after the
      // UI has received the authoritative mutation response.
      await Promise.all(critical.map((key) => queryClient.invalidateQueries({ queryKey: key(shop?.id) })));
      void Promise.all(background.map((key) => queryClient.invalidateQueries({ queryKey: key(shop?.id) })));
    },
  });
}

export function useOrderCancelMutation() {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => api.orders.cancel(id, { reason }),
    onSuccess: () => {
      if (!shop?.id) return;
      void Promise.all(["orders", "products", "inventory", "movements", "dashboard"].map((resource) =>
        queryClient.invalidateQueries({ queryKey: ["shops", shop.id, resource] }),
      ));
    },
  });
}
