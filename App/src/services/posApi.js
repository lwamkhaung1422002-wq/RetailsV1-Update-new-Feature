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
      payments: (query) => shopRequest(`/reports/payments${queryString(query)}`),
      operations: (query) => shopRequest(`/reports/operations${queryString(query)}`),
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
      sourceHistory: (id) => shopRequest(`/products/${id}/source-history`),
      create: (body) => shopRequest("/products", { method: "POST", body }),
      update: (id, body) =>
        shopRequest(`/products/${id}`, { method: "PATCH", body }),
      generateShortCode: (id) =>
        shopRequest(`/products/${id}/short-code/generate`, { method: "POST" }),
      remove: (id) => shopRequest(`/products/${id}`, { method: "DELETE" }),
    },
    units: {
      list: () => shopRequest("/units"),
      create: (body) => shopRequest("/units", { method: "POST", body }),
    },
    inventory: {
      list: (query) => shopRequest(`/inventory${queryString(query)}`),
      create: (body) => shopRequest("/inventory", { method: "POST", body }),
      update: (inventoryBatchId, body) =>
        shopRequest(`/inventory/${inventoryBatchId}`, { method: "PATCH", body }),
      adjust: (inventoryBatchId, body, approvalToken) =>
        shopRequest(`/inventory/${inventoryBatchId}/adjustments`, {
          method: "POST",
          body,
          ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}),
        }),
      adjustByCost: (body, approvalToken) => shopRequest("/inventory/adjustments/by-cost", { method: "POST", body, ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}) }),
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
      reverseDeliveryPayment: (recordId, paymentId, body, approvalToken) =>
        shopRequest(
          `/supplier-delivery-records/${recordId}/payments/${paymentId}/reverse`,
          { method: "POST", body, ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}) },
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
    customers: {
      list: (query) => shopRequest(`/customers${queryString(query)}`),
      create: (body) => shopRequest("/customers", { method: "POST", body }),
      update: (id, body) =>
        shopRequest(`/customers/${id}`, { method: "PATCH", body }),
    },
    purchases: {
      list: (query) => shopRequest(`/purchases${queryString(query)}`),
      create: (body) => shopRequest("/purchases", { method: "POST", body }),
      pay: (id, body) =>
        shopRequest(`/purchases/${id}/payments`, { method: "POST", body }),
      reversePayment: (purchaseId, paymentId, body, approvalToken) =>
        shopRequest(`/purchases/${purchaseId}/payments/${paymentId}/reverse`, {
          method: "POST",
          body,
          ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}),
        }),
    },
    payments: {
      history: (query) => shopRequest(`/payment-history${queryString(query)}`),
      list: (query) => shopRequest(`/payments${queryString(query)}`),
      addToOrder: (orderId, body) =>
        shopRequest(`/orders/${orderId}/payments`, { method: "POST", body }),
      refundOrder: (orderId, body, approvalToken) =>
        shopRequest(`/orders/${orderId}/refunds`, { method: "POST", body, ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}) }),
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
      cancel: (id, body, approvalToken) =>
        shopRequest(`/orders/${id}/cancel`, { method: "POST", body, ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}) }),
      exchange: (id, body, idempotencyKey, approvalToken) =>
        shopRequest(`/orders/${id}/exchanges`, {
          method: "POST",
          body,
          headers: {
            "Idempotency-Key": idempotencyKey,
            ...(approvalToken ? { "x-manager-approval": approvalToken } : {}),
          },
        }),
      returnProducts: (id, body, idempotencyKey, approvalToken) =>
        shopRequest(`/orders/${id}/product-returns`, {
          method: "POST",
          body,
          headers: {
            "Idempotency-Key": idempotencyKey,
            ...(approvalToken ? { "x-manager-approval": approvalToken } : {}),
          },
        }),
      remove: (id) => shopRequest(`/orders/${id}`, { method: "DELETE" }),
    },
    pricing: {
      overview: (query) =>
        shopRequest(`/pricing/overview${queryString(query)}`),
      resolve: (body) =>
        shopRequest("/pricing/resolve", { method: "POST", body }),
      prices: (query) => shopRequest(`/prices${queryString(query)}`),
      createPrice: (body, approvalToken) => shopRequest("/prices", { method: "POST", body, ...(approvalToken ? { headers: { "x-manager-approval": approvalToken } } : {}) }),
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
      list: (branchId = shopId) => request(shopPath(branchId, "/staff")),
      add: (body, branchId = shopId) => request(shopPath(branchId, "/staff"), { method: "POST", body }),
      update: (id, body, branchId = shopId) => request(shopPath(branchId, `/staff/${id}`), { method: "PATCH", body }),
      generateInviteLink: (inviteId, branchId = shopId) => request(shopPath(branchId, `/staff-invites/${inviteId}/link`), { method: "POST" }),
      cancelInvite: (inviteId, branchId = shopId) => request(shopPath(branchId, `/staff-invites/${inviteId}`), { method: "DELETE" }),
      resetLogin: (id, branchId = shopId) => request(shopPath(branchId, `/staff/${id}/reset-login`), { method: "POST" }),
      policies: (branchId = shopId) => request(shopPath(branchId, "/role-policies")),
      updatePolicy: (role, permissions, branchId = shopId) => request(shopPath(branchId, `/role-policies/${role}`), { method: "PUT", body: { permissions } }),
    },
    approvals: {
      approvers: (branchId = shopId) => request(shopPath(branchId, "/approvers")),
      create: (body) => shopRequest("/approvals", { method: "POST", body }),
      setPin: (body, branchId = shopId) => request(shopPath(branchId, "/approval-pin"), { method: "PUT", body }),
    },
    branches: {
      overview: () => shopRequest("/branches"),
      inventory: () => shopRequest("/branches/inventory"),
      create: (body) => shopRequest("/branches", { method: "POST", body }),
      update: (branchId, body) => shopRequest(`/branches/${branchId}`, { method: "PATCH", body }),
    },
    audit: (query) => shopRequest(`/audit-logs${queryString(query)}`),
    notifications: {
      list: () => shopRequest("/notifications"),
      markRead: (id) =>
        shopRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    },
  };
}
