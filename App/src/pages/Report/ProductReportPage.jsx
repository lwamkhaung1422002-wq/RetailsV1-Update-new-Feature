import { useMemo, useState } from "react";
import { Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, MenuItem, Popover, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useNavigate } from "react-router";
import { useCategoriesQuery, useProductReportQuery } from "../../hooks/usePosQueries";
import { useAppPreferences } from "../../context/AppPreferenceContext";

const tabs = ["Overview", "Top Seller", "Slow Seller", "No Sale", "Low Stock", "Out of Stock"];
const reports = {
  top: { title: "Top Selling Products", columns: ["#", "Product", "Qty Sold", "Revenue (MMK)"], rows: [["Jasmine Perfume", "28", "98,000 ကျပ်"], ["Nivea Roll On", "19", "123,500 ကျပ်"], ["Coca-Cola 330ml", "16", "16,000 ကျပ်"], ["Oishi Green Tea", "13", "23,400 ကျပ်"], ["Royal-D 500ml", "11", "16,500 ကျပ်"]] },
  slow: { title: "Slow Selling Products", columns: ["#", "Product", "Last Sold", "Qty In Stock"], rows: [["Cellox Facial Tissue", "45 days ago", "45"], ["Dettol Soap 125g", "38 days ago", "32"], ["Lux Body Wash 250ml", "30 days ago", "28"], ["Oreo Biscuit 137g", "28 days ago", "18"], ["Lay's Potato Chips", "25 days ago", "22"]] },
  noSale: { title: "No Sale Products", columns: ["#", "Product", "Qty In Stock", "Stock Value"], rows: [] },
  low: { title: "Low Stock Products", columns: ["#", "Product", "Qty In Stock", "Reorder Level"], rows: [["Oishi Green Tea", "4", "10"], ["Jasmine Perfume", "5", "10"], ["Nivea Roll On", "7", "12"], ["Royal-D 500ml", "9", "15"], ["Dettol Soap 125g", "9", "15"]] },
  out: { title: "Out of Stock Products", columns: ["#", "Product", "Last Sold", "Status"], rows: [["Fresh Milk 1L", "3 days ago", "Out of Stock"], ["Yogurt 500ml", "5 days ago", "Out of Stock"], ["Chicken Breast", "6 days ago", "Out of Stock"], ["Cheese 200g", "7 days ago", "Out of Stock"], ["Sausage 500g", "8 days ago", "Out of Stock"]] },
};

const productCategories = {
  "Jasmine Perfume": "Beauty", "Nivea Roll On": "Beauty", "Coca-Cola 330ml": "Drinks", "Oishi Green Tea": "Drinks", "Royal-D 500ml": "Drinks",
  "Cellox Facial Tissue": "Household", "Dettol Soap 125g": "Household", "Lux Body Wash 250ml": "Beauty", "Oreo Biscuit 137g": "Food", "Lay's Potato Chips": "Food",
  "Fresh Milk 1L": "Food", "Yogurt 500ml": "Food", "Chicken Breast": "Food", "Cheese 200g": "Food", "Sausage 500g": "Food",
};

const currency = "\u1000\u103b\u1015\u103a";
const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ${currency}`;
const percent = (value) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value ?? 0))}%`;
function yangonDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function lastThirtyDaysStart() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return yangonDateKey(date);
}

function formatReportDate(value) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Yangon", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00+06:30`));
}

function productReportRangeLabel(range, from, to) {
  const today = yangonDateKey();
  const dates = range === "30days"
    ? { from: lastThirtyDaysStart(), to: today }
    : range === "today"
      ? { from: today, to: today }
      : { from, to };
  return dates.from && dates.to ? `${formatReportDate(dates.from)} – ${formatReportDate(dates.to)}` : "Select date range";
}

