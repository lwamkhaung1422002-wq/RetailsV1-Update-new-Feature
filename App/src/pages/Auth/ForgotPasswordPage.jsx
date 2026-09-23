import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Box, Button, Card, CardContent, Container, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { apiRequest } from "../../lib/api";

const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: 1.5, minHeight: 52 } };
const mobileFieldSx = { "& .MuiOutlinedInput-root": { minHeight: 52, borderRadius: 1.5, bgcolor: "rgba(255,255,255,.9)", "& fieldset": { borderColor: "#cbd3df" } } };

export default function ForgotPasswordPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));

  useEffect(() => {
    if (step !== "code" || remaining === 0) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step, remaining]);

  const requestCode = async (event) => {
    event?.preventDefault();
    setSubmitting(true);
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await apiRequest("/auth/forgot-password/request", { method: "POST", body: { email: normalizedEmail } });
      setEmail(normalizedEmail);
      setCode("");
      setClock(Date.now());
      setCooldownUntil(Date.now() + 60_000);
      setStep("code");
    } catch {
      setError("Unable to send a code right now. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await apiRequest("/auth/forgot-password/verify", { method: "POST", body: { email, code } });
      setResetToken(result.resetToken);
      setStep("password");
    } catch {
      setError("Invalid or expired verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/auth/forgot-password/reset", { method: "POST", body: { resetToken, password } });
      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      setStep("success");
    } catch {
      setError("Invalid or expired password reset request. Please start again.");
    } finally {
      setSubmitting(false);
    }
  };

  const backToSignIn = () => navigate("/login", { replace: true });
  const title = step === "email" ? "Forgot Password" : step === "code" ? "Verify Code" : step === "password" ? "Create New Password" : "Password reset successfully.";
  const fieldStyle = isMobile ? mobileFieldSx : fieldSx;
  const primaryButtonSx = isMobile
    ? { minHeight: 55, borderRadius: 1.5, background: "linear-gradient(105deg, #2774ec, #1247d9)", boxShadow: "0 8px 18px rgba(17,73,212,.22)", fontSize: 17, fontWeight: 700, textTransform: "none" }
    : { minHeight: 52, borderRadius: 1.5, fontWeight: 700, textTransform: "none" };
  const content = (
    <Stack component={step === "success" ? "div" : "form"} onSubmit={step === "email" ? requestCode : step === "code" ? verifyCode : resetPassword} spacing={2}>
      <Box sx={{ textAlign: "center" }}>
        <Typography component="h1" sx={{ color: isMobile ? "#102653" : "text.primary", fontSize: { xs: 25, sm: 28 }, fontWeight: 800 }}>{title}</Typography>
        {step === "email" && <Typography color="text.secondary" sx={{ mt: .6, fontSize: 14 }}>Enter the email address associated with your owner account.</Typography>}
        {step === "code" && <><Typography color="text.secondary" sx={{ mt: .6, fontSize: 14 }}>We sent a 6-digit verification code to your email.</Typography><Typography sx={{ mt: .5, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{email}</Typography></>}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {step === "email" && <>
        <TextField required fullWidth type="email" label="Email Address" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} sx={fieldStyle} />
        <Button type="submit" variant="contained" disabled={submitting} sx={primaryButtonSx}>{submitting ? "Please wait…" : "Send Verification Code"}</Button>
      </>}
      {step === "code" && <>
        <TextField required fullWidth label="Verification Code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{6}", maxLength: 6, autoComplete: "one-time-code" } }} sx={fieldStyle} />
        <Button type="submit" variant="contained" disabled={submitting || code.length !== 6} sx={primaryButtonSx}>{submitting ? "Please wait…" : "Verify Code"}</Button>
        <Button type="button" disabled={submitting || remaining > 0} onClick={requestCode} sx={{ textTransform: "none" }}>{remaining > 0 ? `Resend Code (${remaining}s)` : "Resend Code"}</Button>
      </>}
      {step === "password" && <>
        <TextField required fullWidth type="password" label="New Password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 8 } }} sx={fieldStyle} />
        <TextField required fullWidth type="password" label="Confirm Password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 8 } }} sx={fieldStyle} />
        <Button type="submit" variant="contained" disabled={submitting || password.length < 8} sx={primaryButtonSx}>{submitting ? "Please wait…" : "Reset Password"}</Button>
      </>}
      {step === "success" && <Alert severity="success">Password reset successfully.</Alert>}
      <Button type="button" onClick={backToSignIn} sx={{ textTransform: "none", fontWeight: 700 }}>Back to Sign In</Button>
    </Stack>
  );

  if (isMobile) return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "#fff", color: "#101b35", overflowX: "hidden" }}>
      <Box sx={{ height: "clamp(210px, 31vh, 250px)", position: "relative", overflow: "hidden", bgcolor: "#fff", backgroundImage: "radial-gradient(circle at 18% 20%, rgba(32,103,239,.09), transparent 27%), radial-gradient(circle at 88% 35%, rgba(232,181,50,.12), transparent 28%)" }}>
        <Box component="img" src="/branding/kt-smart-retail-logo.png" alt="K&T Smart Retail & Inventory Solutions" sx={{ position: "absolute", inset: "36px 44px 8px", width: "calc(100% - 88px)", height: "calc(100% - 44px)", objectFit: "contain", mixBlendMode: "multiply" }} />
      </Box>
      <Box sx={{ borderTop: "1px solid #e6e9ef", px: { xs: 3, sm: 5 }, pt: 3, pb: 3.5 }}><Box sx={{ maxWidth: 470, mx: "auto" }}>{content}</Box></Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2, py: 3, bgcolor: "background.default" }}>
      <Container maxWidth="xs" disableGutters>
        <Stack spacing={2.5} sx={{ alignItems: "center", mb: 3 }}>
          <Box sx={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 2.5, bgcolor: "primary.main", color: "common.white" }}><StorefrontOutlinedIcon sx={{ fontSize: 30 }} /></Box>
          <Typography variant="h4" fontWeight={800}>General POS</Typography>
        </Stack>
        <Card elevation={0} sx={{ borderRadius: 2.5, border: "1px solid", borderColor: "divider" }}><CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}>{content}</CardContent></Card>
      </Container>
    </Box>
  );
}
