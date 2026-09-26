import { useEffect, useState } from "react";
import { Alert, Button, Divider, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";

export default function CustomerDialog({ open, customer = null, onClose, onSaved }) {
  if (!open) return null;
  return <CustomerDialogForm key={customer?.id || "new"} customer={customer} onClose={onClose} onSaved={onSaved} />;
}

function CustomerDialogForm({ customer, onClose, onSaved }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: customer?.name || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    city: customer?.city || "",
    pricingType: customer?.pricingType || "RETAIL",
    creditMode: customer?.creditLimitOverride == null ? "DEFAULT" : "CUSTOM",
    creditLimit: String(customer?.creditLimitOverride ?? ""),
    termsMode: customer?.paymentTermsDaysOverride == null ? "DEFAULT" : "CUSTOM",
    paymentTermsDays: String(customer?.paymentTermsDaysOverride ?? ""),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({ defaultCreditLimit: 0, defaultPaymentTermsDays: 30 });
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    let active = true;
    api.shop.getSettings().then(({ settings }) => { if (active) setDefaults(settings); }).catch(() => undefined);
    if (customer?.id) api.customers.creditReport(customer.id).then(({ report: value }) => { if (active) setReport(value); }).catch((loadError) => { if (active) setReportError(loadError.message || "Unable to load the credit report."); });
    return () => { active = false; };
  }, [api, customer?.id]);

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Customer name is required.");
      return;
    }
    const creditLimit = Number(form.creditLimit);
    const paymentTermsDays = Number(form.paymentTermsDays);
    if ((form.creditMode === "CUSTOM" && (!form.creditLimit.trim() || !Number.isSafeInteger(creditLimit) || creditLimit < 0)) ||
      (form.termsMode === "CUSTOM" && (!form.paymentTermsDays.trim() || !Number.isSafeInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 3650))) {
      setError("Enter a valid nonnegative credit limit and payment terms between 0 and 3650 days.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name,
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        pricingType: form.pricingType,
        creditLimitOverride: form.creditMode === "DEFAULT" ? null : creditLimit,
        paymentTermsDaysOverride: form.termsMode === "DEFAULT" ? null : paymentTermsDays,
      };
      const result = customer?.id
        ? await api.customers.update(customer.id, body)
        : await api.customers.create(body);
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      onSaved?.(result.customer);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" slotProps={{ paper: { component: "form", onSubmit: save, sx: { borderRadius: 2.5 } } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField autoFocus required fullWidth label="Customer Name" value={form.name} onChange={change("name")} />
          <TextField fullWidth label="Phone" value={form.phone} onChange={change("phone")} />
          <TextField fullWidth label="Address" value={form.address} onChange={change("address")} />
          <TextField fullWidth label="City" value={form.city} onChange={change("city")} />
          <TextField select fullWidth label="Pricing Type" value={form.pricingType} onChange={change("pricingType")}>
            <MenuItem value="RETAIL">Retail</MenuItem>
            <MenuItem value="WHOLESALE">Wholesale</MenuItem>
          </TextField>
          <Divider />
          <TextField select fullWidth label="Credit Limit" value={form.creditMode} onChange={change("creditMode")}>
            <MenuItem value="DEFAULT">Use Shop Default ({Number(defaults.defaultCreditLimit ?? 0).toLocaleString()})</MenuItem>
            <MenuItem value="CUSTOM">Custom</MenuItem>
          </TextField>
          {form.creditMode === "CUSTOM" && <TextField fullWidth label="Custom Credit Limit" type="number" value={form.creditLimit} onChange={change("creditLimit")} slotProps={{ htmlInput: { min: 0, step: 1 } }} />}
          <TextField select fullWidth label="Payment Terms" value={form.termsMode} onChange={change("termsMode")}>
            <MenuItem value="DEFAULT">Use Shop Default ({defaults.defaultPaymentTermsDays ?? 30} days)</MenuItem>
            <MenuItem value="CUSTOM">Custom</MenuItem>
          </TextField>
          {form.termsMode === "CUSTOM" && <TextField fullWidth label="Custom Payment Terms (days)" type="number" value={form.paymentTermsDays} onChange={change("paymentTermsDays")} slotProps={{ htmlInput: { min: 0, max: 3650, step: 1 } }} />}
          {reportError && <Alert severity="warning">{reportError}</Alert>}
          {report && <CreditReport report={report} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function CreditReport({ report }) {
  const amount = (value) => Number(value ?? 0).toLocaleString();
  return <Stack spacing={1.5} sx={{ pt: 1 }}>
    <Divider />
    <Typography fontWeight={700}>Credit Summary</Typography>
    <Typography variant="body2">Limit: {amount(report.effectiveCreditLimit)} · Outstanding: {amount(report.outstanding)}</Typography>
    <Typography variant="body2">Available: {amount(report.availableCredit)} · Overdue: {amount(report.overdueAmount)}</Typography>
    <Divider />
    <Typography fontWeight={700}>Payment Behavior</Typography>
    <Typography variant="body2">Credit invoices: {report.creditInvoices} · On time: {report.paidOnTime} · Paid late: {report.paidLate} · Overdue: {report.currentlyOverdue}</Typography>
    <Typography variant="body2">Average days late: {Number(report.averageDaysLate ?? 0).toFixed(1)} · Longest delay: {report.longestDelay ?? 0} days</Typography>
    <Typography variant="body2">Last payment: {report.lastPayment ? new Date(report.lastPayment).toLocaleDateString() : "None"}</Typography>
    <Divider />
    <Typography fontWeight={700}>Recent Credit Invoices</Typography>
    {report.recentInvoices?.length ? report.recentInvoices.map((invoice) => <Stack key={invoice.orderId} spacing={0.25} sx={{ py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
      <Typography variant="body2" fontWeight={600}>#{invoice.orderNumber || invoice.orderId} · {invoice.status.replaceAll("_", " ")}{invoice.daysLate ? ` · ${invoice.daysLate} days` : ""}</Typography>
      <Typography variant="caption" color="text.secondary">Amount {amount(invoice.effectiveAmount)} · Outstanding {amount(invoice.outstanding)} · Due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "Not recorded"} · Final paid {invoice.finalPaidAt ? new Date(invoice.finalPaidAt).toLocaleDateString() : "—"}</Typography>
    </Stack>) : <Typography variant="body2" color="text.secondary">No credit invoices yet.</Typography>}
  </Stack>;
}
