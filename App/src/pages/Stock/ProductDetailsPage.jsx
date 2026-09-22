import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AppBar,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { DesktopPage, DesktopPanel, DesktopStat } from "../../components/Desktop/DesktopUI";
import { usePosApi } from "../../hooks/useApiResource";

const formatMoney = (amount) => `${new Intl.NumberFormat("en-US").format(Number(amount || 0))} ကျပ်`;
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "Not set");
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");

export default function ProductDetailsPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { productId } = useParams();
  const api = usePosApi();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [costHistoryOpen, setCostHistoryOpen] = useState(false);
  const [costHistory, setCostHistory] = useState([]);
  const [costHistoryError, setCostHistoryError] = useState("");
  const [costHistoryLoading, setCostHistoryLoading] = useState(false);
  const [sourceHistoryOpen, setSourceHistoryOpen] = useState(false);
  const [sourceHistory, setSourceHistory] = useState([]);
  const [sourceHistoryLoading, setSourceHistoryLoading] = useState(false);
  const [sourceHistoryError, setSourceHistoryError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const openCostHistory = async () => {
    setCostHistoryOpen(true);
    setCostHistoryLoading(true);
    setCostHistoryError("");
    try {
      const result = await api.products.costHistory(productId);
      setCostHistory(result.history || []);
    } catch (requestError) {
      setCostHistoryError(requestError.message || "Unable to load cost price history.");
    } finally {
      setCostHistoryLoading(false);
    }
  };
  const openSourceHistory = async () => {
    setSourceHistoryOpen(true); setSourceHistoryLoading(true); setSourceHistoryError("");
    try { const result = await api.products.sourceHistory(productId); setSourceHistory(result.sources || []); }
    catch (requestError) { setSourceHistoryError(requestError.message || "Unable to load stock source history."); }
    finally { setSourceHistoryLoading(false); }
  };

  const removeProduct = async () => {
    if (!window.confirm("Remove this product? This cannot be undone from the active product list.")) return;
    setDeleting(true);
    try {
      await api.products.remove(productId);
      navigate("/stock");
    } catch (requestError) {
      window.alert(requestError.message || "Unable to remove this product.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const refreshProduct = () => setReloadVersion((value) => value + 1);
    window.addEventListener("inventory-updated", refreshProduct);
    return () => window.removeEventListener("inventory-updated", refreshProduct);
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      api.products.get(productId),
      api.inventory.movements({ productId, limit: 5 }),
    ])
      .then(([productResult, movementResult]) => {
        if (!active) return;

        const apiProduct = productResult.product;
        const stock = Number(apiProduct.currentStock ?? 0);
        const latestMovement = (movementResult.movements || [])[0];
        const isOut = latestMovement?.direction === "OUT";
        const itemCode = (apiProduct.barcodes || []).find((barcode) => barcode.status === "ACTIVE" && !barcode.isPrimary && /^[A-Z]{2}[0-9]{4}$/.test(barcode.value));

        setProduct({
          name: apiProduct.name,
          description: apiProduct.description || "Not set",
          sku: apiProduct.sku || "Not set",
          barcode: productResult.activeBarcode?.value || "Not set",
          itemCode: itemCode?.value || "Not set",
          category: apiProduct.category?.name || "Uncategorized",
          created: formatDateTime(apiProduct.createdAt),
          updated: formatDateTime(apiProduct.updatedAt),
          cost: Number(apiProduct.cost || 0),
          price: Number(apiProduct.price || 0),
          stock,
          hasSaleHistory: Boolean(productResult.hasSaleHistory),
          minimumStock: Number(apiProduct.minimumStock ?? 10),
          movement: latestMovement
            ? {
                type: isOut ? "OUT" : "IN",
                quantity: `${isOut ? "-" : "+"}${Number(latestMovement.enteredQuantity || 0)}`,
                reason: latestMovement.reason || latestMovement.type,
                date: formatDate(latestMovement.occurredAt),
              }
            : { type: "IN", quantity: "0", reason: "No stock movements yet.", date: "—" },
        });
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load product details.");
      });

    return () => {
      active = false;
    };
  }, [api, productId, reloadVersion]);

  if (error) return <ProductNotFound message={error} navigate={navigate} />;
  if (!product) {
    return <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  }

  const profit = product.price - product.cost;
  const profitPercent = product.cost ? (profit / product.cost) * 100 : 0;
  const stockHealth = Math.min(100, Math.round((product.stock / Math.max(product.minimumStock, 1)) * 100));

  if (!isMobile) {
    return <><DesktopProductDetails product={product} productId={productId} profit={profit} profitPercent={profitPercent} stockHealth={stockHealth} navigate={navigate} onOpenCostHistory={openCostHistory} onOpenSourceHistory={openSourceHistory} onRemove={removeProduct} deleting={deleting} /><CostHistoryDialog open={costHistoryOpen} onClose={() => setCostHistoryOpen(false)} history={costHistory} loading={costHistoryLoading} error={costHistoryError} /><SourceHistoryDialog open={sourceHistoryOpen} onClose={() => setSourceHistoryOpen(false)} history={sourceHistory} loading={sourceHistoryLoading} error={sourceHistoryError} /></>;
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 3 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}>
        <Toolbar sx={{ minHeight: 68, px: 2.5 }}>
          <IconButton aria-label="Back to inventory" onClick={() => navigate("/stock")} sx={{ color: "common.white", mr: 1.25, p: 0.75 }}>
            <ArrowBackRoundedIcon sx={{ fontSize: 32 }} />
          </IconButton>
          <Typography sx={{ flexGrow: 1, color: "common.white", fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{product.name}</Typography>
          <IconButton aria-label="Edit product" disabled={product.hasSaleHistory} onClick={() => navigate(`/stock/add?edit=${productId}`)} sx={{ color: "common.white", p: 0.75 }}>
            <EditRoundedIcon sx={{ fontSize: 29 }} />
          </IconButton>
          <IconButton aria-label="Delete product" disabled={deleting || product.hasSaleHistory} onClick={removeProduct} sx={{ color: "common.white", ml: 1, p: 0.75 }}>
            <DeleteRoundedIcon sx={{ fontSize: 29 }} />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 3, py: 3.25, display: "grid", gap: 3 }}>
        <Card sx={cardSx}>
          <CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}>
            <Typography align="center" sx={{ fontSize: 36, fontWeight: 700, lineHeight: 1.15, mb: 4 }}>{product.name}</Typography>
            <Box sx={{ display: "grid", rowGap: 2.25 }}>
              <DetailRow label="Description" value={product.description} muted={product.description === "Not set"} />
              <DetailRow label="SKU" value={product.sku} muted={product.sku === "Not set"} />
              <DetailRow label="Barcode" value={product.barcode} muted={product.barcode === "Not set"} />
              <DetailRow label="Item Code" value={product.itemCode} muted={product.itemCode === "Not set"} />
              <DetailRow label="Category" value={product.category} />
              <DetailRow label="Created" value={product.created} />
              <DetailRow label="Updated" value={product.updated} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={cardSx}>
          <CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}>
            <Box sx={{ display: "grid", gap: 2.25 }}>
              <DetailRow label="Cost Price" value={formatMoney(product.cost)} emphasis action={<><IconButton aria-label="View cost price history" onClick={openCostHistory} size="small"><ReceiptLongOutlinedIcon fontSize="small" /></IconButton><IconButton aria-label="View stock source history" onClick={openSourceHistory} size="small"><LocalShippingOutlinedIcon fontSize="small" /></IconButton></>} />
              <DetailRow label="Selling Price" value={formatMoney(product.price)} emphasis />
            </Box>
            <Box sx={{ mt: 3.5, p: 2.75, border: 1, borderColor: "success.light", borderRadius: 2.25, bgcolor: "#f0f9f1", display: "grid", gap: 2 }}>
              <DetailRow label="Profit Margin" value={formatMoney(profit)} valueColor="success.main" emphasis />
              <DetailRow label="Profit %" value={`${profitPercent.toFixed(1)}%`} valueColor="success.main" emphasis />
            </Box>
          </CardContent>
        </Card>

        <Card sx={cardSx}>
          <CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}>
            <Box sx={{ width: 208, height: 174, mx: "auto", display: "grid", placeItems: "center", borderRadius: 2.5, bgcolor: "#e8f2fd", mb: 3.75 }}>
              <Box sx={{ textAlign: "center" }}>
                <Typography color="text.secondary" sx={{ fontSize: 18, mb: 1.25 }}>Current Stock</Typography>
                <Typography color="primary.main" sx={{ fontSize: 43, fontWeight: 700, lineHeight: 1 }}>{product.stock} pcs</Typography>
              </Box>
            </Box>
            <DetailRow label="Total Stock Value" value={formatMoney(product.stock * product.cost)} />
            <DetailRow label="Min Stock Alert" value={`${product.minimumStock} pcs`} />
            <Box sx={{ mt: 3.5 }}>
              <DetailRow label="Stock Health" value={`${stockHealth}%`} valueColor="success.main" emphasis />
              <LinearProgress variant="determinate" value={stockHealth} color="success" sx={{ mt: 1.5, height: 12, borderRadius: 999, bgcolor: "#e7f5ea" }} />
            </Box>
          </CardContent>
        </Card>

        <MovementPanel product={product} navigate={navigate} />
      </Box>
      <CostHistoryDialog open={costHistoryOpen} onClose={() => setCostHistoryOpen(false)} history={costHistory} loading={costHistoryLoading} error={costHistoryError} />
      <SourceHistoryDialog open={sourceHistoryOpen} onClose={() => setSourceHistoryOpen(false)} history={sourceHistory} loading={sourceHistoryLoading} error={sourceHistoryError} />
    </Box>
  );
}

