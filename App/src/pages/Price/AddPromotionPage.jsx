import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { AppBar, Box, Button, Chip, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select, TextField, Toolbar, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Alert } from "@mui/material";
import { usePosApi } from "../../hooks/useApiResource";
import { useCategoriesQuery, useProductsQuery, usePromotionCampaignsQuery } from "../../hooks/usePosQueries";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../lib/queryKeys";

const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ကျပ်`;
const apiErrorMessage = (error) => Object.values(error?.payload?.errors || {}).flat().filter(Boolean)[0] || error?.message || "Promotion could not be saved.";
const yangonDateTime = (date, endOfDay = false) => new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}+06:30`);

export default function AddPromotionPage() {
  const navigate = useNavigate();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const [params] = useSearchParams();
  const editing = Boolean(params.get("edit"));
  const [scope, setScope] = useState(editing ? "individual" : "all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(editing ? params.get("edit") : "");
  const [form, setForm] = useState({ name: "", start: "", end: "", percentage: "", manualPrice: "", reason: "", audienceType: "ALL" });
  const { data: productData, error: productsError } = useProductsQuery({ status: "active", page: 1, pageSize: 100, sort: "name", direction: "asc" });
  const { data: categoryData, error: categoriesError } = useCategoriesQuery();
  const { data: campaignData, error: campaignsError } = usePromotionCampaignsQuery();
  const products = useMemo(() => (productData?.products || []).map((product) => ({ ...product, category: product.category?.name || "Uncategorized", description: product.description || "", price: Number(product.price || 0) })), [productData]);
  const categories = categoryData?.categories || [];
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const campaign = useMemo(() => (campaignData?.campaigns || []).find((item) => item.id === params.get("edit")), [campaignData, params]);
  useEffect(() => {
    if (!editing || !campaign) return;
    const promotion = campaign.promotions?.[0];
    if (!promotion) return;
    const timer = window.setTimeout(() => {
      setScope(campaign.scope === "PRODUCT" ? "individual" : campaign.scope.toLowerCase());
      setCategory(campaign.categoryId || "");
      setSelectedId(promotion.productId || "");
      setForm({ name: campaign.name || promotion.name || "", start: promotion.startsAt ? new Date(promotion.startsAt).toISOString().slice(0, 10) : "", end: promotion.endsAt ? new Date(promotion.endsAt).toISOString().slice(0, 10) : "", percentage: promotion.type === "PERCENTAGE" ? String(promotion.value) : "", manualPrice: promotion.type === "FIXED_PRICE" ? String(promotion.value) : "", reason: promotion.reason || "Promotion update", audienceType: promotion.audienceType || "ALL" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [campaign, editing]);
  const selected = products.find((product) => product.id === selectedId);
  const selectedCategoryName = categories.find((item) => item.id === category)?.name;
  const results = useMemo(() => products.filter((product) => !search || [product.name, product.description, product.category].some((value) => value.toLowerCase().includes(search.toLowerCase()))), [products, search]);
  const calculatedPrice = selected && form.percentage !== "" ? Math.round(selected.price * (1 - Number(form.percentage) / 100)) : "";
  const shownPrice = form.manualPrice || (calculatedPrice ? String(calculatedPrice) : "");
  const shownPercentage = selected && form.manualPrice ? ((selected.price - Number(form.manualPrice)) / selected.price * 100).toFixed(1) : form.percentage;
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setPercentage = (value) => setForm((current) => ({ ...current, percentage: value.replace(/[^0-9.]/g, ""), manualPrice: "" }));
  const setManualPrice = (value) => setForm((current) => ({ ...current, manualPrice: value.replace(/[^0-9]/g, ""), percentage: "" }));
  const changeScope = (value) => { setScope(value); if (value !== "individual") setSelectedId(""); };
  const loadError = productsError || categoriesError || campaignsError || (editing && campaignData && !campaign ? new Error("Promotion was not found.") : null);
  const save = async () => { const name = form.name.trim(); const reason = form.reason.trim(); if (saving) return; if (name.length < 2 || !form.start || !form.end || reason.length < 3) { setError("Name, dates, and a reason of at least 3 characters are required."); return; } if (!editing && scope === "individual" && !selected) { setError("Select a product."); return; } if (!editing && scope === "category" && !category) { setError("Select a category."); return; } const type = form.manualPrice ? "FIXED_PRICE" : "PERCENTAGE"; const value = Number(form.manualPrice || form.percentage); if (!Number.isFinite(value) || value <= 0 || (type === "PERCENTAGE" && value > 100)) { setError("Enter a valid discount."); return; } const startsAt = yangonDateTime(form.start); const endsAt = yangonDateTime(form.end, true); if (Number.isNaN(startsAt.valueOf()) || endsAt <= startsAt) { setError("End date must be after start date."); return; } setSaving(true); setError(""); try { const payload = { name, type, value, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason, timeZone: "Asia/Yangon", channel: "ALL", audienceType: form.audienceType, minimumQuantity: 1, discountBase: "REGULAR_PRICE" }; if (editing) await api.pricing.updatePromotionCampaign(campaign.id, { ...payload, expectedVersion: campaign.version }); else await api.pricing.createPromotionCampaign({ ...payload, scope: scope === "individual" ? "PRODUCT" : scope.toUpperCase(), ...(scope === "individual" ? { productId: selected.id } : {}), ...(scope === "category" ? { categoryId: category } : {}), state: "SCHEDULED" }); await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.promotionCampaigns(shop?.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.pricing(shop?.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) })]); void Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }), queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "reports"] })]); navigate("/price?tab=promotion"); } catch (err) { setError(apiErrorMessage(err)); } finally { setSaving(false); } };

  return <Box sx={{ minHeight: "100dvh", pb: 12, bgcolor: "#f8fafc", fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif" }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}><Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}><IconButton aria-label="Back to price and promotion" onClick={() => navigate("/price?tab=promotion")} sx={{ color: "common.white", justifySelf: "start" }}><ArrowBackRoundedIcon /></IconButton><Typography fontWeight={700}>{editing ? "Edit Promotion" : "Add Promotion"}</Typography><Box /></Toolbar></AppBar>
    <Box sx={{ p: 2.5, maxWidth: 620, mx: "auto" }}>
      {(error || loadError) && <Alert severity="error" sx={{ mb: 2 }}>{error || loadError?.message || "Products could not be loaded."}</Alert>}
      <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Apply promotion to</Typography>
      <Paper elevation={0} sx={scopePaperSx}><RadioGroup row value={scope} onChange={(event) => changeScope(event.target.value)} sx={scopeGroupSx}><FormControlLabel value="individual" control={<Radio />} label="Individual" sx={scopeOptionSx} /><FormControlLabel value="category" control={<Radio />} label="Category" sx={scopeOptionSx} /><FormControlLabel value="all" control={<Radio />} label="All" sx={scopeOptionSx} /></RadioGroup></Paper>
      {scope === "category" && <FormControl fullWidth sx={{ mt: 2 }}><InputLabel>Select category</InputLabel><Select label="Select category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>}
      {scope === "all" && <Chip label="All Products" color="primary" variant="outlined" size="small" sx={{ mt: 2, fontWeight: 700 }} />}
      {scope === "individual" && <><TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product by name or barcode" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon color="action" /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton aria-label="Scan barcode"><QrCodeScannerRoundedIcon /></IconButton></InputAdornment> } }} sx={searchSx} /><Paper elevation={1} sx={{ mt: 1.25, overflow: "hidden", borderRadius: 2 }}>{results.map((product, index) => <Box key={product.id} role="button" tabIndex={0} onClick={() => setSelectedId(product.id)} onKeyDown={(event) => event.key === "Enter" && setSelectedId(product.id)} sx={{ px: 2, py: 1.5, cursor: "pointer", bgcolor: selectedId === product.id ? "#eaf3ff" : "background.paper", "&:hover": { bgcolor: "action.hover" } }}><Typography noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{product.name} <Box component="span" sx={{ color: "text.secondary", fontSize: 13, fontWeight: 400 }}>· {product.description} · {product.category}</Box></Typography>{index < results.length - 1 && <Divider sx={{ mt: 1.5 }} />}</Box>)}</Paper></>}
      <TextField fullWidth label="Promotion name" value={form.name} onChange={update("name")} placeholder="e.g. August discount" sx={{ mt: 2.5 }} />
      <TextField select fullWidth label="Audience" value={form.audienceType} onChange={update("audienceType")} sx={{ mt: 2 }}>
        <MenuItem value="ALL">All Customers</MenuItem><MenuItem value="RETAIL">Retail Only</MenuItem><MenuItem value="WHOLESALE">Wholesale Only</MenuItem>
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 2 }}><TextField label="Start date" type="date" value={form.start} onChange={update("start")} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="End date" type="date" value={form.end} onChange={update("end")} slotProps={{ inputLabel: { shrink: true } }} /></Box>
      {scope === "individual" && selected ? <IndividualDiscount product={selected} percentage={shownPercentage} promotionPrice={shownPrice} onPercentage={setPercentage} onManualPrice={setManualPrice} /> : <Paper elevation={1} sx={{ mt: 2.5, p: 2, borderRadius: 2 }}><Typography sx={{ fontSize: 16, fontWeight: 700 }}>Discount</Typography><Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>Set one percentage for {scope === "all" ? "all products" : `the ${selectedCategoryName || "selected"} category`}.</Typography><TextField fullWidth label="Discount percentage" value={form.percentage} onChange={(event) => setPercentage(event.target.value)} placeholder="e.g. 10" inputMode="decimal" sx={{ mt: 2 }} /></Paper>}
      <TextField fullWidth label="Reason" value={form.reason} onChange={update("reason")} placeholder="Why is this promotion being created?" multiline minRows={3} sx={{ mt: 2 }} />
    </Box>
    <Paper elevation={5} sx={footerSx}><Box sx={{ display: "grid", gridTemplateColumns: "0.85fr 1.4fr", gap: 1.5 }}><Button variant="outlined" onClick={() => navigate("/price")} sx={cancelSx}>Cancel</Button><Button variant="contained" disabled={saving} startIcon={<CheckRoundedIcon />} onClick={save} sx={saveSx}>{saving ? "Saving…" : editing ? "Save Promotion" : "Create Promotion"}</Button></Box></Paper>
  </Box>;
}

function IndividualDiscount({ product, percentage, promotionPrice, onPercentage, onManualPrice }) { return <Paper elevation={1} sx={{ mt: 2.5, p: 2, borderRadius: 2 }}><Typography sx={{ fontSize: 17, fontWeight: 700 }}>{product.name}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", columnGap: 1.5, mt: 2 }}><Info label="Current Sell Price" value={money(product.price)} /><Box sx={{ bgcolor: "divider" }} /><Info label="Promotion Price" value={promotionPrice ? money(promotionPrice) : "Not set"} /></Box><TextField fullWidth label="Discount percentage" value={percentage} onChange={(event) => onPercentage(event.target.value)} placeholder="e.g. 10" inputMode="decimal" sx={{ mt: 2.25 }} /><TextField fullWidth label="Manual promotion price" value={promotionPrice} onChange={(event) => onManualPrice(event.target.value)} placeholder="Enter promotion price" inputMode="numeric" sx={{ mt: 1.5 }} /></Paper>; }
function Info({ label, value }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 13 }}>{label}</Typography><Typography sx={{ mt: 0.5, fontWeight: 700 }}>{value}</Typography></Box>; }
const scopePaperSx = { px: 0.75, py: 0.75, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" };
const scopeGroupSx = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", alignItems: "center" };
const scopeOptionSx = { m: 0, minWidth: 0, minHeight: 62, justifyContent: "center", flexDirection: "column", gap: 0.15, "& .MuiRadio-root": { p: 0.35 }, "& .MuiFormControlLabel-label": { fontSize: { xs: 12.5, sm: 14 }, fontWeight: 600, lineHeight: 1.1, whiteSpace: "nowrap" } };
const searchSx = { mt: 2, "& .MuiOutlinedInput-root": { minHeight: 56, borderRadius: 1.5, bgcolor: "background.paper" } };
const footerSx = { position: "fixed", bottom: 0, left: 0, right: 0, p: 2.5, bgcolor: "background.paper" };
const cancelSx = { minHeight: 56, borderRadius: 1.5, borderColor: "divider", color: "text.secondary", fontWeight: 700, textTransform: "none" };
const saveSx = { minHeight: 56, borderRadius: 1.5, fontWeight: 700, textTransform: "none" };
