import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { useManagerApproval } from "../context/approval-context";
import { usePosApi } from "../hooks/useApiResource";
import { useProductsQuery } from "../hooks/usePosQueries";
import { previewExchangeDifference, previewReturnedValue } from "../lib/exchangePreview";
import { queryKeys } from "../lib/queryKeys";

const money = (value) => `${new Intl.NumberFormat("en-US").format(Math.abs(Number(value || 0)))} MMK`;

export default function ExchangeDialog({ open, order, onClose, onSaved }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const { runWithApproval } = useManagerApproval();
  const [returnedQuantities, setReturnedQuantities] = useState({});
  const [conditions, setConditions] = useState({});
  const [replacementProductId, setReplacementProductId] = useState("");
  const [replacementQuantity, setReplacementQuantity] = useState("1");
  const [replacements, setReplacements] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentMethods, setPaymentMethods] = useState(["Cash"]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() || `exchange-${Date.now()}-${Math.random()}`);
  const { data: catalogResult } = useProductsQuery(
    { status: "active", page: 1, pageSize: 100, sort: "name", direction: "asc", view: "catalog" },
    { enabled: open },
  );
  const products = catalogResult?.products || [];

  useEffect(() => {
    if (!open) return;
    api.shop.getSettings().then(({ settings }) => {
      const methods = (settings.paymentMethods || []).filter((entry) => entry.active && entry.type !== "cod").map((entry) => entry.name);
      const next = methods.length ? methods : ["Cash"];
      setPaymentMethods(next);
      setPaymentMethod(next[0]);
    }).catch(() => {
      setPaymentMethods(["Cash"]);
      setPaymentMethod("Cash");
    });
  }, [api, open]);

  const eligibleItems = useMemo(() => (order?.items || []).map((item) => {
    const sold = Number(item.baseQuantity ?? item.quantity ?? 0);
    const returned = (item.returns || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    return { ...item, remainingQuantity: Math.max(0, sold - returned) };
  }).filter((item) => item.remainingQuantity > 0), [order]);
  const returnedValue = useMemo(
    () => previewReturnedValue(order || { items: [] }, returnedQuantities),
    [order, returnedQuantities],
  );
  const replacementValue = replacements.reduce((sum, item) => sum + item.total, 0);
  const difference = previewExchangeDifference(returnedValue, replacementValue);

  const addReplacement = async () => {
    const product = products.find((entry) => entry.id === replacementProductId);
    const quantity = Number(replacementQuantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Select a replacement product and quantity.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const { pricing } = await api.pricing.resolve({ productId: product.id, quantity });
      const unitPrice = Number(pricing.finalUnitPrice || 0);
      setReplacements((current) => [
        ...current.filter((entry) => entry.productId !== product.id),
        { productId: product.id, name: product.name, quantity, unitPrice, total: unitPrice * quantity },
      ]);
      setReplacementProductId("");
      setReplacementQuantity("1");
    } catch (failure) {
      setError(failure.message || "Replacement price could not be resolved.");
    } finally {
      setAdding(false);
    }
  };

  const confirm = async () => {
    const returnedItems = eligibleItems.flatMap((item) => {
      const quantity = Number(returnedQuantities[item.id] || 0);
      if (quantity <= 0) return [];
      const serialIds = item.product?.trackingMode === "SERIAL"
        ? (item.serialAllocations || []).filter((entry) => entry.serial?.status === "SOLD").slice(0, quantity).map((entry) => entry.serialId)
        : undefined;
      return [{
        orderItemId: item.id,
        quantity,
        condition: conditions[item.id] || "SELLABLE",
        reason: reason.trim(),
        ...(serialIds ? { serialIds } : {}),
      }];
    });
    if (!returnedItems.length || !replacements.length || !reason.trim()) {
      setError("Select returned and replacement items, then enter a reason.");
      return;
    }
    const body = {
      reason: reason.trim(),
      paymentMethod,
      returnedItems,
      replacementItems: replacements.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        deductionType: "discount",
        modifierOptionIds: [],
      })),
    };
    setSaving(true);
    setError("");
    try {
      const result = await runWithApproval({
        permission: "payment.refund",
        action: "payment.refund",
        actionLabel: "Exchange",
        targetId: order.id,
        targetLabel: order.orderNumber || order.id,
        amountLabel: difference > 0 ? `Collect ${money(difference)}` : difference < 0 ? `Refund ${money(difference)}` : "No payment difference",
        payload: { orderId: order.id, ...body },
        initialReason: body.reason,
      }, (approvalToken) => api.orders.exchange(order.id, body, idempotencyKey, approvalToken));
      window.dispatchEvent(new Event("inventory-updated"));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "products"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.movements(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }),
      ]);
      await onSaved(result);
    } catch (failure) {
      if (!failure.approvalCancelled) setError(failure.message || "Exchange could not be completed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle fontWeight={800}>Exchange</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography fontWeight={700}>Returned items</Typography>
          {eligibleItems.length ? eligibleItems.map((item) => (
            <Box key={item.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(0,1fr) 100px 120px" }, gap: 1, alignItems: "center" }}>
              <Box>
                <Typography fontWeight={700}>{item.productName}</Typography>
                <Typography variant="caption" color="text.secondary">Available to return: {item.remainingQuantity}</Typography>
              </Box>
              <TextField
                label="Quantity"
                type="number"
                size="small"
                value={returnedQuantities[item.id] || ""}
                onChange={(event) => {
                  const value = Math.min(item.remainingQuantity, Math.max(0, Number(event.target.value || 0)));
                  setReturnedQuantities((current) => ({ ...current, [item.id]: value }));
                }}
                slotProps={{ htmlInput: { min: 0, max: item.remainingQuantity, step: 0.001 } }}
              />
              <TextField select label="Condition" size="small" value={conditions[item.id] || "SELLABLE"} onChange={(event) => setConditions((current) => ({ ...current, [item.id]: event.target.value }))}>
                <MenuItem value="SELLABLE">Sellable</MenuItem>
                <MenuItem value="DAMAGED">Damaged</MenuItem>
              </TextField>
            </Box>
          )) : <Alert severity="info">This sale has no remaining items eligible for exchange.</Alert>}
          <Divider />
          <Typography fontWeight={700}>Replacement items</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(0,1fr) 90px auto" }, gap: 1 }}>
            <TextField select label="Product" size="small" value={replacementProductId} onChange={(event) => setReplacementProductId(event.target.value)}>
              {products.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
            </TextField>
            <TextField label="Quantity" type="number" size="small" value={replacementQuantity} onChange={(event) => setReplacementQuantity(event.target.value)} slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }} />
            <Button variant="outlined" disabled={adding} onClick={() => void addReplacement()}>{adding ? "Adding…" : "Add"}</Button>
          </Box>
          {replacements.map((item) => (
            <Box key={item.productId} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography>{item.name} × {item.quantity}</Typography>
              <Box><Typography component="span" fontWeight={700}>{money(item.total)}</Typography><Button size="small" color="error" onClick={() => setReplacements((current) => current.filter((entry) => entry.productId !== item.productId))}>Remove</Button></Box>
            </Box>
          ))}
          <Divider />
          <Stack spacing={0.75}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography>Returned value</Typography><Typography fontWeight={700}>{money(returnedValue)}</Typography></Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography>Replacement value</Typography><Typography fontWeight={700}>{money(replacementValue)}</Typography></Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography fontWeight={800}>{difference > 0 ? "Collect" : difference < 0 ? "Refund" : "Difference"}</Typography><Typography fontWeight={800}>{money(difference)}</Typography></Box>
          </Stack>
          <TextField select label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            {paymentMethods.map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
          </TextField>
          <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => void confirm()} disabled={saving || !eligibleItems.length}>{saving ? "Processing…" : "Confirm"}</Button>
      </DialogActions>
    </Dialog>
  );
}