const detailedReports = {
  top: [
    { product: "Jasmine Perfume", qtySold: 28, costPrice: 2500, sellingPrice: 3500, revenue: 98000, margin: 28.6, grossProfit: 28000 },
    { product: "Nivea Roll On", qtySold: 19, costPrice: 4500, sellingPrice: 6500, revenue: 123500, margin: 30.8, grossProfit: 38000 },
    { product: "Coca-Cola 330ml", qtySold: 16, costPrice: 700, sellingPrice: 1000, revenue: 16000, margin: 30, grossProfit: 4800 },
    { product: "Oishi Green Tea", qtySold: 13, costPrice: 1200, sellingPrice: 1800, revenue: 23400, margin: 33.3, grossProfit: 7800 },
    { product: "Royal-D 500ml", qtySold: 11, costPrice: 1000, sellingPrice: 1500, revenue: 16500, margin: 33.3, grossProfit: 5500 },
  ],
  slow: [
    { product: "Cellox Facial Tissue", lastSold: "45 days ago", qtySold: 2, qtyInStock: 45, costPrice: 850, sellingPrice: 1200, margin: 29.2, stockValue: 38250, grossProfit: 700 },
    { product: "Dettol Soap 125g", lastSold: "38 days ago", qtySold: 3, qtyInStock: 32, costPrice: 1250, sellingPrice: 1800, margin: 30.6, stockValue: 40000, grossProfit: 1650 },
    { product: "Lux Body Wash 250ml", lastSold: "30 days ago", qtySold: 4, qtyInStock: 28, costPrice: 3200, sellingPrice: 4500, margin: 28.9, stockValue: 89600, grossProfit: 5200 },
    { product: "Oreo Biscuit 137g", lastSold: "28 days ago", qtySold: 5, qtyInStock: 18, costPrice: 900, sellingPrice: 1300, margin: 30.8, stockValue: 16200, grossProfit: 2000 },
    { product: "Lay's Potato Chips", lastSold: "25 days ago", qtySold: 5, qtyInStock: 22, costPrice: 1100, sellingPrice: 1600, margin: 31.3, stockValue: 24200, grossProfit: 2500 },
  ],
  low: [
    { product: "Oishi Green Tea", qtyInStock: 4, reorderLevel: 10, demand: "Top Seller", dailySales: 1.9, priority: "Urgent reorder" },
    { product: "Jasmine Perfume", qtyInStock: 5, reorderLevel: 10, demand: "Top Seller", dailySales: 1.2, priority: "Urgent reorder" },
    { product: "Nivea Roll On", qtyInStock: 7, reorderLevel: 12, demand: "Top Seller", dailySales: 0.9, priority: "Reorder soon" },
    { product: "Royal-D 500ml", qtyInStock: 9, reorderLevel: 15, demand: "Top Seller", dailySales: 0.7, priority: "Reorder soon" },
    { product: "Dettol Soap 125g", qtyInStock: 9, reorderLevel: 15, demand: "Slow Seller", dailySales: 0.1, priority: "Review first" },
  ],
  out: [
    { product: "Fresh Milk 1L", lastSold: "3 days ago", outSince: "2 days ago", demand: "Top Seller", dailySales: 2.4, reorder: 24, priority: "Urgent reorder" },
    { product: "Yogurt 500ml", lastSold: "5 days ago", outSince: "4 days ago", demand: "Top Seller", dailySales: 1.6, reorder: 16, priority: "Urgent reorder" },
    { product: "Chicken Breast", lastSold: "6 days ago", outSince: "5 days ago", demand: "Slow Seller", dailySales: 0.2, reorder: 4, priority: "Review first" },
    { product: "Cheese 200g", lastSold: "7 days ago", outSince: "6 days ago", demand: "Slow Seller", dailySales: 0.2, reorder: 4, priority: "Review first" },
    { product: "Sausage 500g", lastSold: "8 days ago", outSince: "7 days ago", demand: "No sales", dailySales: 0, reorder: 0, priority: "Do not reorder" },
  ],
};

// Kept as presentation fallbacks for the existing table shape; live API rows
// replace them whenever the authenticated report is loaded.
void productCategories;
void detailedReports;

