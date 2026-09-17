import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Stack, TextField, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useNavigate, useSearchParams } from "react-router";
import { apiRequest } from "../../lib/api";
import { ROLE_META } from "../StaffAccess/staffAccessModel";

const fieldSx = { "& .MuiOutlinedInput-root": { minHeight: 52, borderRadius: 1.5 } };

export default function StaffLinkPage({ mode }) {
  const resetMode = mode === "reset";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState({ loading: true, data: null, error: "", success: false });
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const validate = async () => {
      if (!token) {
        setState({ loading: false, data: null, error: "This link is invalid, expired, revoked, or already used.", success: false });
        return;
      }
      try {
        const result = await apiRequest(resetMode ? "/auth/staff-login-reset/validate" : "/auth/staff-invites/validate", { method: "POST", body: { token } });
        if (active) setState({ loading: false, data: resetMode ? result.reset : result.invitation, error: "", success: false });
      } catch {
        if (active) setState({ loading: false, data: null, error: `This ${resetMode ? "reset" : "invitation"} link is invalid, expired, revoked, or already used.`, success: false });
      }
    };
    void validate();
    return () => { active = false; };
  }, [resetMode, token]);

  const submit = async (event) => {
    event.preventDefault();
    if (state.data?.newPasswordRequired !== false && form.password !== form.confirmPassword) {
      setState((current) => ({ ...current, error: "Password and confirmation do not match." }));
      return;
    }
    setSubmitting(true);
    setState((current) => ({ ...current, error: "" }));
    try {
      await apiRequest(resetMode ? "/auth/staff-login-reset/complete" : "/auth/staff-invites/accept", { method: "POST", body: { token, password: form.password } });
      setState((current) => ({ ...current, success: true }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || "Unable to complete this request." }));
    } finally {
      setSubmitting(false);
    }
  };

  const title = resetMode ? "Reset Staff Login" : "Set Up Staff Account";
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#f5f8fc", py: 4 }}>
      <Container maxWidth="sm">
        <Card elevation={0} sx={{ border: "1px solid #dfe7f1", borderRadius: 3, boxShadow: "0 16px 46px rgba(15,23,42,.1)" }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={2.25} component={state.loading || state.success || !state.data ? "div" : "form"} onSubmit={state.loading || state.success || !state.data ? undefined : submit}>
              <Box sx={{ textAlign: "center" }}><Box sx={{ mx: "auto", mb: 1.25, width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 2, bgcolor: "#eaf3ff", color: "primary.main" }}><LockOutlinedIcon sx={{ fontSize: 30 }} /></Box><Typography component="h1" sx={{ color: "#101744", fontSize: { xs: 23, sm: 27 }, fontWeight: 800 }}>{title}</Typography></Box>
              {state.loading && <Stack spacing={1.5} sx={{ alignItems: "center", py: 4 }}><CircularProgress size={32} /><Typography color="text.secondary">Checking your secure link…</Typography></Stack>}
              {state.error && <Alert severity="error">{state.error}</Alert>}
              {state.success && <><Alert severity="success">{resetMode ? "Your password has been reset." : "Your Staff invitation has been accepted."}</Alert><Button variant="contained" size="large" onClick={() => navigate("/login", { replace: true })}>Continue to Login</Button></>}
              {!state.loading && !state.success && state.data && <>
                <Stack spacing={.5}><Typography color="text.secondary" sx={{ fontSize: 13 }}>Email</Typography><Typography sx={{ color: "#101744", fontWeight: 700 }}>{state.data.email}</Typography>{!resetMode && <Typography color="text.secondary" sx={{ fontSize: 13 }}>{ROLE_META[state.data.role]?.label || state.data.role} · {state.data.shopName}</Typography>}</Stack>
                <TextField autoFocus required type="password" label={resetMode || state.data.newPasswordRequired ? "New Password" : "Existing Password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} slotProps={{ htmlInput: { minLength: 8, autoComplete: resetMode || state.data.newPasswordRequired ? "new-password" : "current-password" } }} sx={fieldSx} />
                {(resetMode || state.data.newPasswordRequired) && <TextField required type="password" label="Confirm Password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} slotProps={{ htmlInput: { minLength: 8, autoComplete: "new-password" } }} sx={fieldSx} />}
                <Button type="submit" variant="contained" size="large" disabled={submitting || form.password.length < 8 || ((resetMode || state.data.newPasswordRequired) && form.confirmPassword.length < 8)} sx={{ minHeight: 48, textTransform: "none", fontWeight: 700 }}>{submitting ? "Please wait…" : resetMode ? "Set New Password" : state.data.newPasswordRequired ? "Set Up Account" : "Accept Invitation"}</Button>
              </>}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
