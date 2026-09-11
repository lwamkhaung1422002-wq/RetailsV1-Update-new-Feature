import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { usePosApi } from "../hooks/useApiResource";

export default function ApprovalDialog({ open, action, actionLabel, targetId, targetLabel, amountLabel, payload, initialReason = "", onClose, onApproved }) {
  const api = usePosApi();
  const [approvers, setApprovers] = useState([]);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    api.approvals.approvers().then(({ approvers: rows }) => {
      if (!active) return;
      const configured = (rows || []).filter((entry) => entry.pinConfigured);
      setApprovers(configured);
      setApproverId(configured[0]?.id || "");
    }).catch((failure) => { if (active) setError(failure.message || "Unable to load approvers."); });
    return () => { active = false; };
  }, [api, initialReason, open]);

  const approve = async () => {
    setSaving(true); setError("");
    try {
      const result = await api.approvals.create({ approverId, pin, action, targetId, payload, reason: reason.trim() });
      await onApproved(result.approvalToken, reason.trim());
      onClose();
    } catch (failure) {
      setError(failure.message || "Approval failed.");
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
    <DialogTitle fontWeight={800}>Approval</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography fontWeight={700}>{actionLabel}</Typography>
      {targetLabel && <Typography color="text.secondary">{targetLabel}</Typography>}
      {amountLabel && <Typography fontWeight={700}>{amountLabel}</Typography>}
      <FormControl fullWidth><InputLabel>Manager</InputLabel><Select label="Manager" value={approverId} onChange={(event) => setApproverId(event.target.value)}>{approvers.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {entry.role === "OWNER" ? "Owner" : "Manager"}</MenuItem>)}</Select></FormControl>
      {!approvers.length && !error && <Alert severity="info">No approval PIN configured.</Alert>}
      <TextField label="PIN" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} />
      <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} />
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void approve()} disabled={saving || !approverId || pin.length !== 6 || !reason.trim()}>{saving ? "Approving…" : "Approve"}</Button></DialogActions>
  </Dialog>;
}