function DesktopProductDetails({ product, productId, profit, profitPercent, stockHealth, navigate, onOpenCostHistory, onOpenSourceHistory, onRemove, deleting }) {
  const actions = <><IconButton aria-label="Edit product" title="Edit product" disabled={product.hasSaleHistory} onClick={() => navigate(`/stock/add?edit=${productId}`)} sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: "primary.main", color: "common.white", "&:hover": { bgcolor: "primary.dark" } }}><EditRoundedIcon /></IconButton><IconButton aria-label="Delete product" title="Delete product" disabled={deleting || product.hasSaleHistory} onClick={onRemove} sx={{ width: 44, height: 44, border: "1px solid", borderColor: "error.main", borderRadius: 2, color: "error.main" }}><DeleteRoundedIcon /></IconButton></>;
  return <DesktopPage title={product.name} actionAfter={actions} headerMarginBottom={2}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.75fr) minmax(0, 1.25fr)", gap: 3, alignItems: "start" }}><DesktopPanel><Box sx={{ display: "grid", gap: 1.5 }}><DesktopDetail label="Description" value={product.description} muted={product.description === "Not set"} /><DesktopDetail label="SKU" value={product.sku} muted={product.sku === "Not set"} /><DesktopDetail label="Barcode" value={product.barcode} muted={product.barcode === "Not set"} /><DesktopDetail label="Item Code" value={product.itemCode} muted={product.itemCode === "Not set"} /><DesktopDetail label="Category" value={product.category} /><DesktopDetail label="Created" value={product.created} /><DesktopDetail label="Updated" value={product.updated} /></Box></DesktopPanel><Box sx={{ display: "grid", gap: 3, alignContent: "start" }}><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2.25 }}><DesktopStat label="Cost Price" value={formatMoney(product.cost)} action={<><IconButton aria-label="View cost price history" onClick={onOpenCostHistory} size="small"><ReceiptLongOutlinedIcon fontSize="small" /></IconButton><IconButton aria-label="View stock source history" onClick={onOpenSourceHistory} size="small"><LocalShippingOutlinedIcon fontSize="small" /></IconButton></>} /><DesktopStat label="Selling Price" value={formatMoney(product.price)} color="primary.main" /></Box><DesktopPanel><Typography sx={{ fontSize: 19, fontWeight: 700, mb: 2 }}>Profitability</Typography><Box sx={{ p: 2.5, borderRadius: 2.5, bgcolor: "#f0f9f1", border: "1px solid", borderColor: "success.light", display: "grid", gap: 1.5 }}><DesktopDetail label="Profit Margin" value={formatMoney(profit)} color="success.main" /><DesktopDetail label="Profit %" value={`${profitPercent.toFixed(1)}%`} color="success.main" /></Box></DesktopPanel><DesktopPanel><Box sx={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 3, alignItems: "center" }}><Box sx={{ p: 3, borderRadius: 2.5, bgcolor: "#eaf3ff", textAlign: "center" }}><Typography color="text.secondary">Current Stock</Typography><Typography color="primary.main" sx={{ fontSize: 36, fontWeight: 700, mt: 1 }}>{product.stock} pcs</Typography></Box><Box><DesktopDetail label="Total Stock Value" value={formatMoney(product.stock * product.cost)} /><DesktopDetail label="Min Stock Alert" value={`${product.minimumStock} pcs`} /><Box sx={{ mt: 2.5 }}><DesktopDetail label="Stock Health" value={`${stockHealth}%`} color="success.main" /><LinearProgress variant="determinate" value={stockHealth} color="success" sx={{ mt: 1.25, height: 10, borderRadius: 99 }} /></Box></Box></Box></DesktopPanel><MovementPanel product={product} navigate={navigate} desktop title="Current Stock Movement" /></Box></Box></DesktopPage>;
}

