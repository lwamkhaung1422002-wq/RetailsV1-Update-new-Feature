import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { Alert, AppBar, Box, Button, IconButton, InputAdornment, Paper, TextField, Toolbar, Typography } from "@mui/material";
import AddAPhotoRoundedIcon from "@mui/icons-material/AddAPhotoRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import { useAppPreferences } from "../../context/AppPreferenceContext";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { useShopDetailsQuery } from "../../hooks/usePosQueries";
import { queryKeys } from "../../lib/queryKeys";

const currencyNames = { MMK: "Myanmar Kyat (MMK)", USD: "US Dollar (USD)", THB: "Thai Baht (THB)" };

export default function ShopDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef(null);
  const previewUrlRef = useRef("");
  const { shop, setShop, t } = useAppPreferences();
  const { shop: authenticatedShop, selectShop } = useAuth();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { data: shopResult, error: shopQueryError } = useShopDetailsQuery();
  const [form, setForm] = useState({ name: shop?.name || "", address: shop?.address || "", logoUrl: shop?.logo || "" });
  const [baseCurrency, setBaseCurrency] = useState("MMK");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestError, setError] = useState(location.state?.logoUploadError || "");
  const [notice, setNotice] = useState("");
  const error = requestError || shopQueryError?.message || "";

  useEffect(() => {
    const persistedShop = shopResult?.shop;
    if (!persistedShop) return;
    const timer = setTimeout(() => {
      setForm({ name: persistedShop.name, address: persistedShop.address || "", logoUrl: persistedShop.logoUrl || "" });
      setBaseCurrency(persistedShop.setting?.currencyCode || "MMK");
    }, 0);
    return () => clearTimeout(timer);
  }, [shopResult]);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const clearLogoPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setLogoPreview("");
  };
  const selectLogoPreview = (file) => {
    clearLogoPreview();
    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;
    setLogoPreview(preview);
  };
  const chooseLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG, or WebP logo image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Logo image must be 5 MB or smaller."); return; }
    setError(""); setNotice(""); setRemoveLogo(false); selectLogoPreview(file); setLogoFile(file);
  };
  const applyUpdatedShop = async (updated) => {
    const preferenceShop = { name: updated.name, address: updated.address || "", logo: updated.logoUrl || "" };
    setForm({ name: updated.name, address: updated.address || "", logoUrl: updated.logoUrl || "" });
    setShop(preferenceShop);
    if (authenticatedShop) selectShop({ ...authenticatedShop, ...updated });
    queryClient.setQueryData(queryKeys.shopDetails(authenticatedShop?.id), { shop: updated });
    await queryClient.invalidateQueries({ queryKey: ["shops", authenticatedShop?.id, "settings"] });
  };
  const removeSelectedLogo = () => { clearLogoPreview(); setLogoFile(null); setRemoveLogo(true); setNotice(""); };
  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      let result = await api.shop.update({ name: form.name.trim() || "POS System", address: form.address.trim() || null });
      let updated = result.shop;
      if (removeLogo && updated.logoUrl) { result = await api.shop.removeLogo(); updated = result.shop; }
      if (logoFile) { result = await api.shop.uploadLogo(logoFile); updated = result.shop; }
      await applyUpdatedShop(updated);
      clearLogoPreview(); setLogoFile(null); setRemoveLogo(false); setNotice("Shop details updated successfully.");
    } catch (requestError) { setError(requestError.message || "Shop details could not be updated. Please try again."); }
    finally { setSaving(false); }
  };
  const visibleLogo = logoPreview || (removeLogo ? "" : form.logoUrl);
  return <Box sx={{ minHeight: "100dvh", pb: 12, bgcolor: "#f8fafc", fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif" }}><AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}><Toolbar sx={{ minHeight: 70, display: "grid", gridTemplateColumns: "48px minmax(0,1fr) 48px" }}><IconButton aria-label="Back to settings" onClick={() => navigate("/settings")} sx={{ color: "common.white" }}><ArrowBackRoundedIcon sx={{ fontSize: 32 }} /></IconButton><Typography align="center" sx={{ fontSize: 22, fontWeight: 700 }}>{t("Edit Shop Details")}</Typography><Box /></Toolbar></AppBar><Box sx={{ px: { xs: 3.25, sm: 4 }, pt: 3.5, maxWidth: 640, mx: "auto" }}>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{notice && <Alert severity="success" sx={{ mb: 2 }}>{t(notice)}</Alert>}<Box sx={{ display: "grid", justifyItems: "center", mb: 4 }}><Box role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(event) => event.key === "Enter" && fileRef.current?.click()} sx={{ width: 144, height: 144, borderRadius: "50%", overflow: "hidden", border: "2px solid", borderColor: "#b8b8b8", bgcolor: "#ededed", display: "grid", placeItems: "center", cursor: "pointer", color: "#737373" }}>{visibleLogo ? <Box component="img" src={visibleLogo} alt="Shop logo preview" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <AddAPhotoRoundedIcon sx={{ fontSize: 57 }} />}</Box><Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}><Button startIcon={<AddAPhotoRoundedIcon />} onClick={() => fileRef.current?.click()} sx={{ color: "primary.main", fontSize: 17, fontWeight: 600, textTransform: "none" }}>{t(visibleLogo ? "Change Shop Logo" : "Choose Shop Logo")}</Button>{visibleLogo && <IconButton aria-label="Remove shop logo" onClick={removeSelectedLogo} color="error"><DeleteOutlineRoundedIcon /></IconButton>}</Box><Typography color="text.secondary" sx={{ mt: .25, fontSize: 12 }}>JPEG, PNG, or WebP · maximum 5 MB</Typography><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={chooseLogo} /></Box><Typography sx={labelSx}>{t("Shop Name")}</Typography><TextField fullWidth value={form.name} onChange={change("name")} placeholder={t("Enter shop name")} slotProps={{ input: { startAdornment: <InputAdornment position="start"><StorefrontRoundedIcon /></InputAdornment> } }} sx={inputSx} /><Typography sx={{ ...labelSx, mt: 3 }}>{t("Address")}</Typography><TextField fullWidth value={form.address} onChange={change("address")} placeholder={t("Enter shop address")} multiline minRows={3} slotProps={{ input: { startAdornment: <InputAdornment position="start"><LocationOnRoundedIcon /></InputAdornment> } }} sx={addressSx} /><Typography sx={{ ...labelSx, mt: 3 }}>{t("Base Currency")}</Typography><TextField fullWidth value={currencyNames[baseCurrency] || baseCurrency} helperText={t("Base currency is fixed when the shop is created.")} slotProps={{ input: { readOnly: true } }} sx={inputSx} /></Box><Paper elevation={5} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, p: 2.5, bgcolor: "background.paper" }}><Button fullWidth variant="contained" startIcon={<CheckRoundedIcon />} disabled={saving} onClick={save} sx={{ minHeight: 58, borderRadius: 1.5, fontSize: 17, fontWeight: 700, textTransform: "none" }}>{t(saving ? "Updating…" : "Update Shop")}</Button></Paper></Box>;
}
const labelSx = { mb: 1.25, fontSize: 18, fontWeight: 700 };
const inputSx = { "& .MuiOutlinedInput-root": { minHeight: 74, borderRadius: 1.75, bgcolor: "background.paper", fontSize: 18, "& .MuiInputAdornment-root": { mr: 2, color: "text.primary" } } };
const addressSx = { "& .MuiOutlinedInput-root": { alignItems: "flex-start", minHeight: 144, borderRadius: 1.75, bgcolor: "background.paper", fontSize: 18, pt: 2, "& .MuiInputAdornment-root": { mt: .2, mr: 2, color: "text.primary" } } };
