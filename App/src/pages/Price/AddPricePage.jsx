import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { AppBar, Box, Button, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select, Tab, Tabs, TextField, Toolbar, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Alert } from "@mui/material";
import { usePosApi } from "../../hooks/useApiResource";
import { useCategoriesQuery } from "../../hooks/usePosQueries";
import { useAuth } from "../../context/AuthContext";
import { useManagerApproval } from "../../context/approval-context";
import { queryKeys } from "../../lib/queryKeys";
import WholesalePricingSection from "./WholesalePricingSection";
import ProductSearchSelector from "./ProductSearchSelector";

const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ကျပ်`;
const apiErrorMessage = (error) => Object.values(error?.payload?.errors || {}).flat().filter(Boolean)[0] || error?.message || "Price could not be saved.";

export default function AddPricePage() {
  const navigate = useNavigate();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { runWithApproval } = useManagerApproval();
  const [params] = useSearchParams();
  const editing = Boolean(params.get("edit"));
  const [scope, setScope] = useState(editing ? "individual" : "all");
  const [category, setCategory] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [pricingTab, setPricingTab] = useState("retail");
  const [wholesaleStatus, setWholesaleStatus] = useState({ loading: true, saving: false, available: true });
  const wholesaleRef = useRef(null);
  const [margin, setMargin] = useState("");
  const [newSellPrice, setNewSellPrice] = useState("");
  const [reason, setReason] = useState("");
  const { data: categoryData, error: categoriesError } = useCategoriesQuery();
  const categories = categoryData?.categories || [];
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const numericMargin = Number(margin);
  const calculatedPrice = selectedProduct && Number.isFinite(numericMargin) && margin !== "" ? Math.round(selectedProduct.cost * (1 + numericMargin / 100)) : null;
  const updateMargin = (value) => { setMargin(value.replace(/[^0-9.]/g, "")); setNewSellPrice(""); };
  const updateManualPrice = (value) => { setNewSellPrice(value.replace(/[^0-9]/g, "")); setMargin(""); };

  const selectProduct = (product) => { setSelectedProduct(product); setMargin(""); setNewSellPrice(""); setPricingTab("retail"); setWholesaleStatus({ loading: true, saving: false, available: true }); setError(""); };
  const changeProduct = () => { setSelectedProduct(null); setMargin(""); setNewSellPrice(""); setPricingTab("retail"); setError(""); };
  const changeScope = (value) => { setScope(value); if (value !== "individual") changeProduct(); };
  const loadError = categoriesError;
  const save = async () => { const normalizedReason = reason.trim(); if (normalizedReason.length < 3) { setError("Reason must contain at least 3 characters."); return; } if (scope === "individual" && !selectedProduct) { setError("Select a product."); return; } if (scope === "category" && !category) { setError("Select a category."); return; } const price = Number(newSellPrice || calculatedPrice); if (scope === "individual" && (!Number.isInteger(price) || price < 0)) { setError("Enter a valid selling price."); return; } if (scope !== "individual" && !Number.isFinite(Number(margin))) { setError("Enter a valid margin percentage."); return; } setSaving(true); setError(""); try { if (scope === "individual") { const body = { productId: selectedProduct.id, unitPrice: price, effectiveFrom: new Date().toISOString(), reason: normalizedReason }; await runWithApproval({ permission: "price.edit", action: "price.override", actionLabel: "Price override", targetId: selectedProduct.id, targetLabel: selectedProduct.name, amountLabel: money(price), payload: body, initialReason: normalizedReason }, (approvalToken) => api.pricing.createPrice(body, approvalToken)); } else await api.pricing.bulkPrices({ scope: scope.toUpperCase(), ...(scope === "category" ? { categoryId: category } : {}), marginPercent: Number(margin), reason: normalizedReason }); await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.pricing(shop?.id) })]); void Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }), queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "reports"] })]); navigate("/price"); } catch (err) { if (!err.approvalCancelled) setError(apiErrorMessage(err)); } finally { setSaving(false); } };
  return <Box sx={{ minHeight: "100dvh", bgcolor: "#f8fafc", pb: 12, fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif" }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}><Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}><IconButton aria-label="Back to price and promotion" onClick={() => navigate("/price")} sx={{ color: "common.white", justifySelf: "start" }}><ArrowBackRoundedIcon /></IconButton><Typography fontWeight={700}>{editing ? "Edit Price" : "Add Price"}</Typography><Box /></Toolbar></AppBar>
    <Box sx={{ p: 2.5, maxWidth: 620, mx: "auto" }}>
      {(error || loadError) && <Alert severity="error" sx={{ mb: 2 }}>{error || loadError?.message || "Products could not be loaded."}</Alert>}
      <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Apply price to</Typography>
      <Paper elevation={0} sx={{ px: 0.75, py: 0.75, borderRadius: 2, border: "1px solid", borderColor: "divider" }}><RadioGroup row value={scope} onChange={(event) => changeScope(event.target.value)} sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", alignItems: "center" }}><FormControlLabel value="individual" control={<Radio />} label="Individual" sx={scopeOptionSx} /><FormControlLabel value="category" control={<Radio />} label="Category" sx={scopeOptionSx} /><FormControlLabel value="all" control={<Radio />} label="All" sx={scopeOptionSx} /></RadioGroup></Paper>
      {scope === "category" && <FormControl fullWidth sx={{ mt: 2 }}><InputLabel>Select category</InputLabel><Select label="Select category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>}
      {scope === "individual" && <ProductSearchSelector selectedProduct={selectedProduct} onSelect={selectProduct} onChange={changeProduct} initialProductId={editing ? params.get("edit") : null} />}
      {scope === "individual" && selectedProduct && <>
        <Tabs value={pricingTab} onChange={(_event, value) => setPricingTab(value)} aria-label="Price type" sx={{ mt: 2 }}><Tab value="retail" label="Retail" /><Tab value="wholesale" label="Wholesale" /></Tabs>
        <Box sx={{ display: pricingTab === "retail" ? "block" : "none" }}><IndividualPriceEditor product={selectedProduct} margin={margin} newSellPrice={newSellPrice} calculatedPrice={calculatedPrice} onMargin={updateMargin} onManualPrice={updateManualPrice} reason={reason} onReason={(event) => setReason(event.target.value)} /></Box>
        <Box sx={{ display: pricingTab === "wholesale" ? "block" : "none" }}><WholesalePricingSection key={selectedProduct.id} ref={wholesaleRef} product={selectedProduct} hideSaveButton onStatusChange={setWholesaleStatus} /></Box>
      </>}
      {scope !== "individual" && <BulkPriceEditor scope={scope} category={category} margin={margin} onMargin={updateMargin} reason={reason} onReason={(event) => setReason(event.target.value)} />}
    </Box>
    <Paper elevation={5} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, p: 2.5, bgcolor: "background.paper" }}><Box sx={{ display: "grid", gridTemplateColumns: "0.85fr 1.4fr", gap: 1.5 }}><Button variant="outlined" onClick={() => navigate("/price")} sx={{ minHeight: 56, borderRadius: 1.5, textTransform: "none", fontSize: 16, fontWeight: 700, borderColor: "divider", color: "text.secondary" }}>Cancel</Button><Button variant="contained" startIcon={<CheckRoundedIcon />} disabled={saving || (scope === "individual" && selectedProduct && pricingTab === "wholesale" && (wholesaleStatus.loading || wholesaleStatus.saving || !wholesaleStatus.available))} onClick={scope === "individual" && selectedProduct && pricingTab === "wholesale" ? () => void wholesaleRef.current?.save() : save} sx={{ minHeight: 56, borderRadius: 1.5, textTransform: "none", fontSize: 16, fontWeight: 700 }}>{scope === "individual" && selectedProduct && pricingTab === "wholesale" ? wholesaleStatus.saving ? "Saving…" : "Save Wholesale Pricing" : saving ? "Saving…" : scope === "individual" ? editing ? "Save Retail Price" : "Apply Retail Price" : editing ? "Save Price" : "Apply Price"}</Button></Box></Paper>
  </Box>;
}

function BulkPriceEditor({ scope, category, margin, onMargin, reason, onReason }) { return <Paper elevation={1} sx={{ mt: 2.5, p: 2, borderRadius: 2 }}><Typography sx={{ fontSize: 16, fontWeight: 700 }}>Price margin</Typography><Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>Apply a margin to {scope === "all" ? "all products" : `the ${category} category`}.</Typography><TextField fullWidth label="Margin percentage" value={margin} onChange={(event) => onMargin(event.target.value)} placeholder="e.g. 15" inputMode="decimal" sx={{ mt: 2 }} /><TextField fullWidth label="Reason" value={reason} onChange={onReason} placeholder="Why is this price being changed?" multiline minRows={3} sx={{ mt: 2 }} /></Paper>; }

function IndividualPriceEditor({ product, margin, newSellPrice, calculatedPrice, onMargin, onManualPrice, reason, onReason }) { const displayedPrice = newSellPrice || (calculatedPrice ? String(calculatedPrice) : ""); const manualMargin = newSellPrice ? ((Number(newSellPrice) - product.cost) / product.cost) * 100 : null; const displayedMargin = manualMargin !== null && Number.isFinite(manualMargin) ? manualMargin.toFixed(1) : margin; return <Paper elevation={1} sx={{ mt: 2.5, p: 2, borderRadius: 2 }}><Typography sx={{ fontSize: 17, fontWeight: 700 }}>{product.name}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", columnGap: 1.5, mt: 2 }}><PriceInfo label="Cost Price" value={money(product.cost)} /><Box sx={{ bgcolor: "divider" }} /><PriceInfo label="Current Sell Price" value={money(product.price)} /></Box><TextField fullWidth label="Margin percentage" value={displayedMargin} onChange={(event) => onMargin(event.target.value)} placeholder="e.g. 15" inputMode="decimal" sx={{ mt: 2.25 }} /><TextField fullWidth label="New Sell Price" value={displayedPrice} onChange={(event) => onManualPrice(event.target.value)} placeholder="Enter new sell price" inputMode="numeric" sx={{ mt: 1.5 }} /><TextField fullWidth label="Reason" value={reason} onChange={onReason} placeholder="Why is this price being changed?" multiline minRows={3} sx={{ mt: 2 }} /></Paper>; }
function PriceInfo({ label, value }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 13 }}>{label}</Typography><Typography sx={{ mt: 0.5, fontWeight: 700 }}>{value}</Typography></Box>; }
const scopeOptionSx = { m: 0, minWidth: 0, minHeight: 62, justifyContent: "center", flexDirection: "column", gap: 0.15, "& .MuiRadio-root": { p: 0.35 }, "& .MuiFormControlLabel-label": { fontSize: { xs: 12.5, sm: 14 }, fontWeight: 600, lineHeight: 1.1, whiteSpace: "nowrap" } };
