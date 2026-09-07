import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, AppBar, Box, Button, CircularProgress, IconButton, InputAdornment, Paper,
  Popover, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Toolbar, Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { queryKeys } from "../../lib/queryKeys";

const money = (value) => `${new Intl.NumberFormat("en-US").format(Math.round(Number(value || 0)))} ကျပ်`;
const quantity = (value) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(Number(value || 0))} pcs`;

function dateKey(value) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function reportForRange(report, from, to) {
  const productMap = new Map(report.products.map((product) => [product.productId, {
    ...product, quantitySold: 0, orderCount: 0, regularSales: 0, promotionDiscount: 0,
    netSales: 0, costOfGoods: 0, grossProfit: 0, orderIds: new Set(),
  }]));
  const orders = report.orders.filter((item) => {
    const soldOn = dateKey(item.soldAt);
    return (!from || soldOn >= from) && (!to || soldOn <= to);
  });
  for (const item of orders) {
    const row = productMap.get(item.productId);
    if (!row) continue;
    row.quantitySold += Number(item.quantitySold || 0);
    row.regularSales += Number(item.regularSales || 0);
    row.promotionDiscount += Number(item.promotionDiscount || 0);
    row.netSales += Number(item.netSales || 0);
    row.costOfGoods += Number(item.costOfGoods || 0);
    row.grossProfit += Number(item.grossProfit || 0);
    row.orderIds.add(item.orderId);
  }
  const products = [...productMap.values()].map(({ orderIds, ...product }) => ({
    ...product,
    orderCount: orderIds.size,
    marginPercent: product.netSales > 0 ? Number((product.grossProfit / product.netSales * 100).toFixed(1)) : 0,
  })).sort((left, right) => right.netSales - left.netSales || left.productName.localeCompare(right.productName));
  const total = (key) => orders.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  const netSales = total("netSales");
  const grossProfit = total("grossProfit");
  return {
    products,
    summary: {
      orderCount: new Set(orders.map((item) => item.orderId)).size,
      quantitySold: total("quantitySold"),
      productCount: products.filter((product) => product.quantitySold > 0).length,
      netSales,
      promotionDiscount: total("promotionDiscount"),
      costOfGoods: total("costOfGoods"),
      grossProfit,
      marginPercent: netSales > 0 ? Number((grossProfit / netSales * 100).toFixed(1)) : 0,
    },
  };
}

export default function PromotionReportPage({ embedded = false, campaignId: suppliedCampaignId }) {
  const navigate = useNavigate();
  const params = useParams();
  const campaignId = suppliedCampaignId || params.campaignId;
  const api = usePosApi();
  const { shop, isGuest } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.pricing(shop?.id, { promotionReport: campaignId }),
    queryFn: () => api.pricing.promotionReport(campaignId),
    enabled: Boolean(shop?.id && campaignId) && !isGuest,
  });

  return <Box sx={{ minHeight: embedded ? "auto" : "100dvh", bgcolor: "#f7faff", fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif" }}>
    {!embedded && <MobileHeader campaignName={data?.campaign?.name || "Promotion"} onBack={() => navigate("/price?tab=promotion")} />}
    <Box sx={{ p: embedded ? { xs: 2, md: 2.5 } : { xs: 1.5, sm: 2.5 }, maxWidth: embedded ? "none" : 1080, mx: "auto" }}>
      {isLoading && <Box sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{error.message || "Promotion report could not be loaded."}</Alert>}
      {data && <ReportContent key={data.campaign.id} report={data} desktop={embedded} />}
    </Box>
  </Box>;
}

function MobileHeader({ campaignName, onBack }) {
  return <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#1685e5" }}>
    <Toolbar sx={{ minHeight: { xs: 60, sm: 68 }, px: { xs: .75, sm: 2 }, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: .5 }}>
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center" }}>
        <IconButton aria-label="Back to promotions" onClick={onBack} sx={{ color: "common.white", flexShrink: 0 }}><ArrowBackRoundedIcon /></IconButton>
        <Typography noWrap sx={{ fontSize: { xs: 14, sm: 17 }, fontWeight: 500 }}>{campaignName}</Typography>
      </Box>
      <Typography noWrap align="center" sx={{ fontSize: { xs: 16, sm: 20 }, fontWeight: 500 }}>Promotion Report</Typography>
      <Box />
    </Toolbar>
  </AppBar>;
}

function ReportContent({ report, desktop }) {
  const campaignFrom = dateKey(report.campaign.startsAt);
  const campaignTo = dateKey(report.campaign.endsAt);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(campaignFrom);
  const [to, setTo] = useState(campaignTo);
  const [draftFrom, setDraftFrom] = useState(campaignFrom);
  const [draftTo, setDraftTo] = useState(campaignTo);
  const [dateAnchor, setDateAnchor] = useState(null);

  const ranged = useMemo(() => reportForRange(report, from || campaignFrom, to || campaignTo), [report, from, to, campaignFrom, campaignTo]);
  const normalizedSearch = search.trim().toLowerCase();
  const products = ranged.products.filter((product) => product.quantitySold > 0 && (!normalizedSearch || [product.productName, product.sku, ...(product.barcodes || [])]
    .some((value) => String(value || "").toLowerCase().includes(normalizedSearch))));
  const openDatePicker = (event) => {
    setDraftFrom(from || campaignFrom); setDraftTo(to || campaignTo); setDateAnchor(event.currentTarget);
  };
  const applyDates = () => {
    setFrom(draftFrom || campaignFrom); setTo(draftTo || campaignTo); setDateAnchor(null);
  };

  return <>
    {desktop && <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", mb: 2.25 }}>
      <Typography noWrap sx={{ fontSize: 18, fontWeight: 500 }}>{report.campaign.name}</Typography>
      <Typography sx={{ fontSize: 21, fontWeight: 500 }}>Promotion Report</Typography><Box />
    </Box>}
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: { xs: .75, sm: 1.25 } }}>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name, SKU, or barcode..." size="small"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }}
        sx={{ "& .MuiOutlinedInput-root": { minHeight: 52, bgcolor: "common.white", borderRadius: 1.5 } }} />
      <Button variant="outlined" onClick={openDatePicker} startIcon={<CalendarMonthOutlinedIcon />} endIcon={<KeyboardArrowDownRoundedIcon />}
        sx={{ minWidth: { xs: 126, sm: 170 }, px: { xs: 1, sm: 1.5 }, minHeight: 52, justifyContent: "space-between", bgcolor: "common.white", color: "text.primary", borderColor: "divider", borderRadius: 1.5, textTransform: "none", fontSize: { xs: 12, sm: 14 }, fontWeight: 400, whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: { xs: .5, sm: 1 } }, "& .MuiButton-endIcon": { ml: { xs: .25, sm: 1 } } }}>
        Date and time
      </Button>
    </Box>
    <Popover open={Boolean(dateAnchor)} anchorEl={dateAnchor} onClose={() => setDateAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { width: "calc(100vw - 24px)", maxWidth: 390, p: 2, mt: .5, borderRadius: 2 } } }}>
      <Typography sx={{ mb: 1.5, fontSize: 16, fontWeight: 500 }}>Date and time</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25 }}>
        <TextField type="date" label="From" size="small" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" label="To" size="small" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      {draftFrom && draftTo && draftFrom > draftTo && <Alert severity="warning" sx={{ mt: 1.25 }}>From date must be before the To date.</Alert>}
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
        <Button onClick={() => { setDraftFrom(campaignFrom); setDraftTo(campaignTo); }}>Reset</Button>
        <Button variant="contained" disabled={Boolean(draftFrom && draftTo && draftFrom > draftTo)} onClick={applyDates}>Apply</Button>
      </Stack>
    </Popover>
    <SummaryGrid summary={ranged.summary} />
    <Box sx={{ mt: { xs: 3, sm: 3.5 }, mb: 1.5 }}>
      <Typography sx={{ fontSize: { xs: 19, sm: 21 }, fontWeight: 600 }}>Product Performance</Typography>
    </Box>
    {!products.length ? <Paper variant="outlined" sx={{ p: 4, borderRadius: 2, textAlign: "center", color: "text.secondary" }}>{normalizedSearch ? "No products match this search." : "No sale records for this promotion."}</Paper>
      : desktop ? <DesktopProductTable products={products} />
        : <Stack spacing={1.25}>{products.map((product) => <MobileProductCard key={product.productId} product={product} />)}</Stack>}
  </>;
}

function SummaryGrid({ summary }) {
  return <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" }, gap: { xs: 1, sm: 1.25 } }}>
    <SummaryCard label="Orders" value={summary.orderCount} />
    <SummaryCard label="Qty Sold" value={quantity(summary.quantitySold)} />
    <SummaryCard label="Products Sold" value={summary.productCount} />
    <SummaryCard label="Sales Amount" value={money(summary.netSales)} />
    <SummaryCard label="Promotion Discount" value={money(summary.promotionDiscount)} />
    <SummaryCard label={<>Gross Profit <Box component="span" sx={{ color: "success.main" }}>({summary.marginPercent}%)</Box></>} value={money(summary.grossProfit)} />
  </Box>;
}

function SummaryCard({ label, value }) {
  return <Paper elevation={0} sx={{ minWidth: 0, minHeight: { xs: 88, sm: 104 }, p: { xs: 1.4, sm: 1.75 }, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "common.white", boxShadow: "0 2px 7px rgba(15, 23, 42, .05)" }}>
    <Typography sx={{ fontSize: { xs: 12.5, sm: 14 }, fontWeight: 400 }}>{label}</Typography>
    <Typography sx={{ mt: .65, fontSize: { xs: 18, sm: 24 }, lineHeight: 1.2, fontWeight: 500, overflowWrap: "anywhere" }}>{value}</Typography>
  </Paper>;
}

function MobileProductCard({ product }) {
  return <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "common.white", boxShadow: "0 2px 8px rgba(15, 23, 42, .06)" }}>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: { xs: 1.25, sm: 2 }, rowGap: 1 }}>
      <ReportMetric label="Product name" value={product.productName} emphasized />
      <ReportMetric label="Sold" value={quantity(product.quantitySold)} emphasized divided />
      <ReportMetric label="Sale" value={money(product.netSales)} emphasized />
      <ReportMetric label="Discount" value={money(product.promotionDiscount)} emphasized divided />
      <ReportMetric label="Cost" value={money(product.costOfGoods)} emphasized />
      <ReportMetric label={<>Profit <Box component="span" sx={{ color: "success.main" }}>{product.marginPercent}%</Box></>} value={money(product.grossProfit)} emphasized divided />
    </Box>
  </Paper>;
}

function ReportMetric({ label, value, sx, emphasized = false, divided = false, valueColor = "text.primary" }) {
  return <Box sx={{ minWidth: 0, pl: divided ? { xs: 1.25, sm: 2 } : 0, borderLeft: divided ? "1px solid" : 0, borderColor: "divider", ...sx }}><Typography color="text.secondary" sx={{ fontSize: 11.5, fontWeight: 400 }}>{label}</Typography><Typography color={valueColor} sx={{ mt: .25, fontSize: emphasized ? 15 : 14, lineHeight: 1.3, fontWeight: emphasized ? 600 : 400, overflowWrap: "anywhere" }}>{value}</Typography></Box>;
}

function DesktopProductTable({ products }) {
  const headers = ["Product name", "Sold", "Sale", "Discount", "Cost", "Profit"];
  return <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, bgcolor: "common.white" }}><Table size="small" sx={{ minWidth: 880 }}>
    <TableHead><TableRow sx={{ bgcolor: "#f7f8fa" }}>{headers.map((label) => <TableCell key={label} align="left" sx={{ py: 1.4, fontWeight: 500, whiteSpace: "nowrap" }}>{label}</TableCell>)}</TableRow></TableHead>
    <TableBody>{products.map((product) => <TableRow key={product.productId} hover>
      <TableCell sx={{ py: 1.35 }}><Typography sx={{ fontSize: 14, fontWeight: 500 }}>{product.productName}</Typography>{product.sku && <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>SKU: {product.sku}</Typography>}</TableCell>
      <TableCell align="left">{quantity(product.quantitySold)}</TableCell><TableCell align="left">{money(product.netSales)}</TableCell><TableCell align="left">{money(product.promotionDiscount)}</TableCell><TableCell align="left">{money(product.costOfGoods)}</TableCell><TableCell align="left" sx={{ color: product.grossProfit < 0 ? "error.main" : "success.main" }}>{money(product.grossProfit)} ({product.marginPercent}%)</TableCell>
    </TableRow>)}</TableBody>
  </Table></TableContainer>;
}