export default function ProductReportPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { t } = useAppPreferences();
  const [tab, setTab] = useState("Overview");
  const [dateAnchor, setDateAnchor] = useState(null);
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [dateRange, setDateRange] = useState("30days");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("All categories");
  const [search, setSearch] = useState("");
  const reportQuery = useMemo(() => {
    const today = yangonDateKey();
    const range = dateRange === "30days" ? { from: lastThirtyDaysStart(), to: today } : dateRange === "today" ? { from: today, to: today } : { from, to };
    return { ...range, ...((!isMobile || tab !== "Overview") && search ? { search } : {}), ...(category !== "All categories" ? { categoryId: category } : {}) };
  }, [category, dateRange, from, isMobile, search, tab, to]);
  const { data: reportResult } = useProductReportQuery(reportQuery);
  const { data: categoryResult } = useCategoriesQuery();
  const categories = useMemo(() => [{ id: "All categories", name: "All categories" }, ...(categoryResult?.categories || [])], [categoryResult]);
  const reportData = useMemo(() => reportResult || { summary: { totalProducts: 0, totalQuantity: 0, lowStockCount: 0, outOfStockCount: 0 }, products: [], topSellers: [], slowSellers: [], noSales: [] }, [reportResult]);
  const dateRangeLabel = productReportRangeLabel(dateRange, from, to);
  const visible = useMemo(() => tab === "Overview" ? ["top", "slow", "low", "out"] : ({ "Top Seller": ["top"], "Slow Seller": ["slow"], "No Sale": ["noSale"], "Low Stock": ["low"], "Out of Stock": ["out"] }[tab] ?? ["top"]), [tab]);
  const realRows = useMemo(() => ({ top: reportData.topSellers.map((row) => [row.name, String(row.soldQuantity), money(row.salesAmount)]), slow: reportData.slowSellers.map((row) => [row.name, "—", String(row.currentStock)]), noSale: reportData.noSales.map((row) => [row.name, String(row.currentStock), money(row.stockValue)]), low: reportData.products.filter((row) => row.status === "LOW_STOCK").map((row) => [row.name, String(row.currentStock), String(row.minimumStock)]), out: reportData.products.filter((row) => row.status === "OUT_OF_STOCK").map((row) => [row.name, "—", "Out of Stock"]) }), [reportData]);
  const visibleReports = useMemo(() => visible.map((key) => ({ key, ...reports[key], rows: realRows[key] })), [realRows, visible]);
  const detailKey = tab === "Top Seller" ? "top" : tab === "Slow Seller" ? "slow" : tab === "No Sale" ? "noSale" : tab === "Low Stock" ? "low" : tab === "Out of Stock" ? "out" : null;
  const detailRows = useMemo(() => { const rows = detailKey === "top" ? reportData.topSellers : detailKey === "slow" ? reportData.slowSellers : detailKey === "noSale" ? reportData.noSales : reportData.products.filter((row) => row.status === (detailKey === "low" ? "LOW_STOCK" : "OUT_OF_STOCK")); return rows.map((row) => ({ product: row.name, qtySold: row.soldQuantity || 0, qtyInStock: row.currentStock, costPrice: row.averageCost, sellingPrice: row.sellingPrice, revenue: row.salesAmount || 0, margin: row.sellingPrice ? ((row.sellingPrice - row.averageCost) / row.sellingPrice) * 100 : 0, stockValue: row.stockValue, reorderLevel: row.minimumStock, demand: "—", priority: row.status === "OUT_OF_STOCK" ? "Urgent reorder" : "Reorder soon", lastSold: "—", outSince: "—", dailySales: 0, grossProfit: 0 })); }, [detailKey, reportData]);

  if (isMobile) return <MobileProductReport tab={tab} setTab={setTab} visibleReports={visibleReports} detailKey={detailKey} detailRows={detailRows} summary={reportData.summary} products={reportData.products} navigate={navigate} filterAnchor={filterAnchor} setFilterAnchor={setFilterAnchor} dateRange={dateRange} setDateRange={setDateRange} from={from} setFrom={setFrom} to={to} setTo={setTo} category={category} setCategory={setCategory} search={search} setSearch={setSearch} t={t} />;

  return <Box sx={{ width: "100%", maxWidth: "none", mx: 0, py: 1 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
      <Stack direction="row" spacing={0.5} sx={{ minWidth: 0 }}>
        {tabs.map((item) => <Button key={item} variant={tab === item ? "contained" : "text"} onClick={() => setTab(item)} sx={{ minHeight: 40, px: 1.5, borderRadius: 1.5, textTransform: "none", color: tab === item ? "common.white" : "text.primary", whiteSpace: "nowrap", fontSize: 14, fontWeight: tab === item ? 600 : 500 }}>{t(item)}</Button>)}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: "auto", flexShrink: 0 }}>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search products")} size="small" sx={{ width: 220, "& .MuiOutlinedInput-root": { minHeight: 42, fontSize: 14 } }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category" sx={{ width: 185, "& .MuiOutlinedInput-root": { minHeight: 42, fontSize: 14 } }}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.id === "All categories" ? t(item.name) : item.name}</MenuItem>)}</TextField>
        <Button aria-label={`Choose date range: ${dateRangeLabel}`} variant="outlined" startIcon={<CalendarMonthRoundedIcon />} onClick={(event) => setDateAnchor(event.currentTarget)} sx={toolbarButtonSx}>{dateRangeLabel}</Button>
      </Stack>
    </Box>

    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 2, mb: 2.5 }}>
      <SummaryCard label={t("Total Products")} value={String(reportData.summary.totalProducts)} helper={t("Active Products")} />
      <SummaryCard label={t("Total Quantity")} value={String(reportData.summary.totalQuantity)} helper={t("In Stock")} />
      <SummaryCard label={t("Low Stock Items")} value={String(reportData.summary.lowStockCount)} helper={t("Need Attention")} />
      <SummaryCard label={t("Out of Stock Items")} value={String(reportData.summary.outOfStockCount)} helper={t("Currently Out")} />
    </Box>

    {detailKey ? <DetailedReportTable kind={detailKey} rows={detailRows} t={t} /> : <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 2.25 }}>{visibleReports.map(({ key, ...report }) => <ReportTable key={key} kind={key} {...report} t={t} onViewAll={() => setTab({ top: "Top Seller", slow: "Slow Seller", low: "Low Stock", out: "Out of Stock" }[key])} />)}</Box>}
    {tab === "Overview" && <InventoryStatusCard products={reportData.products} t={t} />}

    <Popover open={Boolean(dateAnchor)} anchorEl={dateAnchor} onClose={() => setDateAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { width: 370, p: 2, borderRadius: 2 } } }}>
      <Typography sx={{ fontSize: 17, fontWeight: 600, mb: 1.5 }}>{t("Date and time")}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>{["30days", "today", "custom"].map((range) => <Button key={range} variant="outlined" onClick={() => setDateRange(range)} sx={{ minHeight: 42, borderColor: dateRange === range ? "primary.main" : "divider", bgcolor: dateRange === range ? "#eaf3ff" : "transparent", color: dateRange === range ? "primary.main" : "text.primary", textTransform: "uppercase", fontSize: 12 }}>{t(range === "30days" ? "30 days" : range)}</Button>)}</Box>
      {dateRange === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.5 }}><TextField type="date" label={t("From")} size="small" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField type="date" label={t("To")} size="small" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box>}
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1.5 }}><Button onClick={() => { setDateRange("30days"); setFrom(""); setTo(""); }} sx={{ textTransform: "uppercase" }}>{t("Reset")}</Button><Button variant="contained" onClick={() => setDateAnchor(null)} sx={{ textTransform: "uppercase" }}>{t("Apply")}</Button></Stack>
    </Popover>
  </Box>;
}