function MovementPanel({ product, navigate, desktop = false, title = "Recent Stock Movements" }) {
  const content = <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", columnGap: 1.75, alignItems: "start" }}><Box sx={{ border: 1.5, borderColor: product.movement.type === "IN" ? "success.main" : "error.main", color: product.movement.type === "IN" ? "success.main" : "error.main", borderRadius: 999, px: 1.4, py: 0.8, fontSize: 16, fontWeight: 700 }}>{product.movement.type}</Box><Box><Typography color={product.movement.type === "IN" ? "success.main" : "error.main"} sx={{ fontSize: desktop ? 16 : 21, fontWeight: 700, lineHeight: 1.15 }}>{product.movement.quantity}</Typography><Typography color="text.secondary" sx={{ mt: 1, fontSize: desktop ? 14 : 17 }}>{product.movement.reason}</Typography></Box><Typography color="text.secondary" sx={{ fontSize: desktop ? 14 : 15, whiteSpace: "nowrap" }}>{product.movement.date}</Typography></Box>;
  if (desktop) return <DesktopPanel><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}><Typography sx={{ fontSize: 19, fontWeight: 700 }}>{title}</Typography><Typography color="primary.main" onClick={() => navigate("/stock/history")} sx={{ cursor: "pointer", fontWeight: 700 }}>View All</Typography></Box>{content}</DesktopPanel>;
  return <Card sx={cardSx}><CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}><Typography sx={{ minWidth: 0, fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", "@media (min-width:400px)": { fontSize: 24 } }}>Recent Stock Movements</Typography><Typography color="primary.main" onClick={() => navigate("/stock/history")} sx={{ fontSize: 18, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>View All</Typography></Box>{content}</CardContent></Card>;
}

function DesktopDetail({ label, value, muted, color = "text.primary" }) { return <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography color="text.secondary">{label}</Typography><Typography color={muted ? "text.disabled" : color} fontWeight={600}>{value}</Typography></Box>; }


function DetailRow({ label, value, muted = false, emphasis = false, valueColor = "text.primary", action }) { return <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, alignItems: "center" }}><Typography color="text.secondary" sx={{ fontSize: 18, lineHeight: 1.3 }}>{label}</Typography><Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: .5 }}><Typography color={muted ? "text.disabled" : valueColor} sx={{ fontSize: emphasis ? 21 : 18, fontWeight: emphasis ? 700 : 600, textAlign: "right", lineHeight: 1.3 }}>{value}</Typography>{action}</Box></Box>; }

