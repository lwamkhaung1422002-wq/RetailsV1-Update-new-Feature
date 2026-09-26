import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";

const sameTarget = (tier, unitId, variantId) => tier.productUnitId === unitId && (tier.variantId || "") === variantId;
const money = (value) => Number(value ?? 0).toLocaleString("en-US");
const impliedMargin = (price, cost) => cost > 0 && Number.isFinite(Number(price)) ? String(Math.round(((Number(price) - cost) / cost) * 10_000) / 100) : "";
const calculatedPrice = (margin, cost) => margin !== "" && cost > 0 && Number.isFinite(Number(margin))
  ? Math.round(cost * (1 + Number(margin) / 100)) : null;

const WholesalePricingSection = forwardRef(function WholesalePricingSection({ product, hideSaveButton = false, onStatusChange }, ref) {
  const api = usePosApi();
  const { hasPermission } = useAuth();
  const isMobile = useMediaQuery("(max-width:600px)");
  const canEdit = hasPermission("price.edit");
  const sellingUnits = useMemo(() => (product.units || []).filter((item) => item.canSell !== false && item.unit?.isActive !== false), [product.units]);
  const [unitId, setUnitId] = useState(() => sellingUnits.find((item) => item.isBase)?.id || sellingUnits[0]?.id || "");
  const [variantId, setVariantId] = useState("");
  const [tiers, setTiers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [methods, setMethods] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    api.pricing.wholesalePricing(product.id)
      .then((result) => { if (alive) setTiers(result.tiers || []); })
      .catch((failure) => { if (alive) setLoadError(failure.message || "Unable to load Wholesale Pricing."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, product.id]);

  useEffect(() => { onStatusChange?.({ loading, saving, available: canEdit && !loadError && Boolean(sellingUnits.length) }); }, [loading, saving, canEdit, loadError, sellingUnits.length, onStatusChange]);

  const targetKey = `${unitId}|${variantId}`;
  const savedLevels = tiers.filter((tier) => sameTarget(tier, unitId, variantId)).map((tier) => ({
    id: tier.id,
    minimumQuantity: String(tier.minimumQuantity),
    unitPrice: String(tier.unitPrice),
    margin: "",
  }));
  const levels = drafts[targetKey] ?? savedLevels;
  const method = methods[targetKey] ?? (savedLevels.length ? "fixed" : "margin");
  const unit = sellingUnits.find((item) => item.id === unitId);
  const unitName = unit?.unit?.name || "Unit";
  const baseUnitName = sellingUnits.find((item) => item.isBase)?.unit?.name || "base unit";
  const factor = Number(unit?.conversionFactor ?? 1);
  const variant = (product.variants || []).find((item) => item.id === variantId);
  const baseCost = Number(variantId ? (variant?.cost ?? product.cost ?? 0) : (product.cost ?? 0));
  const unitCost = baseCost * factor;
  const validCost = Number.isFinite(unitCost) && unitCost >= 0;
  const updateLevels = (update) => setDrafts((current) => ({ ...current, [targetKey]: update(current[targetKey] ?? levels) }));
  const updateLevel = (index, field, value) => updateLevels((current) => current.map((level, levelIndex) => levelIndex === index ? { ...level, [field]: value } : level));
  const clearMessages = () => { setError(""); setNotice(""); };
  const changeMethod = (_event, nextMethod) => {
    if (!nextMethod || nextMethod === method) return;
    if (nextMethod === "margin") updateLevels((current) => current.map((level) => ({ ...level, margin: impliedMargin(level.unitPrice, unitCost) })));
    else updateLevels((current) => current.map((level) => ({ ...level, unitPrice: level.margin !== "" && calculatedPrice(level.margin, unitCost) != null ? String(calculatedPrice(level.margin, unitCost)) : level.unitPrice })));
    setMethods((current) => ({ ...current, [targetKey]: nextMethod }));
    clearMessages();
  };

  const save = async () => {
    if (loading || loadError || saving || !canEdit) return false;
    if (!unitId || !unit) { setError("Select a selling unit."); return false; }
    if (!validCost) { setError("Selected unit cost is invalid."); return false; }
    if (method === "margin" && unitCost === 0) { setError("Margin % cannot be calculated from zero cost. Use Fixed Price."); return false; }
    const normalized = levels.map((level) => ({
      ...(level.id ? { id: level.id } : {}),
      minimumQuantity: Number(level.minimumQuantity),
      unitPrice: method === "margin" ? calculatedPrice(level.margin, unitCost) : Number(level.unitPrice),
    }));
    if (levels.some((level) => level.minimumQuantity === "" || (method === "margin" ? level.margin === "" || !Number.isFinite(Number(level.margin)) : level.unitPrice === "")) ||
      normalized.some((level) => !Number.isFinite(level.minimumQuantity) || level.minimumQuantity <= 0 || !Number.isInteger(level.unitPrice) || level.unitPrice < 0) ||
      new Set(normalized.map((level) => level.minimumQuantity)).size !== normalized.length) {
      setError("Enter unique positive minimum quantities and valid prices or margins.");
      return false;
    }
    if (validCost && normalized.some((level) => level.unitPrice < unitCost)) {
      setError(`Wholesale price cannot be below Cost / ${unitName}.`);
      return false;
    }
    setSaving(true); clearMessages();
    try {
      const result = await api.pricing.saveWholesalePricing(product.id, { productUnitId: unitId, variantId: variantId || null, levels: normalized });
      setTiers((current) => [...current.filter((tier) => !sameTarget(tier, unitId, variantId)), ...(result.tiers || [])]);
      setDrafts((current) => { const next = { ...current }; delete next[targetKey]; return next; });
      setMethods((current) => ({ ...current, [targetKey]: "fixed" }));
      setNotice("Wholesale Pricing saved.");
      return true;
    } catch (saveError) {
      setError(saveError.message || "Unable to save Wholesale Pricing.");
      return false;
    } finally { setSaving(false); }
  };

  useImperativeHandle(ref, () => ({ save }));

  if (!sellingUnits.length) return <Alert severity="warning" sx={{ mt: 2.5 }}>No active selling units are available for Wholesale Pricing.</Alert>;
  return <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 2 }}>
    <Typography sx={{ fontSize: 17, fontWeight: 700 }}>Wholesale Pricing</Typography>
    {loadError && <Alert severity="error" sx={{ mt: 1.5 }}>{loadError}</Alert>}
    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    {notice && <Alert severity="success" sx={{ mt: 1.5 }}>{notice}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
      <TextField select fullWidth label="Selling Unit" value={unitId} onChange={(event) => { setUnitId(event.target.value); clearMessages(); }}>
        {sellingUnits.map((item) => <MenuItem key={item.id} value={item.id}>{item.unit?.name || "Unit"}</MenuItem>)}
      </TextField>
      {Boolean(product.variants?.length) && <TextField select fullWidth label="Variant" value={variantId} onChange={(event) => { setVariantId(event.target.value); clearMessages(); }}>
        <MenuItem value="">All Variants</MenuItem>
        {product.variants.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
      </TextField>}
    </Stack>
    {!unit?.isBase && Number.isFinite(factor) && factor > 0 && <Typography sx={{ mt: 1, fontSize: 13, color: "text.secondary" }}>1 {unitName} = {money(factor)} {baseUnitName === "Piece" ? "Pieces" : baseUnitName}</Typography>}
    <Box sx={{ mt: 1.5 }}><Typography sx={{ fontSize: 13, color: "text.secondary" }}>Cost / {unitName}</Typography><Typography sx={{ fontSize: 17, fontWeight: 700 }}>{validCost ? money(Math.round(unitCost)) : "—"}</Typography></Box>
    <Typography sx={{ mt: 2, mb: 0.75, fontSize: 14, fontWeight: 700 }}>Pricing Method</Typography>
    <ToggleButtonGroup exclusive size="small" value={method} onChange={changeMethod} aria-label="Pricing Method">
      <ToggleButton value="margin" disabled={!canEdit}>Margin %</ToggleButton>
      <ToggleButton value="fixed" disabled={!canEdit}>Fixed Price</ToggleButton>
    </ToggleButtonGroup>
    {method === "margin" && (!validCost || unitCost === 0) && <Alert severity="warning" sx={{ mt: 1.5 }}>Margin % cannot be calculated from zero cost. Use Fixed Price.</Alert>}
    <Typography sx={{ mt: 2, fontSize: 14, fontWeight: 700 }}>Quantity Pricing</Typography>
    {loading ? <Typography sx={{ mt: 1, fontSize: 13, color: "text.secondary" }}>Loading Wholesale Pricing…</Typography> : <Stack spacing={1.25} sx={{ mt: 1.25 }}>
      {levels.map((level, index) => <Box key={level.id || `new-${index}`} sx={isMobile ? { p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 } : { display: "grid", gridTemplateColumns: method === "margin" ? "minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) 40px" : "minmax(0,1fr) minmax(0,1.3fr) 40px", gap: 1, alignItems: "center" }}>
        {isMobile && <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 700 }}>Price Level {index + 1}</Typography>}
        <TextField fullWidth size="small" label="Minimum Qty" type="number" value={level.minimumQuantity} onChange={(event) => { updateLevel(index, "minimumQuantity", event.target.value); clearMessages(); }} slotProps={{ htmlInput: { min: 0.001, step: "any" } }} disabled={!canEdit} sx={isMobile ? { mb: 1 } : undefined} />
        {method === "margin" && <TextField fullWidth size="small" label="Margin %" type="number" value={level.margin} onChange={(event) => { updateLevel(index, "margin", event.target.value); clearMessages(); }} disabled={!canEdit || unitCost === 0} sx={isMobile ? { mb: 1 } : undefined} />}
        <TextField fullWidth size="small" label={`Price / ${unitName}`} type="number" value={method === "margin" ? calculatedPrice(level.margin, unitCost) ?? "" : level.unitPrice} onChange={method === "fixed" ? (event) => { updateLevel(index, "unitPrice", event.target.value); clearMessages(); } : undefined} slotProps={{ input: { readOnly: method === "margin" }, htmlInput: { min: 0, step: 1 } }} disabled={!canEdit && method === "fixed"} sx={isMobile ? { mb: 1 } : undefined} />
        {canEdit && <IconButton aria-label={`Remove price level ${index + 1}`} onClick={() => { updateLevels((current) => current.filter((_, levelIndex) => levelIndex !== index)); clearMessages(); }} sx={isMobile ? { ml: "auto", display: "flex" } : undefined}><CloseRoundedIcon fontSize="small" /></IconButton>}
      </Box>)}
    </Stack>}
    {canEdit && <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1.5 }}>
      <Button size="small" onClick={() => { updateLevels((current) => [...current, { minimumQuantity: "", unitPrice: "", margin: "" }]); clearMessages(); }} disabled={loading || loadError || saving}>+ Add Price Level</Button>
      {!hideSaveButton && <Button variant="contained" onClick={() => void save()} disabled={loading || loadError || saving}>Save Wholesale Pricing</Button>}
    </Box>}
  </Paper>;
});

export default WholesalePricingSection;
