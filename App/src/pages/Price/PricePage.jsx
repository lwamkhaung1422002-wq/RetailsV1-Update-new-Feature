import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, Box, Button, Chip, Dialog, DialogContent, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, Menu, MenuItem, Paper, Radio, RadioGroup, Select, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useCategoriesQuery, useProductsQuery, usePromotionCampaignsQuery } from "../../hooks/usePosQueries";
import { usePosApi } from "../../hooks/useApiResource";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useManagerApproval } from "../../context/approval-context";
import { queryKeys } from "../../lib/queryKeys";
import PriceHistoryPage from "./PriceHistoryPage";
import PromotionReportPage from "./PromotionReportPage";
import WholesalePricingSection from "./WholesalePricingSection";
import { promotionIsTerminal } from "./promotionState";
const yangonDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ကျပ်`;

export default function PricePage() {
  const mobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "promotion" ? "promotion" : "price";
  const setTab = (nextTab) => navigate(`/price?tab=${nextTab}`);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateMode, setDateMode] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [desktopDialog, setDesktopDialog] = useState("");
  const [endingPromotionId, setEndingPromotionId] = useState("");
  const [promotionActionError, setPromotionActionError] = useState("");
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const { data: productResult } = useProductsQuery({ status: "active", page: 1, pageSize: 100, sort: "name", direction: "asc" });
  const { data: categoryResult } = useCategoriesQuery();
  const { data: campaignResult } = usePromotionCampaignsQuery();
  const catalog = useMemo(() => (productResult?.products || []).map((product) => ({ ...product, code: product.sku || product.barcodes?.[0]?.value || "", cost: Number(product.cost || 0), price: Number(product.price || 0), start: product.createdAt, icon: "box", color: "#eaf3ff" })), [productResult]);
  const promotionRows = useMemo(() => (campaignResult?.campaigns || []).map((campaign) => { const sample = campaign.sampleProduct || {}; const first = campaign.promotions?.[0] || {}; const ended = promotionIsTerminal(campaign); const value = Number(first.value || 0); const discountAmount = first.type === "FIXED_PRICE" ? Math.max(0, Number(sample.price || 0) - value) : Math.round(Number(sample.price || 0) * value / 100); const scopeLabel = campaign.scope === "PRODUCT" ? sample.name || first.product?.name || "Product" : campaign.scope === "CATEGORY" ? campaign.category?.name || "Category" : "All"; const discountLabel = first.type === "PERCENTAGE" ? `${value}% OFF` : first.type === "FIXED_PRICE" ? `${money(value)} fixed price` : `${money(discountAmount)} OFF`; return { id: campaign.id, version: campaign.version, name: campaign.name, scope: campaign.scope, scopeLabel, categoryName: campaign.category?.name || "Category", discountLabel, code: sample.sku || "", cost: Number(sample.cost || 0), price: Number(sample.price || 0), promotion: true, ended, discountAmount, discountPercent: first.type === "PERCENTAGE" ? value : (Number(sample.price || 0) ? Math.round(discountAmount / Number(sample.price || 0) * 100) : 0), start: first.startsAt, end: first.endsAt, reason: first.reason || "", icon: "box", color: "#e5f5e8" }; }), [campaignResult]);
  const endPromotion = async (campaign) => {
    if (endingPromotionId || !window.confirm(`End promotion “${campaign.name}”?`)) return;
    setEndingPromotionId(campaign.id); setPromotionActionError("");
    try {
      await api.pricing.updatePromotionCampaign(campaign.id, { expectedVersion: Number(campaign.version), state: "CANCELLED" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.promotionCampaigns(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) }),
      ]);
    } catch (error) { setPromotionActionError(error.message || "Promotion could not be ended. Please try again."); }
    finally { setEndingPromotionId(""); }
  };
  const sourceProducts = tab === "promotion" ? promotionRows : catalog;
  const visible = useMemo(() => sourceProducts.filter((product) => {
    const query = search.trim().toLowerCase();
    const today = yangonDateKey();
    const productDate = product.start ? yangonDateKey(product.start) : "";
    return (!query || [product.name, product.code].some((value) => value.toLowerCase().includes(query)))
      && (tab === "price" || product.promotion)
      && (dateMode !== "today" || productDate === today)
      && (dateMode !== "custom" || ((!from || productDate >= from) && (!to || productDate <= to)));
  }), [dateMode, from, search, sourceProducts, tab, to]);
  const activePromotionCount = (campaignResult?.campaigns || []).filter((campaign) => campaign.effectiveState === "RUNNING").length;

  if (!mobile) return <DesktopPricePromotion tab={tab} setTab={setTab} search={search} setSearch={setSearch} products={visible} catalog={catalog} categories={categoryResult?.categories || []} activePromotionCount={activePromotionCount} dateMode={dateMode} setDateMode={setDateMode} from={from} setFrom={setFrom} to={to} setTo={setTo} dialog={desktopDialog} setDialog={setDesktopDialog} onEnd={endPromotion} endingPromotionId={endingPromotionId} />;
  return <Box sx={{ minHeight: "100dvh", pb: "104px", bgcolor: "#fff", fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif" }}>
    <Box sx={barSx}><IconButton aria-label="Back to settings" onClick={() => navigate("/settings")} sx={barIconSx}><ArrowBackRoundedIcon sx={{ fontSize: 32 }} /></IconButton><Typography align="center" sx={{ fontSize: 22, fontWeight: 700 }}>Price &amp; Promotion</Typography><IconButton aria-label="Filter prices and promotions" onClick={() => setFilterOpen(true)} sx={barIconSx}><FilterAltOutlinedIcon sx={{ fontSize: 30 }} /></IconButton></Box>
    <Box sx={{ px: 2.5, pt: 2 }}>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product by name or code" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "text.secondary", fontSize: 29 }} /></InputAdornment> } }} sx={searchSx} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: 1.5 }}><TabButton label="Price" active={tab === "price"} onClick={() => setTab("price")} tone="primary.main" /><TabButton label="Promotion" active={tab === "promotion"} onClick={() => setTab("promotion")} tone="success.main" /></Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2.25, mb: 1.75 }}><Typography sx={{ fontSize: 16, fontWeight: 500 }}>{visible.length} {tab === "price" ? "Products" : "Promotions"}</Typography>{tab === "promotion" && <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Active: {activePromotionCount}</Typography>}</Box>
      {promotionActionError && <Alert severity="error" sx={{ mb: 1.5 }}>{promotionActionError}</Alert>}
      <Stack spacing={1.75}>{visible.map((product) => <ProductCard key={product.id} product={product} promotion={tab === "promotion"} ending={endingPromotionId === product.id} onEdit={() => navigate(tab === "price" ? `/price/add?edit=${product.id}` : `/price/promotion/add?edit=${product.id}`)} onEnd={tab === "promotion" ? () => void endPromotion(product) : undefined} onReport={tab === "promotion" ? () => navigate(`/price/promotion/${product.id}/report`) : undefined} />)}</Stack>
    </Box>
    <Paper elevation={5} sx={footerSx}><Box sx={{ display: "grid", gridTemplateColumns: "1.65fr 0.9fr", gap: 1.5 }}><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate(tab === "price" ? "/price/add" : "/price/promotion/add")} sx={footerPrimarySx}>{tab === "price" ? "Add Price" : "Add Promotion"}</Button><Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => navigate("/price/history")} sx={footerSecondarySx}>History</Button></Box></Paper>
    <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} fullWidth slotProps={{ paper: { sx: { m: 2.5, borderRadius: 2.5, maxWidth: 420 } } }}><DialogContent sx={{ p: 2.5 }}><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5 }}><Typography sx={{ fontSize: 20, fontWeight: 600 }}>Filter {tab === "price" ? "prices" : "promotions"}</Typography><IconButton onClick={() => setFilterOpen(false)}><CloseRoundedIcon /></IconButton></Box><Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary" }}>Date</Typography><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, mt: 1 }}>{[["all", "All"], ["today", "Today"], ["custom", "Custom"]].map(([value, label]) => <Button key={value} variant={dateMode === value ? "contained" : "outlined"} onClick={() => setDateMode(value)} sx={{ minHeight: 48, borderRadius: 1.5, textTransform: "none" }}>{label}</Button>)}</Box>{dateMode === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1.75 }}><TextField label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box>}<Button fullWidth variant="contained" onClick={() => setFilterOpen(false)} sx={{ mt: 2.5, minHeight: 54, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none" }}>Apply filters</Button></DialogContent></Dialog>
  </Box>;
}

function TabButton({ label, active, onClick, tone }) { return <Button onClick={onClick} sx={{ minHeight: 54, borderRadius: 1.25, border: "1px solid", borderColor: active ? tone : "#dfe3e8", bgcolor: active ? "#eaf3ff" : "background.paper", color: tone, fontSize: 16, fontWeight: 700, textTransform: "none" }}>{label}</Button>; }
function ProductCard({ product, promotion, onEdit, onEnd, onReport, ending }) {
  const period = promotion ? formatPromotionPeriod(product.start, product.end) : "";
  if (promotion && product.scope !== "PRODUCT") return <PromotionSummaryCard product={product} period={period} onEdit={onEdit} onEnd={onEnd} onReport={onReport} ending={ending} />;
  return <Paper elevation={2} sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: 1.75, boxShadow: "0 2px 8px rgba(15,23,42,0.12)", "@media (max-width:360px)": { p: 1.25 } }}>
    <Box sx={{ display: "grid", gridTemplateColumns: promotion ? "auto minmax(0, 1fr) auto" : "auto minmax(0, 1fr) auto", gap: { xs: 0.65, sm: 1 }, alignItems: "center", "@media (max-width:360px)": { columnGap: .4 } }}>
      <Chip label={promotion ? (product.ended ? "End Promotion" : "Promotion") : "Price"} size="small" sx={{ height: 28, bgcolor: promotion ? (product.ended ? "#ffebee" : "#e3f5e6") : "#eaf3ff", color: promotion ? (product.ended ? "error.main" : "#168437") : "primary.main", borderRadius: 1, fontSize: 12, fontWeight: 600, "& .MuiChip-label": { px: 0.8 } }} />
      <Typography noWrap sx={{ minWidth: 0, fontSize: { xs: 16, sm: 17 }, fontWeight: 600 }}>{product.name}{promotion && <Box component="span" sx={{ ml: 0.65, color: "text.secondary", fontSize: { xs: 12, sm: 13 }, fontWeight: 500 }}>({product.scopeLabel})</Box>}</Typography>
      {promotion ? <Box sx={{ display: "flex", alignItems: "center", gap: 0, justifySelf: "end", flexShrink: 0 }}><Chip label={period} size="small" sx={{ flexShrink: 0, height: 26, borderRadius: 99, bgcolor: "#e3f5e6", color: "#168437", fontSize: 10, fontWeight: 700, "& .MuiChip-label": { whiteSpace: "nowrap", px: 0.8 } }} /><PromotionActions product={product} onEdit={onEdit} onEnd={onEnd} onReport={onReport} ending={ending} /></Box> : <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit} sx={{ minHeight: 42, px: { xs: 0.8, sm: 1.25 }, borderRadius: 1, fontSize: 13, fontWeight: 600, textTransform: "none", whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: { xs: 0.35, sm: 0.7 } } }}>Edit Price</Button>}
    </Box>
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", columnGap: 1.5, mt: 2 }}>{promotion ? <Metric label="Product" value={product.scopeLabel} /> : <Metric label="Cost Price" value={money(product.cost)} />}<Box sx={{ bgcolor: "#d9dee5" }} />{promotion ? <Metric label="Discount" value={product.discountLabel} /> : <Metric label="Sell Price" value={money(product.price)} />}</Box>
  </Paper>;
}
function PromotionSummaryCard({ product, period, onEdit, onEnd, onReport, ending }) { const all = product.scope === "ALL"; return <Paper elevation={2} sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: 1.75, boxShadow: "0 2px 8px rgba(15,23,42,0.12)", "@media (max-width:360px)": { p: 1.25 } }}><Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: { xs: .65, sm: 1 }, alignItems: "center", "@media (max-width:360px)": { columnGap: .4 } }}><Chip label={product.ended ? "End Promotion" : "Promotion"} size="small" sx={{ height: 28, bgcolor: product.ended ? "#ffebee" : "#e3f5e6", color: product.ended ? "error.main" : "#168437", borderRadius: 1, fontSize: 12, fontWeight: 600, "& .MuiChip-label": { px: .8 } }} /><Typography noWrap sx={{ minWidth: 0, fontSize: { xs: 16, sm: 17 }, fontWeight: 600 }}>{product.name}</Typography><Box sx={{ display: "flex", alignItems: "center", gap: 0, justifySelf: "end", flexShrink: 0 }}><Chip label={period} size="small" sx={{ flexShrink: 0, height: 26, borderRadius: 99, bgcolor: "#e3f5e6", color: "#168437", fontSize: 10, fontWeight: 700, "& .MuiChip-label": { whiteSpace: "nowrap", px: .8 } }} /><PromotionActions product={product} onEdit={onEdit} onEnd={onEnd} onReport={onReport} ending={ending} /></Box></Box><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", columnGap: 1.5, mt: 2 }}><Box sx={{ display: "flex", alignItems: "center" }}><Typography sx={{ fontSize: 17, fontWeight: 600 }}>{all ? "All Products" : `${product.categoryName} (Category)`}</Typography></Box><Box sx={{ bgcolor: "#d9dee5" }} /><Box><Typography color="text.secondary" sx={{ fontSize: 13 }}>Discount</Typography><Typography color="success.main" sx={{ mt: .5, fontSize: 17, fontWeight: 600 }}>{product.discountLabel}</Typography></Box></Box></Paper>; }

export function PromotionActions({ product, onEdit, onEnd, onReport, ending }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const closeMenu = () => setAnchorEl(null);
  return <>
    <IconButton aria-label={`Actions for ${product.name}`} size="small" onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ width: 36, height: 36, ml: -.15, mr: -.75 }}><MoreVertRoundedIcon /></IconButton>
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <MenuItem disabled={product.ended} onClick={() => { closeMenu(); onEdit(); }}><EditOutlinedIcon fontSize="small" sx={{ mr: 1.25, color: "primary.main" }} />Edit</MenuItem>
      <MenuItem disabled={product.ended || ending} onClick={() => { closeMenu(); onEnd(); }} sx={{ color: "error.main" }}><StopCircleOutlinedIcon fontSize="small" sx={{ mr: 1.25 }} />End</MenuItem>
      {onReport && <MenuItem onClick={() => { closeMenu(); onReport(); }}>Report</MenuItem>}
    </Menu>
  </>;
}
function formatPromotionPeriod(start, end) { const options = { timeZone: "Asia/Yangon", month: "short", day: "numeric" }; const startDate = new Date(start); const endDate = new Date(end); return Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) ? "—" : `${startDate.toLocaleDateString("en-US", options)}–${endDate.toLocaleDateString("en-US", options)}`; }
function Metric({ label, value, caption }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 13 }}>{label}</Typography><Typography sx={{ mt: 0.5, fontSize: 17, fontWeight: 600 }}>{value}</Typography>{caption && <Typography color="success.main" sx={{ mt: .35, fontSize: 11, fontWeight: 700 }}>{caption}</Typography>}</Box>; }

function DesktopPricePromotion({ tab, setTab, search, setSearch, products: visibleProducts, catalog, categories, activePromotionCount, dateMode, setDateMode, from, setFrom, to, setTo, dialog, setDialog, onEnd, endingPromotionId }) {
  const tabLabel = tab === "price" ? "Products" : "Promotions";
  const [reportCampaign, setReportCampaign] = useState(null);
  const closeDialog = () => { setDialog(""); setReportCampaign(null); };
  return <Paper sx={desktopPricePageSx}>
    <Box sx={desktopPriceToolbarSx}>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product by name or code" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "text.secondary", fontSize: 22 }} /></InputAdornment> } }} sx={desktopPriceSearchSx} />
      <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialog("price")} sx={desktopAddPriceSx}>Add Price</Button>
      <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={() => setDialog("promotion")} sx={desktopAddPriceSx}>Add Promotion</Button>
      <Button variant="outlined" startIcon={<CalendarMonthRoundedIcon />} onClick={() => setDialog("date")} sx={desktopDateFilterSx}>Date and time</Button>
    </Box>
    <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
      <DesktopPriceTab active={tab === "price"} label="Price" tone="primary.main" onClick={() => setTab("price")} />
      <DesktopPriceTab active={tab === "promotion"} label="Promotion" tone="#278a45" onClick={() => setTab("promotion")} />
      <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => setDialog("history")} sx={desktopHistoryTabSx}>History</Button>
    </Stack>
    <Box sx={desktopPriceSummarySx}>
      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{visibleProducts.length} {tabLabel}</Typography>
      {tab === "promotion" && <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}><Typography color="text.secondary" sx={{ fontSize: 13 }}>Active Promotions</Typography><Typography sx={{ fontSize: 20, fontWeight: 700 }}>{activePromotionCount}</Typography></Box>}
    </Box>
    <Box sx={desktopProductGridSx}>{visibleProducts.map((product) => <DesktopProductCard key={product.id} product={product} promotion={tab === "promotion"} ending={endingPromotionId === product.id} onEnd={tab === "promotion" ? () => void onEnd(product) : undefined} onEdit={() => setDialog(tab === "promotion" ? "promotion" : "price")} onReport={tab === "promotion" ? () => { setReportCampaign(product); setDialog("report"); } : undefined} />)}</Box>
    {!visibleProducts.length && <Typography align="center" color="text.secondary" sx={{ py: 8 }}>No {tabLabel.toLowerCase()} found.</Typography>}
    <DesktopPriceDialog type={dialog} reportCampaign={reportCampaign} onClose={closeDialog} onPromotionSaved={() => { closeDialog(); setTab("promotion"); }} products={catalog} categories={categories} dateMode={dateMode} setDateMode={setDateMode} from={from} setFrom={setFrom} to={to} setTo={setTo} />
  </Paper>;
}

function DesktopPriceTab({ active, label, tone, onClick }) {
  return <Button variant="outlined" onClick={onClick} sx={{ minWidth: 148, minHeight: 42, borderRadius: 1.25, textTransform: "none", fontWeight: 700, borderColor: active ? tone : "divider", bgcolor: active ? "#f6faff" : "background.paper", color: tone, "&:hover": { borderColor: tone, bgcolor: active ? "#f1f7ff" : "action.hover" } }}>{label}</Button>;
}

function DesktopProductCard({ product, promotion, onEdit, onEnd, onReport, ending }) {
  const summaryPromotion = promotion && product.scope !== "PRODUCT";
  return <Paper variant="outlined" sx={desktopProductCardSx}>
    {promotion ? <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
          <Chip label={product.ended ? "End Promotion" : "Promotion"} size="small" sx={{ height: 26, flexShrink: 0, borderRadius: 1, bgcolor: product.ended ? "#ffebee" : "#e5f5e8", color: product.ended ? "error.main" : "#278a45", fontSize: 12, fontWeight: 700, "& .MuiChip-label": { px: 1 } }} />
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 12.5 }}>{formatPromotionPeriod(product.start, product.end)}</Typography>
        </Box>
        <PromotionActions product={product} onEdit={onEdit} onEnd={onEnd} ending={ending} />
      </Box>
      <Box sx={{ mt: .8, pb: 1.15, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography noWrap sx={{ minWidth: 0, fontSize: 17, lineHeight: 1.3, fontWeight: 700 }}>{product.name}</Typography>
        <Chip label="Report" size="small" variant="outlined" color="primary" onClick={onReport} sx={{ height: 23, flexShrink: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 700 }} />
      </Box>
    </> : <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.25, minHeight: 38 }}>
        <Chip label="Price" size="small" sx={{ height: 26, borderRadius: 1, bgcolor: "#edf5ff", color: "primary.main", fontSize: 12, fontWeight: 700, "& .MuiChip-label": { px: 1 } }} />
        <Button variant="text" startIcon={<EditOutlinedIcon />} onClick={onEdit} sx={desktopCardEditSx}>Edit Price</Button>
      </Box>
      <Typography noWrap sx={{ mt: 1.1, pb: 1.25, fontSize: 17, lineHeight: 1.3, fontWeight: 700, borderBottom: "1px solid", borderColor: "divider" }}>{product.name}</Typography>
    </>}
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)", gap: 1.5, pt: 1.4 }}>
      {summaryPromotion ? <DesktopPriceMetric label="Applies To" value={product.scope === "ALL" ? "All Products" : product.categoryName} /> : promotion ? <DesktopPriceMetric label="Product" value={product.scopeLabel} /> : <DesktopPriceMetric label="Cost Price" value={money(product.cost)} />}
      <Box sx={{ bgcolor: "divider" }} />
      {summaryPromotion || promotion ? <DesktopPriceMetric label="Discount" value={product.discountLabel} /> : <DesktopPriceMetric label="Sell Price" value={money(product.price)} />}
    </Box>
  </Paper>;
}

function DesktopPriceMetric({ label, value, caption }) { return <Box sx={{ minWidth: 0 }}><Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.25, fontWeight: 500 }}>{label}</Typography><Typography noWrap sx={{ mt: .4, fontSize: 17, lineHeight: 1.3, fontWeight: 700 }}>{value}</Typography>{caption && <Typography noWrap color="success.main" sx={{ mt: .4, fontSize: 11.5, fontWeight: 700 }}>{caption}</Typography>}</Box>; }

function DesktopPriceDialog({ type, reportCampaign, onClose, onPromotionSaved, products, categories, dateMode, setDateMode, from, setFrom, to, setTo }) {
  const isDate = type === "date";
  const isHistory = type === "history";
  const isReport = type === "report";
  const isPromotion = type === "promotion";
  const isPrice = type === "price";
  return <Dialog open={Boolean(type)} onClose={onClose} fullWidth maxWidth={isHistory || isReport ? false : "sm"} slotProps={{ paper: { sx: { width: isReport ? 960 : isHistory ? 720 : undefined, maxWidth: isHistory || isReport ? "calc(100% - 32px)" : undefined, borderRadius: 2, m: 2, maxHeight: isHistory || isReport ? "88vh" : "calc(100vh - 40px)" } } }}>
    {isDate && <DialogContent sx={desktopDialogContentSx}><Box sx={desktopDialogTitleSx}><Typography sx={{ fontSize: 20, fontWeight: 700 }}>Date and time</Typography><IconButton aria-label="Close date filter" onClick={onClose}><CloseRoundedIcon /></IconButton></Box><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25 }}><DesktopDateChoice label="All" active={dateMode === "all"} onClick={() => setDateMode("all")} /><DesktopDateChoice label="Today" active={dateMode === "today"} onClick={() => setDateMode("today")} /><DesktopDateChoice label="Custom" active={dateMode === "custom"} onClick={() => setDateMode("custom")} /></Box>{dateMode === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 2 }}><TextField label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box>}<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.25, mt: 3 }}><Button onClick={() => { setDateMode("all"); setFrom(""); setTo(""); }} sx={desktopTextButtonSx}>Reset</Button><Button variant="contained" onClick={onClose} sx={desktopModalButtonSx}>Apply</Button></Box></DialogContent>}
    {(isPrice || isPromotion) && <DesktopPriceForm products={products} categories={categories} promotion={isPromotion} onClose={onClose} onPromotionSaved={onPromotionSaved} />}
    {isHistory && <><DialogContent sx={{ p: 0, maxHeight: "calc(84vh - 66px)" }}><PriceHistoryPage embedded /></DialogContent><Box sx={{ display: "flex", justifyContent: "flex-end", px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}><Button onClick={onClose} variant="outlined" sx={desktopCancelButtonSx}>Close</Button></Box></>}
    {isReport && reportCampaign && <><DialogContent sx={{ p: 0, maxHeight: "calc(88vh - 66px)" }}><PromotionReportPage embedded campaignId={reportCampaign.id} /></DialogContent><Box sx={{ display: "flex", justifyContent: "flex-end", px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}><Button onClick={onClose} variant="outlined" sx={desktopCancelButtonSx}>Close</Button></Box></>}
  </Dialog>;
}

function DesktopDateChoice({ label, active, onClick }) { return <Button onClick={onClick} variant={active ? "contained" : "outlined"} sx={{ minHeight: 48, borderRadius: 1.5, textTransform: "none", fontWeight: 700 }}>{label}</Button>; }

function DesktopPriceForm({ products, categories, promotion, onClose, onPromotionSaved }) {
  const api = usePosApi();
  const { runWithApproval } = useManagerApproval();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState("all");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [percentage, setPercentage] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [reason, setReason] = useState("");
  const [promotionName, setPromotionName] = useState("");
  const [audienceType, setAudienceType] = useState("ALL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = products.find((product) => product.id === selectedId);
  const results = products.filter((product) => !query || [product.name, product.code].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  const updatePercentage = (value) => { setPercentage(value.replace(/[^0-9.]/g, "")); setManualPrice(""); };
  const updateManualPrice = (value) => { setManualPrice(value.replace(/[^0-9]/g, "")); setPercentage(""); };
  const calculated = selected && percentage ? Math.round((promotion ? selected.price * (1 - Number(percentage) / 100) : selected.cost * (1 + Number(percentage) / 100))) : "";
  const shownPrice = manualPrice || (calculated ? String(calculated) : "");
  const manualPercentage = selected && manualPrice ? (promotion ? ((selected.price - Number(manualPrice)) / selected.price) * 100 : ((Number(manualPrice) - selected.cost) / selected.cost) * 100) : null;
  const shownPercentage = manualPercentage !== null && Number.isFinite(manualPercentage) ? manualPercentage.toFixed(1) : percentage;
  const submit = async () => {
    if (!reason.trim() || (!promotion && !shownPrice && !percentage) || (promotion && (!promotionName.trim() || !start || !end || !percentage))) { setSubmitError("Complete the required fields before saving."); return; }
    if (scope === "individual" && !selectedId) { setSubmitError("Select a product."); return; }
    if (scope === "category" && !category) { setSubmitError("Select a category."); return; }
    setSaving(true); setSubmitError("");
    try {
      if (promotion) {
        await api.pricing.createPromotionCampaign({ name: promotionName.trim(), scope: scope === "individual" ? "PRODUCT" : scope.toUpperCase(), ...(scope === "individual" ? { productId: selectedId } : scope === "category" ? { categoryId: category } : {}), type: "PERCENTAGE", value: Number(percentage), startsAt: new Date(`${start}T00:00:00+06:30`).toISOString(), endsAt: new Date(`${end}T23:59:59+06:30`).toISOString(), state: "SCHEDULED", reason: reason.trim(), timeZone: "Asia/Yangon", audienceType });
      } else if (scope === "individual") {
        const body = { productId: selectedId, unitPrice: Number(shownPrice), effectiveFrom: new Date().toISOString(), reason: reason.trim() };
        await runWithApproval({ permission: "price.edit", action: "price.override", actionLabel: "Price override", targetId: selectedId, targetLabel: selected?.name, amountLabel: money(body.unitPrice), payload: body, initialReason: body.reason }, (approvalToken) => api.pricing.createPrice(body, approvalToken));
      } else {
        await api.pricing.bulkPrices({ scope: scope.toUpperCase(), ...(scope === "category" ? { categoryId: category } : {}), marginPercent: Number(percentage), reason: reason.trim() });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.products(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pricing(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.promotionCampaigns(shop?.id) }),
      ]);
      if (promotion) onPromotionSaved(); else onClose();
    } catch (error) { if (!error.approvalCancelled) setSubmitError(error.message || "Unable to save pricing."); } finally { setSaving(false); }
  };
  return <DialogContent sx={desktopDialogContentSx}>
    <Box sx={desktopDialogTitleSx}><Box><Typography sx={{ fontSize: 20, fontWeight: 700 }}>{promotion ? "Add Promotion" : "Add Price"}</Typography><Typography color="text.secondary" sx={{ mt: .35, fontSize: 13 }}>{promotion ? "Set a discount price and promotion period." : "Set a selling price and margin."}</Typography></Box><IconButton aria-label="Close dialog" onClick={onClose}><CloseRoundedIcon /></IconButton></Box>
    <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>Apply {promotion ? "promotion" : "price"} to</Typography>
    <Paper variant="outlined" sx={{ p: .75, borderRadius: 1.75 }}><RadioGroup row value={scope} onChange={(event) => { setScope(event.target.value); if (event.target.value !== "individual") setSelectedId(""); }} sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}><DesktopScope value="individual" label="Individual" /><DesktopScope value="category" label="Category" /><DesktopScope value="all" label="All" /></RadioGroup></Paper>
    {scope === "category" && <FormControl fullWidth sx={{ mt: 2 }}><InputLabel>Select category</InputLabel><Select label="Select category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>}
    {scope === "individual" && <><TextField fullWidth value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product by name or barcode" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon color="action" /></InputAdornment> } }} sx={{ mt: 2 }} /><Paper variant="outlined" sx={{ mt: 1, borderRadius: 1.5, overflow: "hidden", maxHeight: 170, overflowY: "auto" }}>{results.map((product, index) => <Box key={product.id} onClick={() => setSelectedId(product.id)} sx={{ px: 1.75, py: 1.2, cursor: "pointer", bgcolor: selectedId === product.id ? "#eaf3ff" : "background.paper" }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{product.name} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {product.code}</Box></Typography>{index < results.length - 1 && <Divider sx={{ mt: 1.15 }} />}</Box>)}</Paper></>}
    {promotion && <><TextField fullWidth label="Promotion name" value={promotionName} onChange={(event) => setPromotionName(event.target.value)} placeholder="e.g. August discount" sx={{ mt: 2 }} /><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1.5 }}><TextField label="Start date" type="date" value={start} onChange={(event) => setStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="End date" type="date" value={end} onChange={(event) => setEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box></>}
    {promotion && <TextField select fullWidth label="Audience" value={audienceType} onChange={(event) => setAudienceType(event.target.value)} sx={{ mt: 1.5 }}><MenuItem value="ALL">All Customers</MenuItem><MenuItem value="RETAIL">Retail Only</MenuItem><MenuItem value="WHOLESALE">Wholesale Only</MenuItem></TextField>}
    {selected && <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 1.5 }}><Typography sx={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", columnGap: 1.5, mt: 1.25 }}><DesktopPriceMetric label={promotion ? "Current Sell Price" : "Cost Price"} value={money(promotion ? selected.price : selected.cost)} /><Box sx={{ bgcolor: "divider" }} /><DesktopPriceMetric label={promotion ? "Promotion Price" : "Current Sell Price"} value={shownPrice ? money(Number(shownPrice)) : money(selected.price)} /></Box></Paper>}
    {scope === "individual" ? <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 2 }}><TextField label={promotion ? "Discount percentage" : "Margin percentage"} value={shownPercentage} onChange={(event) => updatePercentage(event.target.value)} placeholder={promotion ? "e.g. 10" : "e.g. 15"} inputMode="decimal" /><TextField label={promotion ? "Manual promotion price" : "New sell price"} value={shownPrice} onChange={(event) => updateManualPrice(event.target.value)} inputMode="numeric" /></Box> : <TextField fullWidth label={promotion ? "Discount percentage" : "Margin percentage"} value={percentage} onChange={(event) => updatePercentage(event.target.value)} placeholder={promotion ? "e.g. 10" : "e.g. 15"} inputMode="decimal" sx={{ mt: 2 }} />}
    {!promotion && scope === "individual" && selected && <WholesalePricingSection key={selected.id} product={selected} />}
    <TextField fullWidth label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={promotion ? "Why is this promotion being created?" : "Why is this price being changed?"} multiline minRows={2} sx={{ mt: 1.5 }} />
    {submitError && <Typography color="error" sx={{ mt: 1.5 }}>{submitError}</Typography>}<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.25, mt: 2.5 }}><Button onClick={onClose} variant="outlined" sx={desktopCancelButtonSx}>Cancel</Button><Button onClick={submit} disabled={saving} variant="contained" startIcon={<CheckRoundedIcon />} sx={desktopModalButtonSx}>{saving ? "Saving…" : promotion ? "Create Promotion" : "Apply Price"}</Button></Box>
  </DialogContent>;
}

function DesktopScope({ value, label }) { return <FormControlLabel value={value} control={<Radio size="small" />} label={label} sx={{ m: 0, justifyContent: "center", "& .MuiFormControlLabel-label": { fontSize: 13, fontWeight: 700 } }} />; }

const barSx = { height: 68, px: 1.5, bgcolor: "primary.main", color: "common.white", display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) 48px", alignItems: "center" }; const barIconSx = { width: 48, height: 48, color: "inherit" }; const searchSx = { "& .MuiOutlinedInput-root": { minHeight: 56, px: 1.5, borderRadius: 1.5, bgcolor: "#f7f8fa", fontSize: 16, "& fieldset": { borderColor: "#e3e6ea" } } }; const footerSx = { position: "fixed", left: 0, right: 0, bottom: 0, px: 2.5, py: 2, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider", zIndex: 10 }; const footerPrimarySx = { minHeight: 58, borderRadius: 1.5, fontSize: 17, fontWeight: 700, textTransform: "none" }; const footerSecondarySx = { minHeight: 58, borderRadius: 1.5, borderColor: "divider", color: "primary.main", fontSize: 17, fontWeight: 700, textTransform: "none" };

const desktopPricePageSx = { width: "100%", maxWidth: "none", mx: 0, p: 2.25, borderRadius: 2.25, border: "1px solid", borderColor: "divider", boxShadow: "0 2px 10px rgba(15,23,42,.05)", bgcolor: "background.paper" };
const desktopPriceToolbarSx = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto", gap: 1.25, alignItems: "center" };
const desktopPriceSearchSx = { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 1.25, bgcolor: "background.paper" } };
const desktopAddPriceSx = { minHeight: 44, px: 2.25, borderRadius: 1.25, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" };
const desktopDateFilterSx = { minHeight: 44, px: 1.75, borderRadius: 1.25, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap", color: "text.primary", borderColor: "divider" };
const desktopHistoryTabSx = { minHeight: 42, minWidth: 126, borderRadius: 1.25, textTransform: "none", fontWeight: 700, borderColor: "divider", color: "text.primary" };
const desktopPriceSummarySx = { display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2.25, pb: 1.75, borderBottom: "1px solid", borderColor: "divider" };
const desktopProductGridSx = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 2, pt: 1.75, "@media (max-width: 1200px)": { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }, "@media (max-width: 960px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } };
const desktopProductCardSx = { minWidth: 0, minHeight: 182, p: 1.75, borderRadius: 1.75, borderColor: "divider", boxShadow: "0 3px 10px rgba(15,23,42,.08)", bgcolor: "background.paper" };
const desktopCardEditSx = { minWidth: 0, minHeight: 34, px: .75, py: .5, color: "primary.main", fontSize: 12.5, fontWeight: 700, lineHeight: 1.1, textTransform: "none", whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: .45 }, "& .MuiSvgIcon-root": { fontSize: 18 } };
const desktopDialogContentSx = { p: 2.5, "&:last-child": { pb: 2.5 } };
const desktopDialogTitleSx = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 2.25 };
const desktopTextButtonSx = { minHeight: 40, textTransform: "none", fontWeight: 700 };
const desktopModalButtonSx = { minHeight: 42, px: 2.25, borderRadius: 1.25, textTransform: "none", fontWeight: 700 };
const desktopCancelButtonSx = { minHeight: 42, px: 2.25, borderRadius: 1.25, textTransform: "none", fontWeight: 700, borderColor: "divider", color: "text.secondary" };
