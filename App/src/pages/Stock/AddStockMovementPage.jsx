import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  AppBar,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  InputAdornment,
  Paper,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AddCircleOutlineRoundedIcon from "@mui/icons-material/AddCircleOutlineRounded";
import CurrencyExchangeRoundedIcon from "@mui/icons-material/CurrencyExchangeRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { usePosApi } from "../../hooks/useApiResource";
import { useAllActiveProductsQuery, useInventoryQuery } from "../../hooks/usePosQueries";
import BarcodeScannerDialog from "../../components/BarcodeScanner/BarcodeScannerDialog";
import { queryKeys } from "../../lib/queryKeys";
import { useAuth } from "../../context/AuthContext";
import { useManagerApproval } from "../../context/approval-context";
import { stockInReceiptPayload, supplierNameOptions } from "./stockReceiptSource";

const money = (amount) => `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(amount)} ကျပ်`;
const fieldSx = {
  mb: 2,
  "& .MuiOutlinedInput-root": { minHeight: 56, borderRadius: 1.5, bgcolor: "action.hover", "& fieldset": { border: 0 } },
  "& .MuiInputBase-input": { fontSize: 16 },
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
  "& .MuiInputLabel-root": { fontSize: 14, fontWeight: 500 },
};

export default function AddStockMovementPage() {
  const navigate = useNavigate();
  const api = usePosApi();
  const { shop } = useAuth();
  const { runWithApproval } = useManagerApproval();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery("(max-width:768px)");
  const [movementType, setMovementType] = useState("in");
  const [adjustmentType, setAdjustmentType] = useState("increase");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [adjustmentCost, setAdjustmentCost] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const { data: productResult, isLoading: productsLoading, error: productQueryError } = useAllActiveProductsQuery();
  const { data: inventoryResult } = useInventoryQuery();
  const productsError = productQueryError?.message || "";
  const products = useMemo(() => (productResult?.products || []).map((item) => {
    const barcodeValues = (item.barcodes || []).map((barcode) => barcode.value).filter(Boolean);
    return { ...item, stock: Number(item.currentStock ?? 0), cost: item.cost ?? 0, barcode: barcodeValues[0] || "", barcodeValues, icon: <Inventory2RoundedIcon />, color: "#1976d2" };
  }), [productResult]);
  const batches = useMemo(() => inventoryResult?.inventory || [], [inventoryResult]);
  const supplierOptions = useMemo(() => supplierNameOptions(batches, product?.id), [batches, product?.id]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return products;
    return products.filter((item) => [item.name, item.sku, ...item.barcodeValues]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [products, query]);
  const availableCostBuckets = useMemo(() => {
    if (!product) return [];
    const grouped = new Map();
    batches.filter((batch) => batch.productId === product.id).forEach((batch) => {
      const available = Math.max(0, Number(batch.quantity || 0) - Number(batch.reservedQuantity || 0));
      if (!available) return;
      grouped.set(Number(batch.unitCost), (grouped.get(Number(batch.unitCost)) || 0) + available);
    });
    return [...grouped.entries()].map(([unitCost, available]) => ({ unitCost, available })).sort((a, b) => a.unitCost - b.unitCost);
  }, [batches, product]);
  const selectProduct = (nextProduct) => {
    setProduct(nextProduct);
    setQuery(nextProduct?.name ?? "");
    setCost(nextProduct ? String(nextProduct.cost) : "");
    setErrors((current) => ({ ...current, product: false, cost: false }));
  };
  const findProduct = (value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return products.find((item) => [item.id, item.name, item.sku, ...item.barcodeValues]
      .filter(Boolean)
      .some((candidate) => String(candidate).toLowerCase() === normalizedValue)) || null;
  };
  const resolveProductCode = async (value) => {
    const code = String(value || "").trim();
    if (!code) return;
    const localProduct = findProduct(code);
    if (localProduct) {
      selectProduct(localProduct);
      return;
    }
    try {
      const result = await api.pricing.barcodeLookup(code);
      if (!result.known) {
        throw new Error(result.inactive ? "This barcode belongs to an archived product and cannot be used for Stock In." : "No active product was found for this code.");
      }
      const listedProduct = products.find((item) => item.id === result.product?.id);
      if (listedProduct) {
        selectProduct(listedProduct);
        return;
      }
      if (!result.product?.id) throw new Error("No active product was found for this code.");
      const productResult = await api.products.get(result.product.id);
      const apiProduct = productResult.product;
      const barcode = result.barcode?.value || code;
      selectProduct({ ...apiProduct, stock: Number(apiProduct.currentStock ?? 0), cost: apiProduct.cost ?? 0, barcode, barcodeValues: [barcode], icon: <Inventory2RoundedIcon />, color: "#1976d2" });
    } catch (error) {
      setProduct(null);
      setErrors((current) => ({ ...current, product: error.message || "No active product was found for this code." }));
    }
  };
  const scanBarcode = () => setScannerOpen(true);
  const handleScan = async (value) => { setScannerOpen(false); await resolveProductCode(value); };
  const handleSearchKeyDown = (event) => { if (event.key !== "Enter") return; event.preventDefault(); void resolveProductCode(query); };
  const handleProductInputChange = (_, value, reason) => {
    if (reason === "clear") { selectProduct(null); return; }
    if (reason !== "input") return;
    const matchedProduct = findProduct(value);
    if (matchedProduct) { selectProduct(matchedProduct); return; }
    setQuery(value);
    if (product && value !== product.name) setProduct(null);
  };
  const saveMovement = async () => {
    const nextErrors = {
      product: !product,
      quantity: !quantity || Number(quantity) <= 0,
      cost: movementType === "in" && (!cost || Number(cost) <= 0),
      adjustmentCost: movementType === "adjustment" && adjustmentType === "decrease" && !adjustmentCost,
      notes: movementType === "adjustment" && !notes.trim(),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    try { if (movementType === "in") await api.inventory.create(stockInReceiptPayload({ productId: product.id, quantity, cost, notes, supplierName, invoiceReference })); else if (adjustmentType === "decrease") { const body = { productId: product.id, unitCost: Number(adjustmentCost), quantity: Number(quantity), reason: notes.trim() }; await runWithApproval({ permission: "stock.adjust", action: "stock.adjust", actionLabel: "Stock adjustment", targetId: product.id, targetLabel: product.name, payload: { mode: "by-cost", ...body, action: "SUB" }, initialReason: body.reason }, (approvalToken) => api.inventory.adjustByCost(body, approvalToken)); } else { const batch = batches.find((item) => item.productId === product.id); if (!batch) throw new Error("Add stock before recording an adjustment."); const body = { action: "ADD", quantity: Number(quantity), reason: notes.trim() }; await runWithApproval({ permission: "stock.adjust", action: "stock.adjust", actionLabel: "Stock adjustment", targetId: product.id, targetLabel: product.name, payload: { mode: "batch", productId: product.id, inventoryBatchId: batch.id, ...body }, initialReason: body.reason }, (approvalToken) => api.inventory.adjust(batch.id, body, approvalToken)); }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.movements(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory(shop?.id) }),
      ]);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pricing(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "reports"] }),
      ]);
      navigate("/stock");
    } catch (error) { if (!error.approvalCancelled) setErrors((current) => ({ ...current, submit: error.message || "Unable to save stock movement." })); }
  };

  if (!isMobile) return <><DesktopAddStockMovement movementType={movementType} setMovementType={setMovementType} adjustmentType={adjustmentType} setAdjustmentType={setAdjustmentType} query={query} filteredProducts={filteredProducts} activeProductCount={products.length} product={product} selectProduct={selectProduct} findProduct={findProduct} onProductInputChange={handleProductInputChange} onSearchKeyDown={handleSearchKeyDown} productsLoading={productsLoading} productsError={productsError} quantity={quantity} setQuantity={setQuantity} cost={cost} setCost={setCost} supplierName={supplierName} setSupplierName={setSupplierName} supplierOptions={supplierOptions} invoiceReference={invoiceReference} setInvoiceReference={setInvoiceReference} adjustmentCost={adjustmentCost} setAdjustmentCost={setAdjustmentCost} availableCostBuckets={availableCostBuckets} notes={notes} setNotes={setNotes} errors={errors} onClose={() => navigate("/stock")} onSave={saveMovement} /><BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} /></>;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: "128px", fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif" }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}>
        <Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
          <IconButton aria-label="Back to inventory" onClick={() => navigate("/stock")} sx={{ justifySelf: "start", color: "common.white" }}><ArrowBackRoundedIcon /></IconButton>
          <Typography sx={{ fontSize: 20, fontWeight: 600 }}>Add Stock Movement</Typography>
          <Box />
        </Toolbar>
      </AppBar>

      <Box sx={{ width: "100%", maxWidth: 520, mx: "auto", px: 2.5, pt: 3 }}>
        <Typography sx={sectionLabelSx}>SELECT PRODUCT</Typography>
        <Autocomplete
            freeSolo
            autoHighlight
            autoSelect
            openOnFocus
            options={filteredProducts}
            value={product}
            filterOptions={(options) => options}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => typeof option === "string" ? option : option.name}
            inputValue={query}
            onInputChange={handleProductInputChange}
            onChange={(_, value) => selectProduct(typeof value === "string" ? findProduct(value) : value)}
            renderInput={(params) => <TextField {...params} placeholder={productsLoading ? "Loading products…" : "Search product or enter barcode"} disabled={productsLoading} error={Boolean(errors.product || productsError)} helperText={productsError || (!productsLoading && products.length === 0 ? "No active products. Create a product first." : typeof errors.product === "string" ? errors.product : errors.product ? "Select a product" : "")} onKeyDown={handleSearchKeyDown} slotProps={{ input: { ...params.slotProps.input, startAdornment: <><InputAdornment position="start"><SearchRoundedIcon color="action" /></InputAdornment>{params.slotProps.input.startAdornment}</>, endAdornment: product ? <InputAdornment position="end"><IconButton aria-label="Clear selected product" onClick={() => selectProduct(null)}><CloseRoundedIcon /></IconButton></InputAdornment> : params.slotProps.input.endAdornment }, htmlInput: params.slotProps.htmlInput }} sx={{ ...fieldSx, mb: 0 }} />}
          />

        {product && <SelectedProduct product={product} onClear={() => selectProduct(null)} />}

        <Typography sx={{ ...sectionLabelSx, mt: 3.5 }}>MOVEMENT DETAILS</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2.5 }}>
          <MovementButton active={movementType === "in"} onClick={() => setMovementType("in")} icon={<AddCircleOutlineRoundedIcon />} label="Stock IN" tone="success" />
          <MovementButton active={movementType === "adjustment"} onClick={() => setMovementType("adjustment")} label="Stock Adjustment" tone="primary" />
        </Box>

        {movementType === "in" ? (
          <StockInForm quantity={quantity} setQuantity={setQuantity} cost={cost} setCost={setCost} supplierName={supplierName} setSupplierName={setSupplierName} supplierOptions={supplierOptions} invoiceReference={invoiceReference} setInvoiceReference={setInvoiceReference} notes={notes} setNotes={setNotes} errors={errors} />
        ) : (
          <AdjustmentForm adjustmentType={adjustmentType} setAdjustmentType={setAdjustmentType} quantity={quantity} setQuantity={setQuantity} adjustmentCost={adjustmentCost} setAdjustmentCost={setAdjustmentCost} availableCostBuckets={availableCostBuckets} notes={notes} setNotes={setNotes} errors={errors} />
        )}
      </Box>

      {errors.submit && <Typography color="error" sx={{ px: 2.5 }}>{errors.submit}</Typography>}<Fab aria-label="Scan product barcode" onClick={scanBarcode} sx={{ position: "fixed", zIndex: 21, right: 20, bottom: 104, width: 56, height: 56, bgcolor: "primary.main", color: "common.white", boxShadow: 4, "&:hover": { bgcolor: "primary.dark" } }}><QrCodeScannerRoundedIcon /></Fab>
      <Paper elevation={5} sx={{ position: "fixed", zIndex: 20, left: 0, right: 0, bottom: 0, px: 2.5, py: 2, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
        <Box sx={{ width: "100%", maxWidth: 472, mx: "auto" }}><Button fullWidth variant="contained" onClick={saveMovement} sx={{ minHeight: 56, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none" }}>{movementType === "in" ? "Save Stock In" : "Save Adjustment"}</Button></Box>
      </Paper><BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} />
    </Box>
  );
}

function DesktopAddStockMovement({ movementType, setMovementType, adjustmentType, setAdjustmentType, query, filteredProducts, activeProductCount, product, selectProduct, findProduct, onProductInputChange, onSearchKeyDown, productsLoading, productsError, quantity, setQuantity, cost, setCost, supplierName, setSupplierName, supplierOptions, invoiceReference, setInvoiceReference, adjustmentCost, setAdjustmentCost, availableCostBuckets, notes, setNotes, errors, onClose, onSave }) {
  return <Dialog open fullWidth maxWidth="md" onClose={onClose} slotProps={{ paper: { sx: { maxWidth: 920, borderRadius: 3, maxHeight: "88vh" } } }}>
    <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid", borderColor: "divider" }}><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography sx={{ fontSize: 22, fontWeight: 800 }}>Add Stock Movement</Typography><IconButton aria-label="Close stock movement" onClick={onClose}><CloseRoundedIcon /></IconButton></Box></DialogTitle>
    <DialogContent dividers sx={{ p: 3 }}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 3 }}>
      <Box><Typography sx={sectionLabelSx}>SELECT PRODUCT</Typography><Autocomplete freeSolo autoHighlight autoSelect openOnFocus options={filteredProducts} value={product} filterOptions={(options) => options} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(option) => typeof option === "string" ? option : option.name} inputValue={query} onInputChange={onProductInputChange} onChange={(_, value) => selectProduct(typeof value === "string" ? findProduct(value) : value)} renderInput={(params) => <TextField {...params} placeholder={productsLoading ? "Loading products…" : "Search product or enter barcode"} disabled={productsLoading} error={Boolean(errors.product || productsError)} helperText={productsError || (!productsLoading && activeProductCount === 0 ? "No active products. Create a product first." : typeof errors.product === "string" ? errors.product : errors.product ? "Select a product" : "")} onKeyDown={onSearchKeyDown} slotProps={{ input: { ...params.slotProps.input, startAdornment: <><InputAdornment position="start"><SearchRoundedIcon color="action" /></InputAdornment>{params.slotProps.input.startAdornment}</>, endAdornment: product ? <InputAdornment position="end"><IconButton aria-label="Clear selected product" onClick={() => selectProduct(null)}><CloseRoundedIcon /></IconButton></InputAdornment> : params.slotProps.input.endAdornment }, htmlInput: params.slotProps.htmlInput }} sx={{ ...fieldSx, mb: 0 }} />} />
        {product && <SelectedProduct product={product} onClear={() => selectProduct(null)} />}
        <Typography sx={{ ...sectionLabelSx, mt: 3 }}>MOVEMENT DETAILS</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 2 }}><MovementButton active={movementType === "in"} onClick={() => setMovementType("in")} icon={<AddCircleOutlineRoundedIcon />} label="Stock IN" tone="success" /><MovementButton active={movementType === "adjustment"} onClick={() => setMovementType("adjustment")} icon={<Inventory2RoundedIcon />} label="Adjustment" tone="primary" /></Box>
      </Box>
      <Box>{movementType === "in" ? <StockInForm quantity={quantity} setQuantity={setQuantity} cost={cost} setCost={setCost} supplierName={supplierName} setSupplierName={setSupplierName} supplierOptions={supplierOptions} invoiceReference={invoiceReference} setInvoiceReference={setInvoiceReference} notes={notes} setNotes={setNotes} errors={errors} /> : <AdjustmentForm adjustmentType={adjustmentType} setAdjustmentType={setAdjustmentType} quantity={quantity} setQuantity={setQuantity} adjustmentCost={adjustmentCost} setAdjustmentCost={setAdjustmentCost} availableCostBuckets={availableCostBuckets} notes={notes} setNotes={setNotes} errors={errors} />}</Box>
    </Box></DialogContent>
    <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider" }}><Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button><Button variant="contained" onClick={onSave} sx={{ minHeight: 42, textTransform: "none", fontWeight: 700 }}>{movementType === "in" ? "Save Stock In" : "Save Adjustment"}</Button></DialogActions>
  </Dialog>;
}