function MobileProductReport({ tab, setTab, visibleReports, detailKey, detailRows, summary, products, navigate, filterAnchor, setFilterAnchor, dateRange, setDateRange, from, setFrom, to, setTo, category, setCategory, search, setSearch, t }) {
  const isOverview = tab === "Overview";
  return <Box sx={{ pb: 3 }}><Box sx={{ height: 62, px: 1, display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) 40px", alignItems: "center", bgcolor: "#1976d2", color: "common.white" }}><IconButton aria-label="Back to settings" onClick={() => navigate("/settings")} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton><Typography noWrap align="center" sx={{ px: .5, fontSize: 17, fontWeight: 700 }}>{t("Product Report")}</Typography><MobileProductFilter anchor={filterAnchor} onOpen={(event) => setFilterAnchor(event.currentTarget)} onClose={() => setFilterAnchor(null)} dateRange={dateRange} setDateRange={setDateRange} from={from} setFrom={setFrom} to={to} setTo={setTo} category={category} setCategory={setCategory} t={t} /></Box><Box sx={{ px: 1.5, pt: 1.5 }}><Stack direction="row" spacing={.5} sx={{ overflowX: "auto", pb: .5, "&::-webkit-scrollbar": { display: "none" } }}>{tabs.map((item) => <Button key={item} variant={tab === item ? "contained" : "outlined"} onClick={() => setTab(item)} sx={{ flexShrink: 0, minHeight: 34, px: 1.1, border: "1px solid #111827", borderRadius: 1, textTransform: "none", color: tab === item ? "common.white" : "text.primary", fontSize: 11.5, fontWeight: tab === item ? 600 : 500, whiteSpace: "nowrap", "&:hover": { borderColor: "#111827" } }}>{t(item)}</Button>)}</Stack>{!isOverview && <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search products")} size="small" sx={{ mt: 1, "& .MuiOutlinedInput-root": { minHeight: 42, fontSize: 14 } }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} />}{isOverview ? <><Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mt: 1.25 }}><MobileProductStat label={t("Total Products")} value={String(summary.totalProducts)} /><MobileProductStat label={t("Total Quantity")} value={String(summary.totalQuantity)} /><MobileProductStat label={t("Low Stock Items")} value={String(summary.lowStockCount)} /><MobileProductStat label={t("Out of Stock")} value={String(summary.outOfStockCount)} /></Box><Stack spacing={1.25} sx={{ mt: 1.25 }}>{visibleReports.map(({ key, ...report }) => <MobileProductTable key={key} {...report} t={t} onViewAll={() => setTab({ top: "Top Seller", slow: "Slow Seller", low: "Low Stock", out: "Out of Stock" }[key])} />)}</Stack><MobileInventoryStatus products={products} t={t} /></> : <Box sx={{ mt: 1.25 }}><MobileDetailedProductReport kind={detailKey} rows={detailRows} t={t} /></Box>}</Box></Box>;
}

function MobileProductFilter({ anchor, onOpen, onClose, dateRange, setDateRange, from, setFrom, to, setTo, category, setCategory, t }) {
  const { data: categoryResult } = useCategoriesQuery();
  const categories = [{ id: "All categories", name: "All categories" }, ...(categoryResult?.categories || [])];
  return <><IconButton aria-label="Filter product reports" onClick={onOpen} sx={{ color: "inherit" }}><FilterAltRoundedIcon /></IconButton><Popover open={Boolean(anchor)} anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { width: "calc(100vw - 28px)", maxWidth: 420, p: 2, borderRadius: 2 } } }}><Typography sx={{ fontSize: 18, lineHeight: 1.3, fontWeight: 600 }}>{t("Filters")}</Typography><Typography color="text.secondary" sx={{ mt: 1.75, mb: .8, fontSize: 12.5, lineHeight: 1.25, fontWeight: 600 }}>{t("DATE AND TIME")}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: .75 }}>{["30days", "today", "custom"].map((range) => <Button key={range} variant="outlined" onClick={() => setDateRange(range)} sx={{ minWidth: 0, minHeight: 40, px: .5, borderColor: dateRange === range ? "primary.main" : "divider", bgcolor: dateRange === range ? "#eaf3ff" : "transparent", color: dateRange === range ? "primary.main" : "text.primary", textTransform: "uppercase", fontSize: 11.5, fontWeight: dateRange === range ? 600 : 500 }}>{t(range === "30days" ? "30 days" : range)}</Button>)}</Box>{dateRange === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.25 }}><TextField type="date" label={t("From")} size="small" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField type="date" label={t("To")} size="small" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box>}<Typography color="text.secondary" sx={{ mt: 2, mb: .8, fontSize: 12.5, lineHeight: 1.25, fontWeight: 600 }}>{t("CATEGORY")}</Typography><TextField select fullWidth size="small" value={category} onChange={(event) => setCategory(event.target.value)} sx={{ "& .MuiOutlinedInput-root": { minHeight: 42, fontSize: 14 } }}>{categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.id === "All categories" ? t(item.name) : item.name}</MenuItem>)}</TextField><Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}><Button onClick={() => { setDateRange("30days"); setFrom(""); setTo(""); setCategory("All categories"); }} sx={{ minHeight: 40, textTransform: "uppercase", fontSize: 12.5, fontWeight: 500 }}>{t("Reset")}</Button><Button variant="contained" onClick={onClose} sx={{ minHeight: 40, textTransform: "uppercase", fontSize: 12.5, fontWeight: 600 }}>{t("Apply")}</Button></Stack></Popover></>;
}