function ProductNotFound({ message, navigate }) { return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, textAlign: "center" }}><Box><Typography variant="h6" fontWeight={700}>Product not found</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{message}</Typography><IconButton onClick={() => navigate("/stock")} sx={{ mt: 2 }}><ArrowBackRoundedIcon /></IconButton></Box></Box>; }

function CostHistoryDialog({ open, onClose, history, loading, error }) {
  const gridSx = { display: "grid", gridTemplateColumns: "1fr .62fr .86fr .86fr 1fr", gap: 1, alignItems: "center" };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"><DialogTitle sx={{ fontWeight: 700 }}>Cost Price History</DialogTitle><DialogContent dividers>{loading && <Box sx={{ py: 4, display: "grid", placeItems: "center" }}><CircularProgress size={28} /></Box>}{error && <Typography color="error">{error}</Typography>}{!loading && !error && history.length === 0 && <Typography color="text.secondary">No stock-in, adjustment, or cost edit records yet.</Typography>}{!loading && !error && history.length > 0 && <><Box sx={{ ...gridSx, pb: 1, borderBottom: "1px solid", borderColor: "divider" }}><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>DATE</Typography><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>QUANTITY</Typography><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>UNIT COST</Typography><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>AVG COST</Typography><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>SOURCE</Typography></Box>{history.map((entry) => <Box key={entry.id} sx={{ ...gridSx, py: 1.5, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}><Typography sx={{ fontWeight: 700, fontSize: 14 }}>{formatDate(entry.date)}</Typography><Typography sx={{ fontSize: 14, color: entry.kind === "COST_EDIT" ? "text.secondary" : entry.direction === "OUT" ? "error.main" : "success.main" }}>{entry.kind === "COST_EDIT" ? "—" : `${entry.direction === "OUT" ? "-" : "+"}${Number(entry.stockIn)} pcs`}</Typography><Typography sx={{ fontSize: 14 }}>{entry.unitCost == null ? "—" : formatMoney(entry.unitCost)}</Typography><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{entry.averageCost == null ? "—" : formatMoney(entry.averageCost)}</Typography><Typography color="text.secondary" sx={{ fontSize: 14 }}>{entry.source}</Typography></Box>)}</>}</DialogContent></Dialog>;
}