function SelectedProduct({ product, onClear }) {
  return <Box sx={{ mt: 2, p: 1.5, display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) auto", alignItems: "center", gap: 1.5, border: "1px solid", borderColor: "primary.light", borderRadius: 1.5, bgcolor: "#edf7ff" }}><Box sx={{ width: 64, height: 70, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "#dceffd", color: product.color, "& .MuiSvgIcon-root": { fontSize: 36 } }}>{product.icon}</Box><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 17, fontWeight: 600 }}>{product.name}</Typography><Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 14 }}>SKU: {product.sku}</Typography><Typography sx={{ mt: 0.75, fontWeight: 600, fontSize: 14 }}>Current Stock: {product.stock} pcs</Typography><Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 14 }}>Current Cost Price: {money(product.cost)}</Typography></Box><IconButton aria-label="Remove selected product" onClick={onClear} size="small"><CloseRoundedIcon /></IconButton></Box>;
}

function MovementButton({ active, onClick, icon, label, tone, compact = false }) {
  const activeColor = tone === "success" ? "success.main" : "primary.main";
  return <Button onClick={onClick} startIcon={icon} sx={{ minHeight: compact ? 54 : 58, px: 1, borderRadius: 1.5, border: "1px solid", borderColor: active ? activeColor : "divider", color: active ? "common.white" : "text.secondary", bgcolor: active ? activeColor : "background.paper", fontSize: 16, fontWeight: 600, textTransform: "none", whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: 0.75, "& .MuiSvgIcon-root": { fontSize: 20 } }, "&:hover": { bgcolor: active ? activeColor : "action.hover", borderColor: active ? activeColor : "divider" } }}>{label}</Button>;
}