function MobileDetailedProductReport({ kind, rows, t }) {
  const config = {
    top: { title: "Top Selling Products", fields: [["Qty Sold", (row) => `${row.qtySold} pcs`], ["Cost Price", (row) => money(row.costPrice)], ["Selling Price", (row) => money(row.sellingPrice)], ["Margin", (row) => percent(row.margin)], ["Revenue", (row) => money(row.revenue)], ["Gross Profit", (row) => money(row.grossProfit)]] },
    slow: { title: "Slow Selling Products", fields: [["Last Sold", (row) => row.lastSold], ["Qty Sold", (row) => `${row.qtySold} pcs`], ["In Stock", (row) => `${row.qtyInStock} pcs`], ["Cost Price", (row) => money(row.costPrice)], ["Selling Price", (row) => money(row.sellingPrice)], ["Margin", (row) => percent(row.margin)], ["Stock Value", (row) => money(row.stockValue)], ["Gross Profit", (row) => money(row.grossProfit)]] },
    noSale: { title: "No Sale Products", fields: [["In Stock", (row) => `${row.qtyInStock} pcs`], ["Cost Price", (row) => money(row.costPrice)], ["Selling Price", (row) => money(row.sellingPrice)], ["Stock Value", (row) => money(row.stockValue)]] },
    low: { title: "Low Stock Products", fields: [["In Stock", (row) => `${row.qtyInStock} pcs`], ["Reorder Level", (row) => `${row.reorderLevel} pcs`], ["Demand Status", (row) => row.demand], ["Avg. Daily Sales", (row) => `${row.dailySales} pcs/day`], ["Reorder Priority", (row) => row.priority]] },
    out: { title: "Out of Stock Products", fields: [["Last Sold", (row) => row.lastSold], ["Out of Stock Since", (row) => row.outSince], ["Demand Status", (row) => row.demand], ["Avg. Daily Sales", (row) => `${row.dailySales} pcs/day`], ["Suggested Reorder", (row) => `${row.reorder} pcs`], ["Reorder Priority", (row) => row.priority]] },
  }[kind];
  return <><Typography sx={{ mb: 1, fontSize: 17, fontWeight: 600 }}>{t(config.title)}</Typography><Stack spacing={1}>{rows.map((row, index) => <Card key={row.product} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Box sx={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: .75, alignItems: "center", pb: 1.1, borderBottom: "1px solid", borderColor: "divider" }}><Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 500 }}>{index + 1}</Typography><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{row.product}</Typography></Box><Stack spacing={.8} sx={{ pt: 1.1 }}>{config.fields.map(([label, value]) => <Box key={label} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography color="text.secondary" sx={{ fontSize: 12.5, fontWeight: 400 }}>{t(label)}</Typography><MobileDetailValue label={label} value={value(row)} t={t} /></Box>)}</Stack></CardContent></Card>)}</Stack>{!rows.length && <Typography align="center" color="text.secondary" sx={{ py: 4 }}>{t("No products match this report.")}</Typography>}</>;
}

function MobileDetailValue({ label, value, t }) {
  if (label === "Demand Status") return <DemandChip label={t(value)} toneKey={value} />;
  if (label === "Reorder Priority") return <PriorityChip label={t(value)} toneKey={value} />;
  return <Typography sx={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{value}</Typography>;
}

function MobileProductStat({ label, value }) { return <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 1.35, "&:last-child": { pb: 1.35 } }}><Box sx={{ minHeight: 42, display: "flex", flexDirection: "column", justifyContent: "center" }}><Typography color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.25, fontWeight: 500 }}>{label}</Typography><Typography sx={{ mt: .55, fontSize: 21, lineHeight: 1.15, fontWeight: 700 }}>{value}</Typography></Box></CardContent></Card>; }