function SourceHistoryDialog({ open, onClose, history, loading, error }) {
  const gridSx = { display: "grid", gridTemplateColumns: "1fr 1fr .65fr .8fr 1fr", gap: 1, alignItems: "center" };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"><DialogTitle sx={{ fontWeight: 700 }}>Stock Source History</DialogTitle><DialogContent dividers>{loading && <Box sx={{ py: 4, display: "grid", placeItems: "center" }}><CircularProgress size={28} /></Box>}{error && <Typography color="error">{error}</Typography>}{!loading && !error && !history.length && <Typography color="text.secondary">No stock source records yet.</Typography>}{!loading && !error && history.length > 0 && <><Box sx={{ ...gridSx, pb: 1, borderBottom: "1px solid", borderColor: "divider" }}>{["SUPPLIER", "INVOICE / REFERENCE", "QUANTITY", "COST PRICE", "RECEIVED"].map((label) => <Typography key={label} color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>{label}</Typography>)}</Box>{history.map((entry) => <Box key={entry.id} sx={{ ...gridSx, py: 1.5, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{entry.supplierName || "—"}</Typography><Typography sx={{ fontSize: 14 }}>{entry.invoiceReference || "—"}</Typography><Typography sx={{ fontSize: 14 }}>{Number(entry.quantity)} pcs</Typography><Typography sx={{ fontSize: 14 }}>{formatMoney(entry.unitCost)}</Typography><Typography sx={{ fontSize: 14 }}>{formatDate(entry.receivedAt)}</Typography></Box>)}</>}</DialogContent></Dialog>;
}

const cardSx = { borderRadius: 3, bgcolor: "background.paper", boxShadow: "0 4px 12px rgba(15,23,42,0.16)" };
