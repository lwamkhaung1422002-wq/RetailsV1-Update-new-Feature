import { apiRequest } from "../lib/api";

const queryString = (query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

const shopPath = (shopId, path) => `/shops/${shopId}${path}`;

export function createPosApi({
  token,
  shopId,
  onUnauthorized,
  refreshAccessToken,
  isGuest = false,
}) {
  const request = async (path, options) => {
    if (isGuest) throw new Error("Create an account to sync business data.");
    try {
      return await apiRequest(path, { token, ...options });
    } catch (error) {
      if (error.status !== 401) throw error;

      // An access token may expire while a user is working. Refresh once and
      // retry the original request before ending the session.
      if (refreshAccessToken) {
        try {
          const refreshedToken = await refreshAccessToken();
          return await apiRequest(path, { ...options, token: refreshedToken });
        } catch (retryError) {
          if (retryError?.status === 401) onUnauthorized?.();
          throw retryError;
        }
      }

      onUnauthorized?.();
      throw error;
    }
  };
  const shopRequest = (path, options) =>
    request(shopPath(shopId, path), options);

  return {
    dashboard: (query) => shopRequest(`/dashboard${queryString(query)}`),
    reports: {
      sales: (query) => shopRequest(`/reports/sales${queryString(query)}`),
      products: (query) => shopRequest(`/product-report${queryString(query)}`),
    },
    shop: {
      get: () => shopRequest(""),
      update: (body) => shopRequest("", { method: "PATCH", body }),
      uploadLogo: (file) => { const body = new FormData(); body.append("logo", file); return shopRequest("/logo", { method: "POST", body }); },
      removeLogo: () => shopRequest("/logo", { method: "DELETE" }),
      getSettings: () => shopRequest("/settings"),
      updateSettings: (body) =>
        shopRequest("/settings", { method: "PATCH", body }),
    },
    categories: {
      list: () => shopRequest("/categories"),
      create: (body) => shopRequest("/categories", { method: "POST", body }),
      update: (id, body) =>
        shopRequest(`/categories/${id}`, { method: "PATCH", body }),
      remove: (id) => shopRequest(`/categories/${id}`, { method: "DELETE" }),
    },
    products: {
      list: (query) => shopRequest(`/products${queryString(query)}`),
      get: (id) => shopRequest(`/products/${id}`),
      costHistory: (id) => shopRequest(`/products/${id}/cost-history`),
      create: (body) => shopRequest("/products", { method: "POST", body }),
      update: (id, body) =>
        shopRequest(`/products/${id}`, { method: "PATCH", body }),
      generateShortCode: (id) =>
        shopRequest(`/products/${id}/short-code/generate`, { method: "POST" }),
      remove: (id) => shopRequest(`/products/${id}`, { method: "DELETE" }),
    },
    units: {
      list: () => shopRequest("/units"),
    },
    inventory: {
      list: (query) => shopRequest(`/inventory${queryString(query)}`),
      create: (body) => shopRequest("/inventory", { method: "POST", body }),
      adjust: (inventoryBatchId, body) =>
        shopRequest(`/inventory/${inventoryBatchId}/adjustments`, {
          method: "POST",
          body,
        }),
      adjustByCost: (body) => shopRequest("/inventory/adjustments/by-cost", { method: "POST", body }),
      adjustments: (query) =>
        shopRequest(`/inventory-adjustments${queryString(query)}`),
      movements: (query) =>
        shopRequest(`/inventory-movements${queryString(query)}`),
    },
    suppliers: {
      list: (query) => shopRequest(`/suppliers${queryString(query)}`),
      deliveryRecords: (query) =>
        shopRequest(`/supplier-delivery-records${queryString(query)}`),
      create: (body) => shopRequest("/suppliers", { method: "POST", body }),
      deliveryRecord: (id) => shopRequest(`/supplier-delivery-records/${id}`),
      updateDeliveryRecord: (id, body) =>
        shopRequest(`/supplier-delivery-records/${id}`, {
          method: "PATCH",
          body,
        }),
      removeDeliveryRecord: (id) =>
        shopRequest(`/supplier-delivery-records/${id}`, { method: "DELETE" }),
      cancelDeliveryRecord: (id, body) =>
        shopRequest(`/supplier-delivery-records/${id}/cancel`, {
          method: "POST",
          body,
        }),
      payDeliveryRecord: (id, body) =>
        shopRequest(`/supplier-delivery-records/${id}/payments`, {
          method: "POST",
          body,
        }),
      reverseDeliveryPayment: (recordId, paymentId, body) =>
        shopRequest(
          `/supplier-delivery-records/${recordId}/payments/${paymentId}/reverse`,
          { method: "POST", body },
        ),
      update: (id, body) =>
        shopRequest(`/suppliers/${id}`, { method: "PATCH", body }),
      remove: (id) => shopRequest(`/suppliers/${id}`, { method: "DELETE" }),
      openBalance: (deliveryRecordId) =>
        shopRequest(
          `/supplier-delivery-records/${deliveryRecordId}/payable-purchase`,
          { method: "POST" },
        ),
    },
    purchases: {
      list: (query) => shopRequest(`/purchases${queryString(query)}`),
      create: (body) => shopRequest("/purchases", { method: "POST", body }),
      pay: (id, body) =>
        shopRequest(`/purchases/${id}/payments`, { method: "POST", body }),
      reversePayment: (purchaseId, paymentId, body) =>
        shopRequest(`/purchases/${purchaseId}/payments/${paymentId}/reverse`, {
          method: "POST",
          body,
        }),
    },
    payments: {
      history: (query) => shopRequest(`/payment-history${queryString(query)}`),
      list: (query) => shopRequest(`/payments${queryString(query)}`),
      addToOrder: (orderId, body) =>
        shopRequest(`/orders/${orderId}/payments`, { method: "POST", body }),
      refundOrder: (orderId, body) =>
        shopRequest(`/orders/${orderId}/refunds`, { method: "POST", body }),
      createCodSettlement: (body) =>
        shopRequest("/payments/cod-settlements", { method: "POST", body }),
      void: (paymentId, body) =>
        shopRequest(`/payments/${paymentId}/void`, { method: "POST", body }),
    },
    expenses: {
      list: (query) => shopRequest(`/expenses${queryString(query)}`),
      create: (body) => shopRequest("/expenses", { method: "POST", body }),
      update: (id, body) =>
        shopRequest(`/expenses/${id}`, { method: "PATCH", body }),
      remove: (id) => shopRequest(`/expenses/${id}`, { method: "DELETE" }),
    },
    orders: {
      list: (query) => shopRequest(`/orders${queryString(query)}`),
      get: (id) => shopRequest(`/orders/${id}`),
      nextNumber: () => shopRequest("/orders/next-number"),
      create: (body) => shopRequest("/orders", { method: "POST", body }),
      fulfill: (id) => shopRequest(`/orders/${id}/fulfill`, { method: "POST" }),
      updateStatus: (id, body) =>
        shopRequest(`/orders/${id}/status`, { method: "PATCH", body }),
      cancel: (id, body) =>
        shopRequest(`/orders/${id}/cancel`, { method: "POST", body }),
      remove: (id) => shopRequest(`/orders/${id}`, { method: "DELETE" }),
    },
    pricing: {
      overview: (query) =>
        shopRequest(`/pricing/overview${queryString(query)}`),
      resolve: (body) =>
        shopRequest("/pricing/resolve", { method: "POST", body }),
      prices: (query) => shopRequest(`/prices${queryString(query)}`),
      createPrice: (body) => shopRequest("/prices", { method: "POST", body }),
      bulkPrices: (body) =>
        shopRequest("/prices/bulk", { method: "POST", body }),
      promotions: (query) => shopRequest(`/promotions${queryString(query)}`),
      createPromotion: (body) =>
        shopRequest("/promotions", { method: "POST", body }),
      updatePromotion: (id, body) =>
        shopRequest(`/promotions/${id}`, { method: "PATCH", body }),
      promotionHistory: () => shopRequest("/promotion-history"),
      promotionCampaigns: () => shopRequest("/promotion-campaigns"),
      promotionReport: (id) => shopRequest(`/promotion-campaigns/${id}/report`),
      createPromotionCampaign: (body) =>
        shopRequest("/promotion-campaigns", { method: "POST", body }),
      updatePromotionCampaign: (id, body) =>
        shopRequest(`/promotion-campaigns/${id}`, { method: "PATCH", body }),
      barcodeLookup: (value, query) =>
        shopRequest(
          `/barcode-lookup/${encodeURIComponent(value)}${queryString(query)}`,
        ),
      barcodes: (query) => shopRequest(`/barcodes${queryString(query)}`),
      createBarcode: (body) =>
        shopRequest("/barcodes", { method: "POST", body }),
      updateBarcode: (id, body) =>
        shopRequest(`/barcodes/${id}`, { method: "PATCH", body }),
      retireBarcode: (id, body) =>
        shopRequest(`/barcodes/${id}/retire`, { method: "PATCH", body }),
      createInternalBarcode: (body) =>
        shopRequest("/barcodes/internal", { method: "POST", body }),
      generateShortCode: () =>
        shopRequest("/barcodes/short-code/generate", { method: "POST" }),
      regenerateBarcode: (id, body) =>
        shopRequest(`/barcodes/${id}/regenerate`, { method: "POST", body }),
      replaceBarcode: (id, body) =>
        shopRequest(`/barcodes/${id}/replace`, { method: "POST", body }),
      barcodeLabel: (id) =>
        shopRequest(`/barcodes/${id}/label.svg`, { responseType: "text" }),
      barcodeLabelUrl: (id) => shopPath(shopId, `/barcodes/${id}/label.svg`),
      reservations: (query) =>
        shopRequest(`/barcode-reservations${queryString(query)}`),
      createReservations: (body) =>
        shopRequest("/barcode-reservations", { method: "POST", body }),
      assignReservation: (id, body) =>
        shopRequest(`/barcode-reservations/${id}/assign`, {
          method: "POST",
          body,
        }),
      reservationLabel: (id) =>
        shopRequest(`/barcode-reservations/${id}/label.svg`, {
          responseType: "text",
        }),
    },
    staff: {
      list: () => shopRequest("/staff"),
      add: (body) => shopRequest("/staff", { method: "POST", body }),
      update: (id, body) => shopRequest(`/staff/${id}`, { method: "PATCH", body }),
      policies: () => shopRequest("/role-policies"),
      updatePolicy: (role, permissions) => shopRequest(`/role-policies/${role}`, { method: "PUT", body: { permissions } }),
    },
    audit: (query) => shopRequest(`/audit-logs${queryString(query)}`),
    notifications: {
      list: () => shopRequest("/notifications"),
      markRead: (id) =>
        shopRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    },
  };
}