function MobileProductTable({ title, columns, rows, onViewAll, t }) { return <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 1 }}><Typography sx={{ fontSize: 15.5, lineHeight: 1.3, fontWeight: 500 }}>{t(title)}</Typography><Button size="small" onClick={onViewAll} sx={{ minWidth: 0, px: .5, textTransform: "none", fontSize: 11, fontWeight: 500 }}>{t("View all")}</Button></Box><Stack spacing={.65}>{rows.map((row, index) => <Box key={row[0]} sx={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr) auto", alignItems: "center", gap: .6, py: .85, borderTop: index ? "1px solid" : 0, borderColor: "divider" }}><Typography color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.25, fontWeight: 400 }}>{index + 1}</Typography><Box><Typography noWrap sx={{ fontSize: 12.5, lineHeight: 1.3, fontWeight: 500 }}>{row[0]}</Typography><Typography color="text.secondary" sx={{ mt: .25, fontSize: 11.5, lineHeight: 1.3, fontWeight: 400 }}>{t(columns[2])}: {row[1]}</Typography></Box><Typography noWrap sx={{ fontSize: 11.5, lineHeight: 1.3, fontWeight: 500, textAlign: "right" }}>{row[2]}</Typography></Box>)}</Stack></CardContent></Card>; }

function inventoryStatusData(products = []) {
  const definitions = [
    ["IN_STOCK", "In Stock", "#50b982"],
    ["LOW_STOCK", "Low Stock", "#f6b55c"],
    ["OUT_OF_STOCK", "Out of Stock", "#ef6767"],
  ];
  const totalQuantity = products.reduce((sum, product) => sum + Number(product.currentStock || 0), 0);
  let cursor = 0;
  const rows = definitions.map(([status, label, color]) => {
    const matching = products.filter((product) => product.status === status);
    const quantity = matching.reduce((sum, product) => sum + Number(product.currentStock || 0), 0);
    const numericPercentage = totalQuantity > 0 ? (quantity / totalQuantity) * 100 : 0;
    const start = cursor;
    cursor += numericPercentage;
    return [label, String(matching.length), String(quantity), `${numericPercentage.toFixed(1)}%`, color, start, cursor];
  });
  const background = totalQuantity > 0
    ? `conic-gradient(${rows.map(([, , , , color, start, end]) => `${color} ${start}% ${end}%`).join(", ")})`
    : "#e5e7eb";
  return { rows, totalItems: products.length, totalQuantity, background };
}

function MobileInventoryStatus({ products, t }) {
  const { rows, totalItems, totalQuantity, background } = inventoryStatusData(products);
  return <Card sx={{ mt: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Typography sx={{ fontSize: 17, fontWeight: 600 }}>{t("Inventory Summary by Status")}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "118px minmax(0, 1fr)", alignItems: "center", gap: 1.25, mt: 1.25 }}><Box sx={{ position: "relative", width: 110, height: 110, borderRadius: "50%", background, "&::after": { content: '""', position: "absolute", inset: 18, borderRadius: "50%", bgcolor: "background.paper" } }}><Box sx={{ position: "absolute", inset: 0, zIndex: 1, display: "grid", placeItems: "center", textAlign: "center" }}><Box><Typography sx={{ fontSize: 20, fontWeight: 700 }}>{totalQuantity}</Typography><Typography color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 400 }}>{t("Total Quantity")}</Typography></Box></Box></Box><Stack spacing={.8}>{rows.map(([label, , quantity, percentage, color]) => <Box key={label}><Box sx={{ display: "flex", alignItems: "center", gap: .6 }}><Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: color }} /><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{t(label)}</Typography></Box><Typography color="text.secondary" sx={{ ml: 1.9, fontSize: 12, fontWeight: 400 }}>{quantity} pcs · {percentage}</Typography></Box>)}</Stack></Box><Box sx={{ mt: 1.4, border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>{rows.map(([label, items, quantity, percentage], index) => <Box key={label} sx={{ display: "grid", gridTemplateColumns: "minmax(88px, 1.15fr) repeat(3, minmax(42px, .7fr))", gap: .2, px: .7, minHeight: 36, alignItems: "center", borderTop: index ? "1px solid" : 0, borderColor: "divider" }}><Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t(label)}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 500 }}>{items}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 500 }}>{quantity}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 500 }}>{percentage}</Typography></Box>)}<Box sx={{ display: "grid", gridTemplateColumns: "minmax(88px, 1.15fr) repeat(3, minmax(42px, .7fr))", gap: .2, px: .7, minHeight: 36, alignItems: "center", borderTop: "1px solid", borderColor: "divider", bgcolor: "#f7f9fc" }}><Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t("Total")}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 600 }}>{totalItems}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 600 }}>{totalQuantity}</Typography><Typography sx={{ fontSize: 12.5, textAlign: "right", fontWeight: 600 }}>{totalQuantity > 0 ? "100%" : "0%"}</Typography></Box></Box></CardContent></Card>;
}

function SummaryCard({ label, value, helper }) {
  return <Card sx={{ minWidth: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 9px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography color="text.secondary" sx={{ fontSize: 13.5, lineHeight: 1.3, fontWeight: 500 }}>{label}</Typography><Typography sx={{ mt: 0.55, fontSize: 25, lineHeight: 1.15, fontWeight: 700 }}>{value}</Typography><Typography color="text.secondary" sx={{ mt: 0.65, fontSize: 12.5, fontWeight: 400 }}>{helper}</Typography></CardContent></Card>;
}

function ReportTable({ title, columns, rows, kind, onViewAll, t }) {
  const grid = kind === "top" ? "48px minmax(220px, 1fr) 130px 180px" : kind === "out" ? "48px minmax(220px, 1fr) 160px 140px" : "48px minmax(220px, 1fr) 150px 150px";
  return <Card sx={{ minWidth: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 9px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.25 }}><Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t(title)}</Typography><Button size="small" onClick={onViewAll} sx={{ textTransform: "none", fontSize: 13, fontWeight: 600 }}>{t("View All")}</Button></Box><Box sx={{ display: "grid", gridTemplateColumns: grid, alignItems: "center", columnGap: 1, px: 1.5, minHeight: 44, bgcolor: "#f7f9fc", borderRadius: 1 }}><Typography sx={tableHeaderSx}>{t(columns[0])}</Typography><Typography sx={tableHeaderSx}>{t(columns[1])}</Typography><Typography sx={{ ...tableHeaderSx, textAlign: "right" }}>{t(columns[2])}</Typography><Typography sx={{ ...tableHeaderSx, textAlign: "right" }}>{t(columns[3])}</Typography></Box>{rows.map((row, index) => <Box key={row[0]} sx={{ display: "grid", gridTemplateColumns: grid, alignItems: "center", columnGap: 1, px: 1.5, minHeight: 58, borderBottom: index === rows.length - 1 ? 0 : "1px solid", borderColor: "divider" }}><Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 500 }}>{index + 1}</Typography><Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{row[0]}</Typography><Typography color="text.secondary" sx={{ fontSize: 13.5, fontWeight: 400, textAlign: "right" }}>{row[1]}{kind === "top" ? " pcs" : ""}</Typography>{kind === "out" ? <Box sx={{ justifySelf: "end" }}><Chip label={t(row[2])} size="small" sx={{ height: 24, bgcolor: "#fff0f1", color: "error.main", fontSize: 11.5, fontWeight: 600 }} /></Box> : <Typography color={kind === "low" ? "error.main" : "text.primary"} sx={{ fontSize: 13.5, fontWeight: 500, textAlign: "right" }}>{row[2]}</Typography>}</Box>)}{!rows.length && <Typography align="center" color="text.secondary" sx={{ py: 4, fontSize: 14 }}>{t("No products in this category.")}</Typography>}</CardContent></Card>;
}

