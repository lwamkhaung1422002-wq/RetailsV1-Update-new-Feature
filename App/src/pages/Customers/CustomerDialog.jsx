import { useEffect, useState } from "react";
import { Alert, Button, Divider, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";

export default function CustomerDialog({ open, customer = null, onClose, onSaved }) {
  if (!open) return null;
  return <CustomerDialogForm key={customer?.id || "new"} customer={customer} onClose={onClose} onSaved={onSaved} />;
}

function CustomerDialogForm({ customer, onClose, onSaved }) {
  const api = usePosApi();
  const { shop, hasPermission } = useAuth();
  const canEditBasic = hasPermission("sale.create");
  const canEditCredit = hasPermission("settings.manage");
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: customer?.name || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    city: customer?.city || "",
    creditMode: customer?.creditLimitOverride == null ? "DEFAULT" : "CUSTOM",
    creditLimit: String(customer?.creditLimitOverride ?? ""),
    termsMode: customer?.paymentTermsDaysOverride == null ? "DEFAULT" : "CUSTOM",
    paymentTermsDays: String(customer?.paymentTermsDaysOverride ?? ""),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({ defaultCreditLimit: 0, defaultPaymentTermsDays: 30 });

  useEffect(() => {
    if (!canEditCredit) return undefined;
    let active = true;
    api.shop.getSettings().then(({ settings }) => { if (active) setDefaults(settings); }).catch(() => undefined);
    return () => { active = false; };
  }, [api, canEditCredit]);

  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError("");
  };
  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (canEditBasic && !name) { setError("Customer name is required."); return; }
    const creditLimit = Number(form.creditLimit);
    const paymentTermsDays = Number(form.paymentTermsDays);
    if (canEditCredit && (
      (form.creditMode === "CUSTOM" && (!form.creditLimit.trim() || !Number.isSafeInteger(creditLimit) || creditLimit < 0)) ||
      (form.termsMode === "CUSTOM" && (!form.paymentTermsDays.trim() || !Number.isSafeInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 3650))
    )) { setError("Enter a valid nonnegative credit limit and payment terms between 0 and 3650 days."); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        ...(canEditBasic ? { name, phone: form.phone.trim(), address: form.address.trim(), city: form.city.trim() } : {}),
        ...(canEditCredit ? {
          creditLimitOverride: form.creditMode === "DEFAULT" ? null : creditLimit,
          paymentTermsDaysOverride: form.termsMode === "DEFAULT" ? null : paymentTermsDays,
        } : {}),
      };
      const result = customer?.id ? await api.customers.update(customer.id, body) : await api.customers.create(body);
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      onSaved?.(result.customer);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" slotProps={{ paper: { component: "form", onSubmit: save, sx: { borderRadius: 2.5 } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField autoFocus required fullWidth label="Customer Name" value={form.name} onChange={change("name")} disabled={!canEditBasic} />
      <TextField fullWidth label="Phone" value={form.phone} onChange={change("phone")} disabled={!canEditBasic} />
      <TextField fullWidth label="Address" value={form.address} onChange={change("address")} disabled={!canEditBasic} />
      <TextField fullWidth label="City" value={form.city} onChange={change("city")} disabled={!canEditBasic} />
      {canEditCredit && <><Divider />
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
      </>}
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || (!canEditBasic && !canEditCredit)}>{saving ? "Saving…" : "Save"}</Button></DialogActions>
  </Dialog>;
}
