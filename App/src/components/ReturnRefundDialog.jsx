import { useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { useManagerApproval } from "../context/approval-context";
import { usePosApi } from "../hooks/useApiResource";
import { previewReturnedValue } from "../lib/exchangePreview";
import { queryKeys } from "../lib/queryKeys";

const money = (value) => `${new Intl.NumberFormat("en-US").format(Math.abs(Number(value || 0)))} MMK`;

export default function ReturnRefundDialog({ open, order, onClose, onSaved }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const { runWithApproval } = useManagerApproval();
  const [returnedQuantities, setReturnedQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() || `return-${Date.now()}-${Math.random()}`);
  const eligibleItems = useMemo(() => (order?.items || []).map((item) => {
    const sold = Number(item.baseQuantity ?? item.quantity ?? 0);
    const returned = (item.returns || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    return { ...item, remainingQuantity: Math.max(0, sold - returned) };
  }).filter((item) => item.remainingQuantity > 0), [order]);
  const returnedValue = useMemo(() => previewReturnedValue(order || { items: [] }, returnedQuantities), [order, returnedQuantities]);

  const confirm = async () => {
    const items = eligibleItems.flatMap((item) => {
      const quantity = Number(returnedQuantities[item.id] || 0);
      if (quantity <= 0) return [];
      const serialIds = item.product?.trackingMode === "SERIAL"
        ? (item.serialAllocations || []).filter((entry) => entry.serial?.status === "SOLD").slice(0, quantity).map((entry) => entry.serialId)
        : undefined;
      return [{ orderItemId: item.id, quantity, condition: "SELLABLE", reason: reason.trim(), ...(serialIds ? { serialIds } : {}) }];
    });
    if (!items.length || !reason.trim()) {
      setError("Select at least one item and enter a return reason.");
      return;
    }
    const body = { items };
    setSaving(true); setError("");
    try {
      const result = await runWithApproval({
        permission: "payment.refund", action: "payment.refund", actionLabel: "Return / Refund",
        targetId: order.id, targetLabel: order.orderNumber || order.id,
        amountLabel: `Up to ${money(returnedValue)}`, payload: { orderId: order.id, ...body }, initialReason: reason.trim(),
      }, (approvalToken) => api.orders.returnProducts(order.id, body, idempotencyKey, approvalToken));
      window.dispatchEvent(new Event("inventory-updated"));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "payments"] }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "products"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.movements(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "reports"] }),
      ]);
      await onSaved(result);
    } catch (failure) {
      if (!failure.approvalCancelled) setError(failure.message || "Return / refund could not be completed.");
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle fontWeight={800}>Return / Refund</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {eligibleItems.length ? eligibleItems.map((item) => <Box key={item.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(0,1fr) 100px" }, gap: 1, alignItems: "center" }}>
        <Box><Typography fontWeight={700}>{item.productName}</Typography><Typography variant="caption" color="text.secondary">Available to return: {item.remainingQuantity}</Typography></Box>
        <TextField label="Quantity" type="number" size="small" value={returnedQuantities[item.id] || ""} onChange={(event) => { const value = Math.min(item.remainingQuantity, Math.max(0, Number(event.target.value || 0))); setReturnedQuantities((current) => ({ ...current, [item.id]: value })); }} slotProps={{ htmlInput: { min: 0, max: item.remainingQuantity, step: 0.001 } }} />
      </Box>) : <Alert severity="info">This sale has no remaining items eligible for return.</Alert>}
      <Divider />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography fontWeight={700}>Return value</Typography><Typography fontWeight={800}>{money(returnedValue)}</Typography></Box>
      <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} />
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void confirm()} disabled={saving || !eligibleItems.length}>{saving ? "Processing…" : "Confirm Return"}</Button></DialogActions>
  </Dialog>;
}