function DetailedReportTable({ kind, rows, t }) {
  const config = {
    top: { title: "Top Selling Products", columns: ["#", "Product", "Qty Sold", "Cost Price", "Selling Price", "Margin", "Revenue", "Gross Profit"], grid: "48px minmax(200px, 1fr) 100px 128px 128px 86px 142px 142px" },
    slow: { title: "Slow Selling Products", columns: ["#", "Product", "Last Sold", "Qty Sold", "In Stock", "Cost Price", "Selling Price", "Margin", "Stock Value", "Gross Profit"], grid: "48px minmax(190px, 1fr) 132px 92px 92px 124px 124px 82px 132px 132px" },
    noSale: { title: "No Sale Products", columns: ["#", "Product", "In Stock", "Cost Price", "Selling Price", "Stock Value"], grid: "48px minmax(220px, 1fr) 110px 130px 130px 140px" },
    low: { title: "Low Stock Products", columns: ["#", "Product", "In Stock", "Reorder Level", "Demand Status", "Avg. Daily Sales", "Reorder Priority"], grid: "48px minmax(250px, 1fr) 110px 130px 140px 132px 150px" },
    out: { title: "Out of Stock Products", columns: ["#", "Product", "Last Sold", "Out of Stock Since", "Demand Status", "Avg. Daily Sales", "Suggested Reorder", "Reorder Priority"], grid: "48px minmax(200px, 1fr) 126px 148px 132px 132px 142px 150px" },
  }[kind];

  return <Card sx={{ minWidth: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 9px rgba(15,23,42,.05)" }}>
    <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
      <Box sx={{ mb: 1.75 }}><Typography sx={{ fontSize: 19, fontWeight: 600 }}>{t(config.title)}</Typography></Box>
      <Box sx={{ overflowX: "auto", pb: .25, "&::-webkit-scrollbar": { height: 7 }, "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 8 } }}>
        <Box sx={{ minWidth: kind === "slow" ? 1260 : kind === "top" ? 1050 : kind === "out" ? 1100 : kind === "noSale" ? 820 : 880 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: config.grid, alignItems: "center", columnGap: 1, px: 1.5, minHeight: 44, bgcolor: "#f7f9fc", borderRadius: 1 }}>{config.columns.map((column, index) => <Typography key={column} sx={{ ...tableHeaderSx, textAlign: index < 2 ? "left" : "right" }}>{t(column)}</Typography>)}</Box>
          {rows.map((row, index) => <DetailedReportRow key={row.product} row={row} index={index} kind={kind} grid={config.grid} t={t} />)}
          {!rows.length && <Typography align="center" color="text.secondary" sx={{ py: 5, fontSize: 14 }}>{t("No products match this report.")}</Typography>}
        </Box>
      </Box>
    </CardContent>
  </Card>;
}

function DetailedReportRow({ row, index, kind, grid, t }) {
  const baseSx = { fontSize: 13.5, color: "text.primary", textAlign: "right", whiteSpace: "nowrap" };
  const cell = (value, sx = {}) => <Typography sx={{ ...baseSx, ...sx }}>{value}</Typography>;
  const demandChip = <DemandChip label={t(row.demand)} toneKey={row.demand} />;
  const priorityChip = <PriorityChip label={t(row.priority)} toneKey={row.priority} />;
  const cells = kind === "top"
    ? [cell(index + 1, { textAlign: "left", color: "text.secondary", fontWeight: 700 }), cell(row.product, { textAlign: "left", fontWeight: 700 }), cell(`${row.qtySold} pcs`), cell(money(row.costPrice)), cell(money(row.sellingPrice)), cell(percent(row.margin), { color: "success.main", fontWeight: 700 }), cell(money(row.revenue), { fontWeight: 600 }), cell(money(row.grossProfit), { color: "success.main", fontWeight: 700 })]
    : kind === "slow"
      ? [cell(index + 1, { textAlign: "left", color: "text.secondary", fontWeight: 700 }), cell(row.product, { textAlign: "left", fontWeight: 700 }), cell(row.lastSold), cell(`${row.qtySold} pcs`), cell(`${row.qtyInStock} pcs`), cell(money(row.costPrice)), cell(money(row.sellingPrice)), cell(percent(row.margin), { color: "success.main", fontWeight: 700 }), cell(money(row.stockValue), { color: "warning.dark", fontWeight: 700 }), cell(money(row.grossProfit), { color: "success.main", fontWeight: 700 })]
      : kind === "noSale"
        ? [cell(index + 1, { textAlign: "left", color: "text.secondary", fontWeight: 700 }), cell(row.product, { textAlign: "left", fontWeight: 700 }), cell(`${row.qtyInStock} pcs`), cell(money(row.costPrice)), cell(money(row.sellingPrice)), cell(money(row.stockValue), { color: "warning.dark", fontWeight: 700 })]
      : kind === "low"
        ? [cell(index + 1, { textAlign: "left", color: "text.secondary", fontWeight: 700 }), cell(row.product, { textAlign: "left", fontWeight: 700 }), cell(`${row.qtyInStock} pcs`, { color: "error.main", fontWeight: 700 }), cell(`${row.reorderLevel} pcs`), <Box key="demand" sx={{ justifySelf: "end" }}>{demandChip}</Box>, cell(`${row.dailySales} pcs/day`), <Box key="priority" sx={{ justifySelf: "end" }}>{priorityChip}</Box>]
        : [cell(index + 1, { textAlign: "left", color: "text.secondary", fontWeight: 700 }), cell(row.product, { textAlign: "left", fontWeight: 700 }), cell(row.lastSold), cell(row.outSince), <Box key="demand" sx={{ justifySelf: "end" }}>{demandChip}</Box>, cell(`${row.dailySales} pcs/day`), cell(`${row.reorder} pcs`), <Box key="priority" sx={{ justifySelf: "end" }}>{priorityChip}</Box>];
  return <Box sx={{ display: "grid", gridTemplateColumns: grid, alignItems: "center", columnGap: 1, px: 1.5, minHeight: 60, borderBottom: "1px solid", borderColor: "divider" }}>{cells}</Box>;
}

function DemandChip({ label, toneKey = label }) { const tone = toneKey === "Top Seller" ? { bg: "#eaf3ff", color: "primary.main" } : toneKey === "Slow Seller" ? { bg: "#fff4e8", color: "#b76000" } : { bg: "#f1f3f5", color: "text.secondary" }; return <Chip label={label} size="small" sx={{ height: 26, bgcolor: tone.bg, color: tone.color, fontSize: 11, fontWeight: 700 }} />; }
function PriorityChip({ label, toneKey = label }) { const tone = toneKey === "Urgent reorder" ? { bg: "#fff0f1", color: "error.main" } : toneKey === "Reorder soon" ? { bg: "#fff4e8", color: "#b76000" } : { bg: "#f1f3f5", color: "text.secondary" }; return <Chip label={label} size="small" sx={{ height: 26, bgcolor: tone.bg, color: tone.color, fontSize: 11, fontWeight: 700 }} />; }

function InventoryStatusCard({ products, t }) {
  const { rows, totalItems, totalQuantity, background } = inventoryStatusData(products);
  return <Card sx={{ mt: 2.25, border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 9px rgba(15,23,42,.05)" }}><CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}><Typography sx={{ fontSize: 18, fontWeight: 600, mb: 2 }}>{t("Inventory Summary by Status")}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "290px minmax(0, 1fr)", alignItems: "center", gap: 3 }}><Box sx={{ display: "flex", alignItems: "center", gap: 2 }}><Box sx={{ position: "relative", width: 142, height: 142, flexShrink: 0, borderRadius: "50%", background, "&::after": { content: '""', position: "absolute", inset: 22, bgcolor: "background.paper", borderRadius: "50%" } }}><Box sx={{ position: "absolute", inset: 0, zIndex: 1, display: "grid", placeItems: "center", textAlign: "center" }}><Box><Typography sx={{ fontSize: 20, fontWeight: 700 }}>{totalQuantity}</Typography><Typography color="text.secondary" sx={{ fontSize: 11.5, fontWeight: 400 }}>{t("Total Quantity")}</Typography></Box></Box></Box><Stack spacing={0.75}>{rows.map(([label, , quantity, percentage, color]) => <Box key={label} sx={{ display: "grid", gridTemplateColumns: "10px auto", columnGap: .75, alignItems: "center" }}><Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} /><Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t(label)}<Typography component="span" color="text.secondary" sx={{ ml: .5, fontSize: 12.5, fontWeight: 400 }}>{quantity} ({percentage})</Typography></Typography></Box>)}</Stack></Box><Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>{rows.map(([status, items, quantity, percentage]) => <StatusRow key={status} status={t(status)} items={items} quantity={quantity} percentage={percentage} />)}<StatusRow status={t("Total")} items={String(totalItems)} quantity={String(totalQuantity)} percentage={totalQuantity > 0 ? "100%" : "0%"} last /></Box></Box></CardContent></Card>;
}

function StatusRow({ status, items, quantity, percentage, last }) { return <Box sx={{ display: "grid", gridTemplateColumns: "1.15fr repeat(3, .7fr)", columnGap: .5, px: 1.25, minHeight: 40, alignItems: "center", borderBottom: last ? 0 : "1px solid", borderColor: "divider", bgcolor: status === "Total" ? "#f8fafc" : "transparent" }}><Typography sx={{ fontSize: 13, fontWeight: status === "Total" ? 600 : 500 }}>{status}</Typography><Typography sx={{ fontSize: 13, fontWeight: 500 }}>{items}</Typography><Typography sx={{ fontSize: 13, fontWeight: 500 }}>{quantity}</Typography><Typography sx={{ fontSize: 13, fontWeight: 500 }}>{percentage}</Typography></Box>; }

const toolbarButtonSx = { minHeight: 42, borderColor: "divider", color: "text.primary", borderRadius: 1.5, textTransform: "none", fontWeight: 600, whiteSpace: "nowrap" };
const tableHeaderSx = { color: "text.secondary", fontSize: 12, lineHeight: 1.2, fontWeight: 600, textTransform: "uppercase" };
