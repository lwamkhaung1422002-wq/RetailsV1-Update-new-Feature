import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useQueryClient } from "@tanstack/react-query";
import { usePosApi } from "../hooks/useApiResource";
import { useAuth } from "../context/AuthContext";

const activeSalePayments = (payments = []) => payments.filter((payment) =>
  Number(payment.amount) > 0 && !payments.some((reversal) => Number(reversal.amount) < 0 && reversal.originalPaymentId === payment.id));

export default function PaymentCancellationDialog({ kind, recordId, onClose, onSaved }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [record, setRecord] = useState(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const supplier = kind === "supplier";
  const paymentsFor = (value) => supplier
    ? (value.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal)
    : activeSalePayments(value.payments);
  useEffect(() => {
    let active = true;
    const request = supplier ? api.suppliers.deliveryRecord(recordId) : api.orders.get(recordId);
    request.then((result) => {
      if (!active) return;
      const next = supplier ? result.record : result.order;
      setRecord(next);
      const payments = supplier ? (next.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal) : activeSalePayments(next.payments);
      setSelected(payments[0]?.id || "");
    }).catch((failure) => { if (active) setError(failure.message || "Unable to load payments."); });
    return () => { active = false; };
  }, [api, recordId, supplier]);
  const payments = record ? paymentsFor(record) : [];
  const paymentMode = payments.length > 0;
  const cancelled = record && (record.status === "cancelled" || record.fulfillmentStatus === "cancelled");
  const title = paymentMode ? supplier ? "Cancel Supplier Payment" : "Cancel Sale Payment" : supplier ? "Cancel Invoice" : "Cancel Order";
  const save = async () => {
    if (saving || !record || !reason.trim() || cancelled) return;
    setSaving(true); setError("");
    try {
      // Recheck the current record so an outdated dialog cannot cancel a paid invoice/order.
      const result = supplier ? await api.suppliers.deliveryRecord(recordId) : await api.orders.get(recordId);
      const latest = supplier ? result.record : result.order;
      const active = paymentsFor(latest);
      if (latest.status === "cancelled" || latest.fulfillmentStatus === "cancelled") throw new Error("This record is already cancelled.");
      if (paymentMode) {
        const payment = active.find((item) => item.id === selected);
        if (!payment) throw new Error("This payment has already been cancelled. Reopen the dialog to refresh.");
        if (supplier) await api.suppliers.reverseDeliveryPayment(recordId, selected, { reason: reason.trim() });
        else await api.payments.refundOrder(recordId, { originalPaymentId: selected, amount: Number(payment.amount), method: payment.method || "Cash", note: reason.trim() });
      } else {
        if (active.length) throw new Error("Cancel active payments before cancelling this record. Reopen the dialog to refresh.");
        if (supplier) await api.suppliers.cancelDeliveryRecord(recordId, { reason: reason.trim() });
        else await api.orders.cancel(recordId, { reason: reason.trim() });
      }
      await Promise.all((supplier ? ["supplier-deliveries", "suppliers", "purchases", "payments", "dashboard", "reports"] : ["orders", "payments", "products", "inventory", "movements", "dashboard", "reports"]).map((resource) => queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, resource] })));
      onSaved?.();
      onClose();
    } catch (failure) { setError(failure.message || "Cancellation failed."); }
    finally { setSaving(false); }
  };
  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>{record ? title : "Cancel Payment"}<IconButton aria-label="Close cancellation" disabled={saving} onClick={onClose}><CloseRoundedIcon /></IconButton></DialogTitle>
    <DialogContent><Stack spacing={1.5}>
      {!record && !error && <Typography>Loading payments…</Typography>}
      {record && <>
        <Typography>{paymentMode ? "Choose the payment to cancel and enter a cancellation reason." : "Enter a cancellation reason. The record will be kept."}</Typography>
        {paymentMode && <TextField select fullWidth label="Payment" value={selected} disabled={saving} onChange={(event) => setSelected(event.target.value)}>{payments.map((payment) => <MenuItem key={payment.id} value={payment.id}>{payment.method} · {Number(payment.amount).toLocaleString()} ကျပ် · {new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}</MenuItem>)}</TextField>}
        <TextField required fullWidth label={paymentMode ? "Cancel Payment Reason" : "Cancellation Reason"} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} />
      </>}
      {error && <Alert severity="error">{error}</Alert>}
      {cancelled && <Alert severity="info">This record is already cancelled.</Alert>}
      <Button color="error" variant="contained" disabled={!record || saving || cancelled || !reason.trim() || (paymentMode && !selected)} onClick={save} sx={{ minHeight: 50, textTransform: "none" }}>{saving ? "Cancelling…" : paymentMode ? "Cancel Payment" : title}</Button>
    </Stack></DialogContent>
  </Dialog>;
}
