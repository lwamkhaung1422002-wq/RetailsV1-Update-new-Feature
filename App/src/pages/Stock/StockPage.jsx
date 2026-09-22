import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Menu,
  MenuItem,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Alert } from "@mui/material";
import { usePosApi } from "../../hooks/useApiResource";
import { useAllActiveProductsQuery, useCategoriesQuery, useInventoryQuery } from "../../hooks/usePosQueries";
import { queryKeys } from "../../lib/queryKeys";
import { useAuth } from "../../context/AuthContext";
import BarcodeManagerDialog from "../../components/Barcode/BarcodeManagerDialog";
import BarcodeScannerDialog from "../../components/BarcodeScanner/BarcodeScannerDialog";

const formatMoney = (amount) => `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;

export default function StockPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const { data: productResult, error: productsError } = useAllActiveProductsQuery();
  const { data: categoryResult, error: categoriesError } = useCategoriesQuery();
  const { data: inventoryResult, error: inventoryError, refetch: refetchInventory } = useInventoryQuery();
  const [apiError, setApiError] = useState(null);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sort, setSort] = useState("recent");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuProduct, setMenuProduct] = useState(null);
  const [barcodeGeneratorOpen, setBarcodeGeneratorOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState(null);
  const inventoryProducts = useMemo(() => {
    const categoryNames = new Map((categoryResult?.categories || []).map((category) => [category.id, category.name]));
    const totals = new Map();
    (inventoryResult?.inventory || []).forEach((batch) => totals.set(batch.productId, (totals.get(batch.productId) || 0) + Number(batch.quantity || 0)));
    return (productResult?.products || []).map((product) => ({
      id: product.id, name: product.name, sku: product.sku || "", barcodeValues: (product.barcodes || []).map((barcode) => barcode.value).filter(Boolean),
      category: product.category?.name || categoryNames.get(product.categoryId) || "Uncategorized", price: Number(product.price || 0), cost: Number(product.cost || 0),
      stock: Number(product.currentStock ?? totals.get(product.id) ?? 0), minimumStock: Number(product.minimumStock ?? 10), hasSaleHistory: Boolean(product.hasSaleHistory),
    }));
  }, [categoryResult, inventoryResult, productResult]);

  useEffect(() => {
    const updateSort = (event) => setSort(event.detail);
    window.addEventListener("inventory-sort", updateSort);
    return () => window.removeEventListener("inventory-sort", updateSort);
  }, []);

  useEffect(() => {
    const refreshInventory = () => { void refetchInventory(); };
    window.addEventListener("inventory-updated", refreshInventory);
    return () => window.removeEventListener("inventory-updated", refreshInventory);
  }, [refetchInventory]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = inventoryProducts.filter((product) => (
      !query || [product.name, product.sku, ...(product.barcodeValues || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ) && (!lowStockOnly || product.stock < product.minimumStock));
    if (sort === "name") return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price") return [...result].sort((a, b) => b.price - a.price);
    if (sort === "stock") return [...result].sort((a, b) => a.stock - b.stock);
    return result;
  }, [inventoryProducts, lowStockOnly, search, sort]);

  const inventorySummary = useMemo(() => ({
    productCount: visibleProducts.length,
    quantity: visibleProducts.reduce((total, product) => total + product.stock, 0),
    value: visibleProducts.reduce((total, product) => total + (product.cost * product.stock), 0),
  }), [visibleProducts]);

  const deleteProduct = async (id) => {
    await api.products.remove(id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) });
  };
  const removeProduct = () => {
    deleteProduct(menuProduct?.id).catch((error) => setApiError(error));
    setMenuAnchor(null);
    setMenuProduct(null);
  };
  const handleBarcodeDetected = async (value) => {
    setScannerOpen(false);
    setScanNotice(null);
    try {
      const result = await api.pricing.barcodeLookup(value);
      if (!result.known || !result.product?.id) {
        setScanNotice({ severity: "warning", text: `No active product was found for ${value}.` });
        return;
      }
      navigate(`/stock/${result.product.id}`);
    } catch (error) {
      setScanNotice({ severity: "error", text: error.message || "Barcode lookup failed. Enter the code manually and try again." });
    }
  };

  const requestError = apiError || productsError || categoriesError || inventoryError;
  if (!isMobile) return <><DesktopInventoryPage products={visibleProducts} search={search} setSearch={setSearch} summary={inventorySummary} lowStockOnly={lowStockOnly} setLowStockOnly={setLowStockOnly} navigate={navigate} onDelete={(id) => deleteProduct(id).catch((error) => setApiError(error))} onGenerateBarcodes={() => setBarcodeGeneratorOpen(true)} /><BarcodeManagerDialog open={barcodeGeneratorOpen} onClose={() => setBarcodeGeneratorOpen(false)} api={api} standalone />{requestError && <Alert severity="warning" sx={{ mt: 1.5 }}>{requestError.message || "Inventory request failed."}</Alert>}</>;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", px: 3, pt: 2, pb: "174px" }}>
      <Box sx={{ position: "relative" }}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products by name, SKU, or barcode"
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> }}
          sx={{
            "& .MuiOutlinedInput-root": {
              minHeight: 60,
              px: 1,
              pr: 6.5,
              bgcolor: "#f5f5f5",
              borderRadius: 2,
              fontSize: 15,
              "& fieldset": { border: 0 },
            },
            "& .MuiInputAdornment-root": { color: "text.primary", mr: 1 },
          }}
        />
        <IconButton aria-label="Scan barcode" onClick={() => setScannerOpen(true)} sx={{ position: "absolute", top: "50%", right: 7, transform: "translateY(-50%)", color: "text.primary" }}><QrCodeScannerRoundedIcon /></IconButton>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 0.75, mt: 2, mb: 1.5 }}>
        <Button variant="outlined" onClick={() => setLowStockOnly(false)} sx={filterButtonSx}>All Categories</Button>
        <Button variant="outlined" onClick={() => setLowStockOnly((value) => !value)} sx={{ ...filterButtonSx, ...(lowStockOnly ? { borderColor: "primary.main", color: "primary.main" } : {}) }}>Low Stock</Button>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 0.25, mb: 1.75 }}>
        <Typography color="text.secondary" sx={{ minWidth: 0, fontSize: 13, whiteSpace: "nowrap" }}>
          {inventorySummary.productCount} Products · {inventorySummary.quantity} pcs
        </Typography>
        <Typography color="primary.main" sx={{ flexShrink: 0, fontSize: 16, fontWeight: 700, whiteSpace: "nowrap" }}>
          {formatMoney(inventorySummary.value)}
        </Typography>
      </Box>

      <Stack spacing={1.25}>
        {scanNotice && <Alert severity={scanNotice.severity} onClose={() => setScanNotice(null)}>{scanNotice.text}</Alert>}
        {requestError && <Alert severity="warning">{requestError.message || "Inventory request failed."}</Alert>}
        {visibleProducts.map((product) => (
          <Card key={product.id} onClick={() => navigate(`/stock/${product.id}`)} sx={{ borderRadius: 2.5, bgcolor: "background.paper", boxShadow: "0 2px 7px rgba(15,23,42,0.16)", cursor: "pointer" }}>
            <CardContent sx={{ boxSizing: "border-box", p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography color="text.primary" fontSize={18} fontWeight={600}>{product.name}<Box component="span" sx={{ ml: 0.75, color: "text.secondary", fontSize: 14, fontWeight: 400 }}>· {product.category}</Box></Typography>
                  <Stack direction="row" alignItems="center" spacing={0.7} sx={{ mt: 0.65, color: product.stock < product.minimumStock ? "error.main" : "success.main" }}><Inventory2RoundedIcon fontSize="small" /><Typography variant="body2">{product.stock} pcs</Typography></Stack>
                </Box>
                <Box sx={{ alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Typography color="primary.main" fontWeight={700} fontSize={17}>{formatMoney(product.cost)}</Typography>
                  <IconButton size="small" aria-label={`More actions for ${product.name}`} onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setMenuProduct(product); }}><MoreVertRoundedIcon /></IconButton>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem disabled={menuProduct?.hasSaleHistory} onClick={() => { navigate(`/stock/add?edit=${menuProduct?.id ?? ""}`); setMenuAnchor(null); }}><EditRoundedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>
        <MenuItem disabled={menuProduct?.hasSaleHistory} onClick={removeProduct} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ mr: 1.5 }} />Delete</MenuItem>
      </Menu>

      <Paper elevation={5} sx={{ position: "fixed", left: 0, right: 0, bottom: 72, px: 3, py: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper", zIndex: 10 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate("/stock/add")} sx={{ minHeight: 56, borderRadius: 2, bgcolor: "primary.main", fontSize: 15, textTransform: "none", "&:hover": { bgcolor: "primary.dark" } }}>Add Product</Button>
          <Button variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={() => navigate("/stock/movement/add")} sx={{ minHeight: 56, borderRadius: 2, borderColor: "text.primary", color: "primary.main", fontSize: 12, textTransform: "none" }}>Add Stock</Button>
          <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => navigate("/stock/history")} sx={{ minHeight: 56, borderRadius: 2, borderColor: "text.primary", color: "primary.main", fontSize: 12, textTransform: "none" }}>History</Button>
        </Box>
      </Paper><BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleBarcodeDetected} />
    </Box>
  );
}

function DesktopInventoryPage({ products, search, setSearch, summary, lowStockOnly, setLowStockOnly, navigate, onDelete, onGenerateBarcodes }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuProduct, setMenuProduct] = useState(null);
  return <Box sx={{ width: "100%", maxWidth: "none", mx: 0, py: 0.5 }}>
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) auto auto auto", gap: 1.5, alignItems: "center" }}>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product code, name or barcode..." InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 52, borderRadius: 2, bgcolor: "background.paper" } }} />
      <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate("/stock/add")} sx={desktopPrimaryButtonSx}>Create Product</Button>
      <Button variant="outlined" onClick={onGenerateBarcodes} sx={desktopSecondaryButtonSx}>Generate Barcodes</Button>
      <Button variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={() => navigate("/stock/movement/add")} sx={desktopSecondaryButtonSx}>Add Stock</Button>
    </Box>
    <Stack direction="row" spacing={1.5} sx={{ mt: 2.25, mb: 2.5 }}>
      <Button variant="outlined" startIcon={<CategoryRoundedIcon />} onClick={() => setLowStockOnly(false)} sx={{ ...desktopFilterButtonSx, ...(!lowStockOnly ? desktopActiveFilterSx : {}) }}>All Category</Button>
      <Button variant="outlined" startIcon={<WarningAmberRoundedIcon />} onClick={() => setLowStockOnly(true)} sx={{ ...desktopFilterButtonSx, ...(lowStockOnly ? desktopActiveFilterSx : {}) }}>Low Stock</Button>
      <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => navigate("/stock/history")} sx={desktopFilterButtonSx}>History</Button>
    </Stack>
    <Paper elevation={0} sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: "1px solid", borderColor: "divider", borderRadius: 2.5, overflow: "hidden", mb: 2.5, boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}>
      <InventorySummary icon={<Inventory2RoundedIcon />} iconBg="#eaf3ff" iconColor="#1769e0" value={summary.productCount} label="Products" />
      <InventorySummary icon={<ArchiveRoundedIcon />} iconBg="#eaf8ef" iconColor="#27914a" value={`${summary.quantity} pcs`} label="Total Stock" bordered />
      <InventorySummary icon={<AccountBalanceWalletRoundedIcon />} iconBg="#fff3e1" iconColor="#dc8a19" value={formatMoney(summary.value)} label="Total Value" bordered />
    </Paper>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 2 }}>
      {products.map((product) => <Card key={product.id} onClick={() => navigate(`/stock/${product.id}`)} sx={{ minWidth: 0, borderRadius: 2.25, border: "1px solid", borderColor: "divider", boxShadow: "0 2px 8px rgba(15,23,42,.05)", cursor: "pointer", overflow: "hidden", "&:hover": { boxShadow: "0 7px 18px rgba(15,23,42,.12)", transform: "translateY(-1px)" } }}>
        <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 17, fontWeight: 700 }}>{product.name}<Box component="span" sx={{ ml: 0.75, color: "text.secondary", fontSize: 13, fontWeight: 400 }}>· {product.category}</Box></Typography><IconButton aria-label={`Actions for ${product.name}`} onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setMenuProduct(product); }} size="small"><MoreVertRoundedIcon /></IconButton></Box>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}><Box><Typography color="text.secondary" sx={{ fontSize: 12 }}>Stock</Typography><Typography color={product.stock < product.minimumStock ? "error.main" : "success.main"} sx={{ fontSize: 15, fontWeight: 800, mt: .5 }}>{product.stock} pcs</Typography></Box><Box sx={{ textAlign: "right" }}><Typography color="text.secondary" sx={{ fontSize: 12 }}>Cost Price</Typography><Typography sx={{ fontSize: 15, fontWeight: 800, mt: .5, whiteSpace: "nowrap" }}>{formatMoney(product.cost)}</Typography></Box></Box>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Typography color="text.secondary" sx={{ fontSize: 12 }}>Total Value</Typography><Typography sx={{ fontSize: 14, fontWeight: 800 }}>{formatMoney(product.cost * product.stock)}</Typography></Box>
        </CardContent>
      </Card>)}
    </Box>
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}><MenuItem disabled={menuProduct?.hasSaleHistory} onClick={() => { navigate(`/stock/add?edit=${menuProduct?.id ?? ""}`); setMenuAnchor(null); }}><EditRoundedIcon sx={{ mr: 1.25 }} />Edit</MenuItem><MenuItem disabled={menuProduct?.hasSaleHistory} onClick={() => { onDelete(menuProduct?.id); setMenuAnchor(null); }} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ mr: 1.25 }} />Delete</MenuItem></Menu>
  </Box>;
}

function InventorySummary({ icon, iconBg, iconColor, value, label, bordered }) { return <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 1.75, px: 3, py: 2.25, borderLeft: bordered ? "1px solid" : 0, borderColor: "divider" }}><Box sx={{ width: 52, height: 52, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: iconBg, color: iconColor }}>{icon}</Box><Box><Typography noWrap sx={{ fontSize: 24, lineHeight: 1.1, fontWeight: 800 }}>{value}</Typography><Typography color="text.secondary" sx={{ mt: .5, fontSize: 14 }}>{label}</Typography></Box></Box>; }

const desktopPrimaryButtonSx = { minHeight: 52, px: 2.25, borderRadius: 1.75, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" };
const desktopSecondaryButtonSx = { minHeight: 52, px: 2.25, borderRadius: 1.75, borderColor: "divider", color: "text.primary", textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" };
const desktopFilterButtonSx = { minHeight: 48, minWidth: 174, borderRadius: 1.75, borderColor: "divider", color: "text.secondary", textTransform: "none", fontWeight: 600, "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } };
const desktopActiveFilterSx = { borderColor: "primary.main", color: "primary.main", bgcolor: "#f7fbff" };

const filterButtonSx = { minHeight: 48, borderRadius: 1.75, borderColor: "text.primary", color: "text.primary", bgcolor: "background.paper", fontSize: 15, fontWeight: 600, px: 2, textTransform: "none" };
