import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
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
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Customer name is required.");
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
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}
