import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useQueryClient } from "@tanstack/react-query";
import { usePosApi } from "../hooks/useApiResource";
import { useAuth } from "../context/AuthContext";
import { useManagerApproval } from "../context/approval-context";
import { refundableSalePayments } from "../lib/refundablePayments";

export default function PaymentCancellationDialog({ kind, recordId, onClose, onSaved }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const { runWithApproval } = useManagerApproval();
  const queryClient = useQueryClient();
  const [record, setRecord] = useState(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const supplier = kind === "supplier";
  const paymentsFor = (value) => supplier
    ? (value.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal)
    : refundableSalePayments(value.payments);
  useEffect(() => {
    let active = true;
    const request = supplier ? api.suppliers.deliveryRecord(recordId) : api.orders.get(recordId);
    request.then((result) => {
      if (!active) return;
      const next = supplier ? result.record : result.order;
      setRecord(next);
      const payments = supplier ? (next.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal) : refundableSalePayments(next.payments);
      setSelected(payments[0]?.id || "");
    }).catch((failure) => { if (active) setError(failure.message || "Unable to load payments."); });
    return () => { active = false; };
  }, [api, recordId, supplier]);
  const payments = record ? paymentsFor(record) : [];
  const paymentMode = supplier ? payments.length > 0 : record?.paymentTracking === true && payments.length > 0;
  const cancelled = record && (record.status === "cancelled" || record.fulfillmentStatus === "cancelled");
  const title = paymentMode ? supplier ? "Cancel Supplier Payment" : "Refund Sale Payment" : supplier ? "Cancel Invoice" : "Cancel Order";
  const save = async () => {
    if (saving || !record || !reason.trim() || cancelled) return;
    setSaving(true); setError("");
    try {
      let cancelledOrder = null;
      // Recheck the current record so an outdated dialog cannot cancel a paid invoice/order.
      const result = supplier ? await api.suppliers.deliveryRecord(recordId) : await api.orders.get(recordId);
      const latest = supplier ? result.record : result.order;
      const active = paymentsFor(latest);
      const mustCancelPayment = supplier ? active.length > 0 : latest.paymentTracking === true && active.length > 0;
      if (latest.status === "cancelled" || latest.fulfillmentStatus === "cancelled") throw new Error("This record is already cancelled.");
      if (mustCancelPayment) {
        const payment = active.find((item) => item.id === selected);
        if (!payment) throw new Error(selected ? "This payment has already been cancelled. Reopen the dialog to refresh." : "Cancel active payments before cancelling this record. Reopen the dialog to refresh.");
        if (supplier) {
          const body = { reason: reason.trim() };
          await runWithApproval({ permission: "supplier.pay", action: "supplier.payment.reverse", actionLabel: "Reverse supplier payment", targetId: selected, targetLabel: title, amountLabel: `${Number(payment.amount).toLocaleString()} MMK`, payload: { deliveryRecordId: recordId, paymentId: selected, ...body }, initialReason: body.reason }, (approvalToken) => approvalToken ? api.suppliers.reverseDeliveryPayment(recordId, selected, body, approvalToken) : api.suppliers.reverseDeliveryPayment(recordId, selected, body));
        } else {
          const body = { originalPaymentId: selected, amount: Number(payment.refundableAmount), note: reason.trim() };
          await runWithApproval({ permission: "payment.refund", action: "payment.refund", actionLabel: "Refund", targetId: recordId, targetLabel: title, amountLabel: `${Number(payment.amount).toLocaleString()} MMK`, payload: { orderId: recordId, ...body }, initialReason: body.note }, (approvalToken) => approvalToken ? api.payments.refundOrder(recordId, body, approvalToken) : api.payments.refundOrder(recordId, body));
        }
      } else {
        if (supplier) await api.suppliers.cancelDeliveryRecord(recordId, { reason: reason.trim() });
        else {
          const body = { reason: reason.trim() };
          const result = await runWithApproval({ permission: "order.cancel", action: "order.cancel", actionLabel: "Cancel paid sale", targetId: recordId, targetLabel: title, payload: { orderId: recordId, ...body }, initialReason: body.reason }, (approvalToken) => approvalToken ? api.orders.cancel(recordId, body, approvalToken) : api.orders.cancel(recordId, body));
          cancelledOrder = result?.order || null;
        }
      }
      if (cancelledOrder) {
        queryClient.setQueriesData({ queryKey: ["shops", shop?.id, "orders"] }, (current) => {
          if (!current?.orders) return current;
          return { ...current, orders: current.orders.map((order) => order.id === cancelledOrder.id ? { ...order, ...cancelledOrder } : order) };
        });
      }
      await Promise.all((supplier ? ["supplier-deliveries", "suppliers", "purchases", "payments", "dashboard", "reports"] : ["orders", "payments", "products", "inventory", "movements", "dashboard", "reports"]).map((resource) => queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, resource] })));
      onSaved?.(cancelledOrder);
      onClose();
    } catch (failure) { if (!failure.approvalCancelled) setError(failure.message || (supplier ? "Cancellation failed." : "Refund failed.")); }
    finally { setSaving(false); }
  };
  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>{record ? title : supplier ? "Cancel Payment" : "Refund Payment"}<IconButton aria-label="Close cancellation" disabled={saving} onClick={onClose}><CloseRoundedIcon /></IconButton></DialogTitle>
    <DialogContent><Stack spacing={1.5}>
      {!record && !error && <Typography>Loading payments…</Typography>}
      {record && <>
        {(supplier || !paymentMode) && <Typography>{paymentMode ? "Choose the payment to cancel and enter a cancellation reason." : "Enter a cancellation reason. The record will be kept."}</Typography>}
        {paymentMode && <TextField select fullWidth label="Payment" value={selected} disabled={saving} onChange={(event) => setSelected(event.target.value)}>{payments.map((payment) => <MenuItem key={payment.id} value={payment.id}>{payment.method} · {Number(supplier ? payment.amount : payment.refundableAmount).toLocaleString()} ကျပ် · {new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}</MenuItem>)}</TextField>}
        <TextField required fullWidth label={paymentMode ? supplier ? "Cancel Payment Reason" : "Refund Reason" : "Cancellation Reason"} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} />
      </>}
      {error && <Alert severity="error">{error}</Alert>}
      {cancelled && <Alert severity="info">This record is already cancelled.</Alert>}
      <Button color="error" variant="contained" disabled={!record || saving || cancelled || !reason.trim() || (paymentMode && !selected)} onClick={save} sx={{ minHeight: 50, textTransform: "none" }}>{saving ? supplier ? "Cancelling…" : "Refunding…" : paymentMode ? supplier ? "Cancel Payment" : "Refund Payment" : title}</Button>
    </Stack></DialogContent>
  </Dialog>;
}
