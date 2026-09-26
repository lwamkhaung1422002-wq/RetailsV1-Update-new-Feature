import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { usePosApi } from "../../hooks/useApiResource";

const sameTarget = (tier, unitId, variantId) => tier.productUnitId === unitId && (tier.variantId || "") === variantId;

export default function WholesalePricingSection({ product }) {
  const api = usePosApi();
  const sellingUnits = useMemo(() => (product.units || []).filter((item) => item.canSell !== false && item.unit?.isActive !== false), [product.units]);
  const [unitId, setUnitId] = useState(() => sellingUnits.find((item) => item.isBase)?.id || sellingUnits[0]?.id || "");
  const [variantId, setVariantId] = useState("");
  const [tiers, setTiers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    api.pricing.wholesalePricing(product.id)
      .then((result) => { if (alive) setTiers(result.tiers || []); })
      .catch((loadError) => { if (alive) setError(loadError.message || "Unable to load Wholesale Pricing."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, product.id]);

  const targetKey = `${unitId}|${variantId}`;
  const levels = drafts[targetKey] ?? tiers.filter((tier) => sameTarget(tier, unitId, variantId)).map((tier) => ({
    id: tier.id,
    minimumQuantity: String(tier.minimumQuantity),
    unitPrice: String(tier.unitPrice),
  }));
  const unit = sellingUnits.find((item) => item.id === unitId);
  const unitName = unit?.unit?.name || "Unit";
  const updateLevels = (update) => setDrafts((current) => ({ ...current, [targetKey]: update(current[targetKey] ?? levels) }));
  const updateLevel = (index, field, value) => updateLevels((current) => current.map((level, levelIndex) => levelIndex === index ? { ...level, [field]: value } : level));
  const save = async () => {
    if (!unitId) return setError("Select a selling unit.");
    const normalized = levels.map((level) => ({
      ...(level.id ? { id: level.id } : {}),
      minimumQuantity: Number(level.minimumQuantity),
      unitPrice: Number(level.unitPrice),
    }));
    if (normalized.some((level) => !Number.isFinite(level.minimumQuantity) || level.minimumQuantity <= 0 || !Number.isInteger(level.unitPrice) || level.unitPrice < 0) ||
      new Set(normalized.map((level) => level.minimumQuantity)).size !== normalized.length) {
      return setError("Enter unique positive minimum quantities and valid prices.");
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await api.pricing.saveWholesalePricing(product.id, { productUnitId: unitId, variantId: variantId || null, levels: normalized });
      setTiers((current) => [...current.filter((tier) => !sameTarget(tier, unitId, variantId)), ...(result.tiers || [])]);
      setDrafts((current) => { const next = { ...current }; delete next[targetKey]; return next; });
      setNotice("Wholesale Pricing saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save Wholesale Pricing.");
    } finally { setSaving(false); }
  };

  if (!sellingUnits.length) return null;
  return <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 2 }}>
    <Typography sx={{ fontSize: 17, fontWeight: 700 }}>Wholesale Pricing</Typography>
    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    {notice && <Alert severity="success" sx={{ mt: 1.5 }}>{notice}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
      <TextField select fullWidth label="Unit" value={unitId} onChange={(event) => { setUnitId(event.target.value); setError(""); setNotice(""); }}>
        {sellingUnits.map((item) => <MenuItem key={item.id} value={item.id}>{item.unit?.name || "Unit"}</MenuItem>)}
      </TextField>
      {Boolean(product.variants?.length) && <TextField select fullWidth label="Variant" value={variantId} onChange={(event) => { setVariantId(event.target.value); setError(""); setNotice(""); }}>
        <MenuItem value="">All Variants</MenuItem>
        {product.variants.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
      </TextField>}
    </Stack>
    <Stack spacing={1.25} sx={{ mt: 2 }}>
      {levels.map((level, index) => <Stack key={level.id || `new-${index}`} direction="row" spacing={1} alignItems="center">
        <TextField fullWidth size="small" label="Minimum Qty" type="number" value={level.minimumQuantity} onChange={(event) => updateLevel(index, "minimumQuantity", event.target.value)} slotProps={{ htmlInput: { min: 0.001, step: "any" } }} />
        <TextField fullWidth size="small" label={`Price / ${unitName}`} type="number" value={level.unitPrice} onChange={(event) => updateLevel(index, "unitPrice", event.target.value)} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
        <IconButton aria-label={`Remove price level ${index + 1}`} onClick={() => updateLevels((current) => current.filter((_, levelIndex) => levelIndex !== index))}><CloseRoundedIcon fontSize="small" /></IconButton>
      </Stack>)}
    </Stack>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1.5 }}>
      <Button size="small" onClick={() => updateLevels((current) => [...current, { minimumQuantity: "", unitPrice: "" }])} disabled={loading || saving}>+ Add Price Level</Button>
      <Button variant="contained" onClick={() => void save()} disabled={loading || saving}>Save Wholesale Pricing</Button>
    </Box>
  </Paper>;
}
