import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";

export default function CreditDefaultsDialog({ open, onClose }) {
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState("0");
  const [days, setDays] = useState("30");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    api.shop.getSettings().then(({ settings }) => {
      if (!active) return;
      setLimit(String(settings.defaultCreditLimit ?? 0));
      setDays(String(settings.defaultPaymentTermsDays ?? 30));
      setLoaded(true);
      setLoading(false);
    }).catch((loadError) => {
      if (active) { setError(loadError.message || "Unable to load Credit Defaults."); setLoading(false); }
    });
    return () => { active = false; };
  }, [api, open]);

  const save = async () => {
    const creditLimit = Number(limit);
    const paymentTerms = Number(days);
    if (!limit.trim() || !days.trim() || !Number.isSafeInteger(creditLimit) || creditLimit < 0 || !Number.isSafeInteger(paymentTerms) || paymentTerms < 0 || paymentTerms > 3650) {
      setError("Enter a nonnegative credit limit and payment terms between 0 and 3650 days.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.shop.updateSettings({ defaultCreditLimit: creditLimit, defaultPaymentTermsDays: paymentTerms });
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save Credit Defaults.");
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>Credit Defaults</DialogTitle>
    <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2" color="text.secondary">Applies to customers using Shop Default. Custom customer limits and terms are not changed.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Default Credit Limit" type="number" value={limit} onChange={(event) => { setLimit(event.target.value); setError(""); }} slotProps={{ htmlInput: { min: 0, step: 1 } }} fullWidth disabled={loading || saving} />
      <TextField label="Default Payment Terms (days)" type="number" value={days} onChange={(event) => { setDays(event.target.value); setError(""); }} slotProps={{ htmlInput: { min: 0, max: 3650, step: 1 } }} fullWidth disabled={loading || saving} />
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" onClick={save} disabled={!loaded || saving}>Save</Button></DialogActions>
  </Dialog>;
}
