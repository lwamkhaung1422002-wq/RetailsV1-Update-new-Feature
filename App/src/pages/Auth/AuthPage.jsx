import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import AddAPhotoOutlinedIcon from "@mui/icons-material/AddAPhotoOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CurrencyExchangeRoundedIcon from "@mui/icons-material/CurrencyExchangeRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useAuth } from "../../context/AuthContext";

const fieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: 1.5, minHeight: 52 },
};
const mobileFieldSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 52,
    borderRadius: 1.5,
    bgcolor: "rgba(255,255,255,.9)",
    fontSize: 15,
    "& fieldset": { borderColor: "#cbd3df" },
  },
  "& .MuiInputAdornment-root": { color: "#63708a" },
};

export default function AuthPage({ mode }) {
  const isMobile = useMediaQuery("(max-width:768px)");
  return isMobile ? (
    <MobileAuthPage mode={mode} />
  ) : (
    <DesktopAuthPage mode={mode} />
  );
}

function useAuthForm(mode, requireConfirmation = false) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, continueAsGuest } = useAuth();
  const [form, setForm] = useState({
    name: "",
    shopName: "",
    currencyCode: "MMK",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [logoFile, setLogoFile] = useState(null);
  const [error, setError] = useState(() =>
    location.state?.sessionExpired
      ? "Your session has expired. Please sign in again."
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (
      isRegister &&
      requireConfirmation &&
      form.password !== form.confirmPassword
    ) {
      setError("Password and confirmation do not match.");
      return null;
    }
    setSubmitting(true);
    try {
      const result = isRegister
        ? await register({
            name: form.name,
            shopName: form.shopName,
            currencyCode: form.currencyCode,
            email: form.email,
            password: form.password,
            logoFile,
          })
        : await login({ email: form.email, password: form.password });
      return result;
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in. Please try again.");
      return null;
    } finally {
      setSubmitting(false);
    }
  };
  return {
    isRegister,
    navigate,
    location,
    form,
    logoFile,
    setLogoFile,
    error,
    submitting,
    update,
    submit,
    continueAsGuest,
  };
}

function DesktopAuthPage({ mode }) {
  const {
    isRegister,
    navigate,
    location,
    form,
    error,
    submitting,
    update,
    submit,
    continueAsGuest,
  } = useAuthForm(mode);
  const onSubmit = async (event) => {
    const result = await submit(event);
    if (result)
      navigate(location.state?.from?.pathname || "/", { replace: true });
  };
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 3,
        bgcolor: "background.default",
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Stack spacing={2.5} sx={{ alignItems: "center", mb: 3 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              display: "grid",
              placeItems: "center",
              borderRadius: 2.5,
              bgcolor: "primary.main",
              color: "common.white",
            }}
          >
            <StorefrontOutlinedIcon sx={{ fontSize: 30 }} />
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h4" fontWeight={800}>
              General POS
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {isRegister
                ? "Create your store account"
                : "Sign in to manage your store"}
            </Typography>
          </Box>
        </Stack>
        <Card
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <CardContent
            sx={{
              p: { xs: 2.5, sm: 3.5 },
              "&:last-child": { pb: { xs: 2.5, sm: 3.5 } },
            }}
          >
            <Stack component="form" onSubmit={onSubmit} spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {isRegister && (
                <>
                  <TextField
                    required
                    label="Your name"
                    value={form.name}
                    onChange={update("name")}
                    sx={fieldSx}
                  />
                  <TextField
                    required
                    label="Shop name"
                    value={form.shopName}
                    onChange={update("shopName")}
                    sx={fieldSx}
                  />
                  <TextField
                    required
                    select
                    label="Base currency"
                    value={form.currencyCode}
                    onChange={update("currencyCode")}
                    helperText="This cannot be changed after the shop is created."
                    sx={fieldSx}
                  >
                    <MenuItem value="MMK">Myanmar Kyat (MMK)</MenuItem>
                    <MenuItem value="USD">US Dollar (USD)</MenuItem>
                    <MenuItem value="THB">Thai Baht (THB)</MenuItem>
                  </TextField>
                </>
              )}
              <TextField
                required
                type="email"
                autoComplete="email"
                label="Email"
                value={form.email}
                onChange={update("email")}
                sx={fieldSx}
              />
              <TextField
                required
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                slotProps={{
                  htmlInput: { minLength: isRegister ? 8 : undefined },
                }}
                label="Password"
                value={form.password}
                onChange={update("password")}
                helperText={isRegister ? "At least 8 characters" : undefined}
                sx={fieldSx}
              />
              {!isRegister && <Box sx={{ textAlign: "right" }}><Link component={RouterLink} to="/forgot-password" underline="hover" fontWeight={600} variant="body2">Forgot Password?</Link></Box>}
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                sx={{
                  minHeight: 52,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  textTransform: "none",
                }}
              >
                {submitting
                  ? "Please wait…"
                  : isRegister
                    ? "Create account"
                    : "Sign in"}
              </Button>
              {!isRegister && (
                <Button
                  variant="outlined"
                  onClick={() => {
                    continueAsGuest();
                    navigate("/", { replace: true });
                  }}
                  sx={{
                    minHeight: 48,
                    borderRadius: 1.5,
                    fontWeight: 700,
                    textTransform: "none",
                  }}
                >
                  Continue as guest
                </Button>
              )}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center" }}
              >
                {isRegister
                  ? "Already have an account?"
                  : "New to General POS?"}{" "}
                <Link
                  component={RouterLink}
                  to={isRegister ? "/login" : "/register"}
                  underline="hover"
                  fontWeight={700}
                >
                  {isRegister ? "Sign in" : "Create an account"}
                </Link>
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

function MobileAuthPage({ mode }) {
  const auth = useAuthForm(mode, true);
  const {
    isRegister,
    navigate,
    location,
    form,
    logoFile,
    setLogoFile,
    error,
    submitting,
    update,
    submit,
  } = auth;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef(null);
  const previewUrlRef = useRef("");
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);
  const replacePreview = (file) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreview = file ? URL.createObjectURL(file) : "";
    previewUrlRef.current = nextPreview;
    setPreview(nextPreview);
  };
  const chooseLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFileError("Choose a JPEG, PNG, or WebP logo image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("Logo image must be 5 MB or smaller.");
      return;
    }
    setFileError("");
    replacePreview(file);
    setLogoFile(file);
  };
  const removeLogo = () => {
    replacePreview(null);
    setLogoFile(null);
    setFileError("");
  };
  const field = (label, key, icon, extra = {}) => (
    <Box>
      <Typography
        sx={{ mb: 0.65, color: "#101b35", fontSize: 14, fontWeight: 650 }}
      >
        {label}
      </Typography>
      <TextField
        fullWidth
        required={extra.required !== false}
        type={extra.type || "text"}
        autoComplete={extra.autoComplete}
        value={form[key]}
        onChange={update(key)}
        placeholder={extra.placeholder}
        inputProps={extra.inputProps}
        sx={mobileFieldSx}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">{icon}</InputAdornment>
            ),
            endAdornment: extra.endAdornment,
          },
        }}
      />
    </Box>
  );
  const passwordAdornment = (visible, setVisible) => (
    <InputAdornment position="end">
      <IconButton
        aria-label={visible ? "Hide password" : "Show password"}
        edge="end"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
      </IconButton>
    </InputAdornment>
  );
  const onSubmit = async (event) => {
    const result = await submit(event);
    if (!result) return;
    if (result.logoUploadError) {
      navigate("/settings/shop-details", {
        replace: true,
        state: { logoUploadError: result.logoUploadError },
      });
      return;
    }
    navigate(location.state?.from?.pathname || "/", { replace: true });
  };
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#f8fafc",
        color: "#101b35",
        overflowX: "hidden",
      }}
    >
      <Box
        sx={{
          height: "clamp(210px, 31vh, 250px)",
          position: "relative",
          overflow: "hidden",
          bgcolor: "#fff",
          backgroundImage:
            "radial-gradient(circle at 18% 20%, rgba(32,103,239,.09), transparent 27%), radial-gradient(circle at 88% 35%, rgba(232,181,50,.12), transparent 28%)",
        }}
      >
        {isRegister && (
          <IconButton
            aria-label="Back to sign in"
            onClick={() => navigate("/login")}
            sx={{
              position: "absolute",
              top: 18,
              left: 18,
              zIndex: 1,
              color: "#0d2449",
            }}
          >
            <ArrowBackRoundedIcon sx={{ fontSize: 28 }} />
          </IconButton>
        )}
        <Box
          sx={{
            position: "absolute",
            inset: { xs: "36px 44px 8px", sm: "34px 96px 8px" },
            display: "grid",
            placeItems: "center",
          }}
        >
          <Box
            component="img"
            src="/branding/kt-smart-retail-logo.png"
            alt="K&T Smart Retail & Inventory Solutions"
            sx={{
              width: "75%",
              height: "75%",
              objectFit: "contain",
              mixBlendMode: "multiply",
            }}
          />
        </Box>
      </Box>
      <Box
        sx={{
          borderTop: "1px solid #e6e9ef",
          px: { xs: 3, sm: 5 },
          pt: 3,
          pb: 3.5,
          bgcolor: "#fff",
        }}
      >
        <Box sx={{ maxWidth: 470, mx: "auto" }}>
          <Box sx={{ textAlign: "center", mb: 2.25 }}>
            <Typography
              sx={{
                color: "#102653",
                fontSize: 27,
                lineHeight: 1.18,
                fontWeight: 800,
              }}
            >
              {isRegister ? (
                <>
                  Create{" "}
                  <Box component="span" sx={{ color: "#c88820" }}>
                    Account
                  </Box>
                </>
              ) : (
                <>
                  Welcome{" "}
                  <Box component="span" sx={{ color: "#c88820" }}>
                    Back!
                  </Box>
                </>
              )}
            </Typography>
            <Typography sx={{ mt: 0.6, color: "#69738a", fontSize: 14 }}>
              {isRegister
                ? "Fill in the details to get started"
                : "Sign in to your account to continue"}
            </Typography>
          </Box>
          <Stack component="form" onSubmit={onSubmit} spacing={1.6}>
            {error && <Alert severity="error">{error}</Alert>}
            {isRegister && (
              <>
                {field("Full Name", "name", <AccountCircleOutlinedIcon />, {
                  placeholder: "Enter your full name",
                })}
                {field("Shop Name", "shopName", <StorefrontOutlinedIcon />, {
                  placeholder: "Enter your shop name",
                })}
                <Box>
                  <Typography sx={{ mb: 0.65, color: "#101b35", fontSize: 14, fontWeight: 650 }}>Base Currency</Typography>
                  <TextField
                    select
                    fullWidth
                    required
                    value={form.currencyCode}
                    onChange={update("currencyCode")}
                    helperText="This cannot be changed after the shop is created."
                    sx={mobileFieldSx}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><CurrencyExchangeRoundedIcon /></InputAdornment> } }}
                  >
                    <MenuItem value="MMK">Myanmar Kyat (MMK)</MenuItem>
                    <MenuItem value="USD">US Dollar (USD)</MenuItem>
                    <MenuItem value="THB">Thai Baht (THB)</MenuItem>
                  </TextField>
                </Box>
                <LogoPicker
                  preview={preview}
                  fileName={logoFile?.name}
                  onChoose={() => fileRef.current?.click()}
                  onRemove={removeLogo}
                />
                {fileError && <Alert severity="error">{fileError}</Alert>}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={chooseLogo}
                />
              </>
            )}
            {field("Email Address", "email", <EmailOutlinedIcon />, {
              type: "email",
              autoComplete: "email",
              placeholder: "Enter your email",
            })}
            {field("Password", "password", <LockOutlinedIcon />, {
              type: showPassword ? "text" : "password",
              autoComplete: isRegister ? "new-password" : "current-password",
              placeholder: isRegister
                ? "Create a password"
                : "Enter your password",
              inputProps: { minLength: isRegister ? 8 : undefined },
              endAdornment: passwordAdornment(showPassword, setShowPassword),
            })}
            {!isRegister && <Box sx={{ textAlign: "right" }}><Link component={RouterLink} to="/forgot-password" underline="hover" sx={{ fontSize: 13, fontWeight: 600 }}>Forgot Password?</Link></Box>}
            {isRegister && (
              <>
                <Typography
                  sx={{
                    mt: -1,
                    color: "#68748b",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  • At least 8 characters
                  <br />• Include uppercase &amp; lowercase letters
                  <br />• Include numbers
                </Typography>
                {field(
                  "Confirm Password",
                  "confirmPassword",
                  <LockOutlinedIcon />,
                  {
                    type: showConfirmPassword ? "text" : "password",
                    autoComplete: "new-password",
                    placeholder: "Confirm your password",
                    endAdornment: passwordAdornment(
                      showConfirmPassword,
                      setShowConfirmPassword,
                    ),
                  },
                )}
              </>
            )}
            <Button
              type="submit"
              disabled={submitting}
              variant="contained"
              sx={{
                minHeight: 55,
                mt: 0.25,
                borderRadius: 1.5,
                background: "linear-gradient(105deg, #2774ec, #1247d9)",
                boxShadow: "0 8px 18px rgba(17,73,212,.22)",
                fontSize: 18,
                fontWeight: 700,
                textTransform: "none",
              }}
            >
              {submitting
                ? "Please wait…"
                : isRegister
                  ? "Create Account"
                  : "Sign In"}
            </Button>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.6, py: 0.1 }}
            >
              <Box sx={{ height: 1, flex: 1, bgcolor: "#dfe4ec" }} />
              <Typography sx={{ color: "#738096", fontSize: 14 }}>
                or
              </Typography>
              <Box sx={{ height: 1, flex: 1, bgcolor: "#dfe4ec" }} />
            </Box>
            <Button
              component={RouterLink}
              to={isRegister ? "/login" : "/register"}
              variant="outlined"
              startIcon={
                isRegister ? (
                  <ArrowBackRoundedIcon />
                ) : (
                  <AccountCircleOutlinedIcon />
                )
              }
              sx={{
                minHeight: 52,
                borderRadius: 1.5,
                borderColor: "#cbd3df",
                color: "#102653",
                fontSize: 16,
                fontWeight: 700,
                textTransform: "none",
              }}
            >
              {isRegister ? "Back to Sign In" : "Create New Account"}
            </Button>
          </Stack>
          <Typography
            align="center"
            sx={{ mt: 3, color: "#69738a", fontSize: 12.5, lineHeight: 1.5 }}
          >
            © 2026 K&amp;T Smart Retail &amp;
            <br />
            Inventory Solutions.
            <br />
            All rights reserved.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function LogoPicker({ preview, fileName, onChoose, onRemove }) {
  return (
    <Box>
      <Typography
        sx={{ mb: 0.65, color: "#101b35", fontSize: 14, fontWeight: 650 }}
      >
        Shop Logo{" "}
        <Box component="span" sx={{ color: "#69738a", fontWeight: 400 }}>
          (Optional)
        </Box>
      </Typography>
      <Box
        sx={{
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          p: 1,
          border: "1px dashed #b9c6da",
          borderRadius: 1.5,
          bgcolor: "#f8fbff",
        }}
      >
        {preview ? (
          <Box
            component="img"
            src={preview}
            alt="Selected shop logo"
            sx={{ width: 52, height: 52, borderRadius: 1, objectFit: "cover" }}
          />
        ) : (
          <Box
            sx={{
              width: 52,
              height: 52,
              display: "grid",
              placeItems: "center",
              borderRadius: 1,
              bgcolor: "#eaf2ff",
              color: "primary.main",
            }}
          >
            <AddAPhotoOutlinedIcon />
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 700 }}>
            {fileName || "Choose a photo"}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.2, fontSize: 11.5 }}>
            JPEG, PNG, or WebP · max 5 MB
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
          {preview && (
            <IconButton
              aria-label="Remove selected shop logo"
              onClick={onRemove}
              color="error"
            >
              <DeleteOutlineRoundedIcon />
            </IconButton>
          )}
          <Button
            size="small"
            onClick={onChoose}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {preview ? "Change" : "Choose Photo"}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