function StockInForm({ quantity, setQuantity, cost, setCost, supplierName, setSupplierName, supplierOptions, invoiceReference, setInvoiceReference, notes, setNotes, errors }) {
  return <><InputField label="Quantity *" value={quantity} onChange={(event) => setQuantity(event.target.value)} icon={<Inventory2RoundedIcon />} inputMode="numeric" type="number" error={errors.quantity} helperText="Enter a valid quantity" /><InputField label="Cost Price *" value={cost} onChange={(event) => setCost(event.target.value)} icon={<CurrencyExchangeRoundedIcon />} inputMode="decimal" type="number" error={errors.cost} helperText="Enter a cost price greater than 0" endAdornment="ကျပ်" /><Autocomplete freeSolo autoHighlight options={supplierOptions} value={supplierName} onInputChange={(_, value) => setSupplierName(value)} renderInput={(params) => <TextField {...params} label="Supplier (Optional)" sx={fieldSx} />} /><InputField label="Invoice / Reference No. (Optional)" value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} /><InputField label="Notes (Optional)" value={notes} onChange={(event) => setNotes(event.target.value)} icon={<NotesRoundedIcon />} multiline minRows={4} /></>;
}

function AdjustmentForm({ adjustmentType, setAdjustmentType, quantity, setQuantity, adjustmentCost, setAdjustmentCost, availableCostBuckets, notes, setNotes, errors }) {
  return <><Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1 }}>Adjustment Type *</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}><MovementButton compact active={adjustmentType === "increase"} onClick={() => setAdjustmentType("increase")} icon={<AddCircleOutlineRoundedIcon />} label="Increase" tone="success" /><Button onClick={() => setAdjustmentType("decrease")} startIcon={<RemoveCircleOutlineRoundedIcon />} sx={{ minHeight: 54, borderRadius: 1.5, border: "1px solid", borderColor: adjustmentType === "decrease" ? "error.main" : "divider", color: adjustmentType === "decrease" ? "common.white" : "text.secondary", bgcolor: adjustmentType === "decrease" ? "error.main" : "background.paper", fontSize: 16, fontWeight: 600, textTransform: "none", "& .MuiButton-startIcon": { mr: 0.75, "& .MuiSvgIcon-root": { fontSize: 20 } }, "&:hover": { bgcolor: adjustmentType === "decrease" ? "error.main" : "action.hover" } }}>Decrease</Button></Box>{adjustmentType === "decrease" && <TextField select fullWidth label="Cost Price *" value={adjustmentCost} onChange={(event) => setAdjustmentCost(event.target.value)} error={Boolean(errors.adjustmentCost)} helperText={errors.adjustmentCost ? "Select a cost price with available stock" : ""} sx={{ ...fieldSx }}><MenuItem value="" disabled>Select cost price</MenuItem>{availableCostBuckets.map((bucket) => <MenuItem key={bucket.unitCost} value={bucket.unitCost}>Cost {new Intl.NumberFormat("en-US").format(bucket.unitCost)} — Available {bucket.available} pcs</MenuItem>)}</TextField>}<InputField label="Quantity *" value={quantity} onChange={(event) => setQuantity(event.target.value)} icon={<Inventory2RoundedIcon />} inputMode="numeric" type="number" error={errors.quantity} helperText="Enter a valid quantity" /><InputField label="Notes *" placeholder="Reason for stock adjustment" value={notes} onChange={(event) => setNotes(event.target.value)} icon={<NotesRoundedIcon />} multiline minRows={4} error={errors.notes} helperText="Notes are required" /></>;
}

function InputField({ label, icon, endAdornment, error, helperText, multiline, minRows, ...props }) {
  return <TextField fullWidth label={label} error={Boolean(error)} helperText={error ? helperText : ""} multiline={multiline} minRows={minRows} slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ color: "text.secondary", alignSelf: multiline ? "flex-start" : "center", mt: multiline ? 0.5 : 0 }}>{icon}</InputAdornment>, endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : undefined } }} sx={{ ...fieldSx, ...(multiline ? { "& .MuiOutlinedInput-root": { ...fieldSx["& .MuiOutlinedInput-root"], minHeight: 116, alignItems: "flex-start", py: 1 } } : {}) }} {...props} />;
}

const sectionLabelSx = { color: "text.secondary", fontWeight: 600, fontSize: 14, letterSpacing: 0.3, mb: 1.25 };
