import { useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, IconButton, InputAdornment, Paper, TextField, Typography } from "@mui/material";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { usePosApi } from "../../hooks/useApiResource";
import { useProductsQuery } from "../../hooks/usePosQueries";
import BarcodeScannerDialog from "../../components/BarcodeScanner/BarcodeScannerDialog";

const money = (value) => Number(value ?? 0).toLocaleString("en-US");
const categoryName = (product) => product.categoryName || product.category?.name || "";
const barcodeValue = (product) => product.barcodes?.find((barcode) => barcode.isActive !== false && barcode.isPrimary)?.value
  || product.barcodes?.find((barcode) => barcode.isActive !== false)?.value || product.barcode || "";

function ProductContext({ product }) {
  const sku = product.sku || "";
  const barcode = barcodeValue(product);
  const category = categoryName(product);
  return <>
    <Typography noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{product.name}</Typography>
    {(sku || barcode) && <Typography sx={{ fontSize: 12.5, color: "text.secondary", overflowWrap: "anywhere" }}>{[sku && `SKU: ${sku}`, barcode && `Barcode: ${barcode}`].filter(Boolean).join(" · ")}</Typography>}
    {(category || product.price != null) && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{[category, product.price != null && `Current Price: ${money(product.price)}`].filter(Boolean).join(" · ")}</Typography>}
  </>;
}

export default function ProductSearchSelector({ selectedProduct, onSelect, onChange, initialProductId, allowChange = true }) {
  const api = usePosApi();
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const selectionRevision = useRef(0);
  const initialLoadedId = useRef(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 275);
    return () => window.clearTimeout(timer);
  }, [search]);

  const trimmedSearch = search.trim();
  const searchEnabled = Boolean(trimmedSearch && debouncedSearch && !selectedProduct);
  const query = searchEnabled ? { status: "active", search: debouncedSearch, page: 1, pageSize: 25 } : {};
  const { data, error: searchError, isFetching } = useProductsQuery(query, { enabled: searchEnabled });
  const readyQuery = trimmedSearch !== "" && trimmedSearch === debouncedSearch;
  const results = readyQuery ? (data?.products || []).slice(0, 8) : [];

  useEffect(() => {
    if (!initialProductId || selectedProduct?.id === initialProductId || initialLoadedId.current === initialProductId) return undefined;
    initialLoadedId.current = initialProductId;
    let active = true;
    const revision = ++selectionRevision.current;
    queueMicrotask(() => { if (active) { setLoadingDetails(true); setSelectionError(""); } });
    api.products.get(initialProductId).then(({ product }) => {
      if (active && revision === selectionRevision.current) {
        if (!product || product.isActive === false) throw new Error("Product is unavailable.");
        onSelectRef.current(product);
      }
    }).catch((loadError) => {
      if (active && revision === selectionRevision.current) setSelectionError(loadError.message || "Unable to load product details.");
    }).finally(() => { if (active && revision === selectionRevision.current) setLoadingDetails(false); });
    return () => { active = false; };
  }, [api, initialProductId, selectedProduct?.id]);

  const selectById = async (id) => {
    const revision = ++selectionRevision.current;
    setLoadingDetails(true);
    setSelectionError("");
    try {
      const { product } = await api.products.get(id);
      if (revision !== selectionRevision.current) return;
      if (!product || product.isActive === false) throw new Error("Product is unavailable.");
      onSelectRef.current(product);
      setSearch("");
      setDebouncedSearch("");
    } catch (loadError) {
      if (revision === selectionRevision.current) setSelectionError(loadError.message || "Unable to load product details.");
    } finally {
      if (revision === selectionRevision.current) setLoadingDetails(false);
    }
  };

  const handleScan = async (value) => {
    setScannerOpen(false);
    setSelectionError("");
    const revision = ++selectionRevision.current;
    try {
      const result = await api.pricing.barcodeLookup(value);
      if (revision !== selectionRevision.current) return;
      if (!result.known || !result.product?.id || result.product.isActive === false) {
        setSelectionError("No product found for this barcode.");
        return;
      }
      await selectById(result.product.id);
    } catch (lookupError) {
      if (revision === selectionRevision.current) setSelectionError(lookupError.message || "Unable to look up barcode.");
    }
  };

  const changeProduct = () => {
    selectionRevision.current += 1;
    setSearch("");
    setDebouncedSearch("");
    setSelectionError("");
    setLoadingDetails(false);
    onChange();
  };

  if (selectedProduct) return <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Selected Product</Typography>
      {allowChange && <Typography component="button" type="button" onClick={changeProduct} sx={{ border: 0, p: 0.5, bgcolor: "transparent", color: "primary.main", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>Change</Typography>}
    </Box>
    <ProductContext product={selectedProduct} />
  </Paper>;

  return <Box sx={{ mt: 2 }}>
    <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>Select Product</Typography>
    <TextField fullWidth value={search} onChange={(event) => { setSearch(event.target.value); setSelectionError(""); }} placeholder="Search name / SKU / barcode..." slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon color="action" /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton aria-label="Scan barcode" edge="end" onClick={() => setScannerOpen(true)}><QrCodeScannerRoundedIcon /></IconButton></InputAdornment> } }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 56, borderRadius: 1.5, bgcolor: "background.paper" } }} />
    {selectionError && <Alert severity="error" sx={{ mt: 1.25 }}>{selectionError}</Alert>}
    {!search.trim() && !loadingDetails && <Typography sx={{ mt: 1.25, fontSize: 13, color: "text.secondary" }}>Search for a product to continue.</Typography>}
    {(loadingDetails || (search.trim() && (!readyQuery || isFetching))) && <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.25 }}><CircularProgress size={16} /><Typography sx={{ fontSize: 13, color: "text.secondary" }}>{loadingDetails ? "Loading product…" : "Searching products…"}</Typography></Box>}
    {readyQuery && !loadingDetails && !isFetching && searchError && <Alert severity="error" sx={{ mt: 1.25 }}>{searchError.message || "Unable to search products."}</Alert>}
    {readyQuery && !loadingDetails && !isFetching && !searchError && <Paper variant="outlined" sx={{ mt: 1.25, borderRadius: 2, overflow: "hidden" }}>
      <Typography sx={{ px: 1.5, py: 1, fontSize: 12.5, fontWeight: 700, color: "text.secondary" }}>Search Results</Typography>
      {results.length ? results.map((product) => <Box key={product.id} role="button" tabIndex={0} aria-label={`Select ${product.name}`} onClick={() => void selectById(product.id)} onKeyDown={(event) => { if (event.key === "Enter") void selectById(product.id); }} sx={{ px: 1.5, py: 1.1, borderTop: "1px solid", borderColor: "divider", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}><ProductContext product={product} /></Box>) : <Typography sx={{ px: 1.5, pb: 1.5, fontSize: 13, color: "text.secondary" }}>No matching products.</Typography>}
    </Paper>}
    <BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={(value) => void handleScan(value)} />
  </Box>;
}
