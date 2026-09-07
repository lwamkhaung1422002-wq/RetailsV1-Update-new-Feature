import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Fab,
  IconButton,
  InputAdornment,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import OutboxRoundedIcon from "@mui/icons-material/OutboxRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { usePosApi } from "../../hooks/useApiResource";
/*
const records = [
  { id: 1, product: "Water", type: "IN", qty: "+100 pcs", amount: "500 ကျပ်", reason: "Initial Stock", time: "about an hour ago", date: "11/08/2026 11:20 PM", icon: <WaterDropRoundedIcon /> },
  { id: 2, product: "Air X", type: "OUT", qty: "-1 pcs", amount: "1,000 ကျပ်", reason: "Sale - Order #ORD-20260811-0003", time: "2 hours ago", date: "11/08/2026 10:19 PM", icon: <Inventory2RoundedIcon /> },
  { id: 3, product: "Air X", type: "OUT", qty: "-1 pcs", amount: "1,000 ကျပ်", reason: "Sale - Order #ORD-20260811-0001", time: "4 hours ago", date: "11/08/2026 08:58 PM", icon: <Inventory2RoundedIcon /> },
];

const desktopRecords = [
  { id: 1, product: "Water Bottle 600ml", kind: "in", type: "Stock In", qty: "+50 pcs", reference: "GRN-20260811-001", reason: "Purchase from supplier", date: "2026-08-11", time: "09:10 AM", icon: <WaterDropRoundedIcon />, color: "#38a5dd" },
  { id: 2, product: "Nivea Roll On", kind: "out", type: "Stock Out", qty: "-10 pcs", reference: "SLS-20260811-001", reason: "Sold to customer", date: "2026-08-11", time: "10:35 AM", icon: <Inventory2RoundedIcon />, color: "#3976bb" },
  { id: 3, product: "Coca-Cola 330ml", kind: "in", type: "Stock In", qty: "+30 pcs", reference: "GRN-20260811-002", reason: "Purchase from supplier", date: "2026-08-11", time: "12:05 PM", icon: <Inventory2RoundedIcon />, color: "#e53935" },
  { id: 4, product: "Cellox Facial Tissue", kind: "out", type: "Stock Out", qty: "-5 pcs", reference: "SLS-20260811-002", reason: "Sold to customer", date: "2026-08-11", time: "02:20 PM", icon: <Inventory2RoundedIcon />, color: "#9a5ab7" },
  { id: 5, product: "Jasmine Perfume", kind: "adjustment", type: "Stock Adjustment", qty: "+20 pcs", reference: "ADJ-20260811-001", reason: "Stock adjustment", date: "2026-08-11", time: "03:15 PM", icon: <Inventory2RoundedIcon />, color: "#db6f9c" },
  { id: 6, product: "Water Bottle 600ml", kind: "out", type: "Stock Out", qty: "-15 pcs", reference: "SLS-20260811-003", reason: "Sold to customer", date: "2026-08-11", time: "04:40 PM", icon: <WaterDropRoundedIcon />, color: "#38a5dd" },
  { id: 7, product: "Oishi Green Tea", kind: "in", type: "Stock In", qty: "+40 pcs", reference: "GRN-20260811-003", reason: "Purchase from supplier", date: "2026-08-11", time: "05:30 PM", icon: <Inventory2RoundedIcon />, color: "#4f9b4b" },
  { id: 8, product: "Royal-D 500ml", kind: "adjustment", type: "Stock Adjustment", qty: "+12 pcs", reference: "ADJ-20260811-002", reason: "Stock adjustment", date: "2026-08-11", time: "06:15 PM", icon: <Inventory2RoundedIcon />, color: "#deae28" },
  { id: 9, product: "Air X", kind: "out", type: "Stock Out", qty: "-6 pcs", reference: "SLS-20260810-001", reason: "Sold to customer", date: "2026-08-10", time: "11:10 AM", icon: <Inventory2RoundedIcon />, color: "#767676" },
  { id: 10, product: "Nivea Roll On", kind: "in", type: "Stock In", qty: "+25 pcs", reference: "GRN-20260810-001", reason: "Purchase from supplier", date: "2026-08-10", time: "02:45 PM", icon: <Inventory2RoundedIcon />, color: "#3976bb" },
];
*/

export default function StockHistoryPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sourceRecords, setSourceRecords] = useState([]);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => { let active = true; api.inventory.movements({ limit: 200 }).then(({ movements }) => { if (!active) return; setHistoryError(""); setSourceRecords((movements || []).map((movement) => { const kind = movement.direction === "OUT" ? "out" : "in"; const quantity = Number(movement.enteredQuantity || 0); const date = new Date(movement.occurredAt); const saleInvoice = movement.type === "SALE" ? movement.invoiceNumber : null; return { id: movement.id, product: movement.product?.name || "Product", sku: movement.product?.sku || "", barcodes: movement.product?.barcodes?.map((barcode) => barcode.value) || [], type: saleInvoice ? `SALE · ${saleInvoice}` : (kind === "out" ? "Stock Out" : "Stock In"), kind, qty: `${kind === "out" ? "-" : "+"}${quantity} pcs`, amount: movement.unitCost ? `${new Intl.NumberFormat("en-US").format(Number(movement.unitCost))} ကျပ်` : "—", reference: movement.sourceId, reason: movement.reason || movement.type, staffName: movement.staffName || "", time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), date: date.toISOString().slice(0, 10), icon: <Inventory2RoundedIcon />, color: kind === "out" ? "#d14343" : "#1976d2" }; })); }).catch((error) => { if (active) { setSourceRecords([]); setHistoryError(error.message || "Unable to load stock history. Please try again."); } }); return () => { active = false; }; }, [api]);
  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sourceRecords.filter((record) => {
      const matchesFilter = filter === "all" || record.kind === filter;
      const matchesSearch = !query || [record.product, record.sku, record.reference, record.reason, ...(record.barcodes || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, sourceRecords]);

  if (!isMobile) return <>{historyError && <Alert severity="error" sx={{ mb: 1.5 }}>{historyError}</Alert>}<DesktopStockHistory records={visibleRecords} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} navigate={navigate} /></>;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 3 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}>
        <Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
          <IconButton aria-label="Back to inventory" onClick={() => navigate("/stock")} sx={{ justifySelf: "start", color: "common.white" }}><ArrowBackRoundedIcon /></IconButton>
          <Typography variant="h6" fontWeight={700}>Stock History</Typography>
          <Box />
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 3, pt: 2.5 }}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by product name or barcode"
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><IconButton aria-label="Scan barcode" edge="end"><QrCodeScannerRoundedIcon /></IconButton></InputAdornment>,
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              minHeight: 64,
              px: 1.25,
              bgcolor: "#f5f5f5",
              borderRadius: 2,
              fontSize: 16,
              "& fieldset": { border: 0 },
            },
          }}
        />

        <Box sx={{ display: "flex", justifyContent: "center", gap: 1.25, mt: 3.25, mb: 3 }}>
          <Button variant="contained" onClick={() => setFilter("all")} startIcon={<CheckRoundedIcon />} sx={filter === "all" ? selectedFilterSx : filterSx}>All</Button>
          <Button variant="outlined" onClick={() => setFilter("in")} sx={filter === "in" ? selectedFilterSx : filterSx}>Stock IN</Button>
          <Button variant="outlined" onClick={() => setFilter("out")} sx={filter === "out" ? selectedFilterSx : filterSx}>Stock OUT</Button>
        </Box>

        <Stack spacing={2}>
          {historyError && <Alert severity="error">{historyError}</Alert>}
          {visibleRecords.map((record) => <HistoryCard key={record.id} record={record} />)}
        </Stack>
      </Box>

      <Fab aria-label="Add stock movement" onClick={() => navigate("/stock/movement/add")} sx={{ position: "fixed", right: 26, bottom: 26, width: 64, height: 64, bgcolor: "#ff5a36", color: "common.white", boxShadow: "0 4px 12px rgba(15,23,42,0.28)", "&:hover": { bgcolor: "#e94c2b" } }}><AddRoundedIcon sx={{ fontSize: 32 }} /></Fab>
    </Box>
  );
}

function DesktopStockHistory({ records, filter, setFilter, search, setSearch, navigate }) {
  const [dateAnchor, setDateAnchor] = useState(null);
  const [dateRange, setDateRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const displayedRecords = records.filter((record) => (dateRange !== "today" || record.date === new Date().toISOString().slice(0, 10)) && (!from || record.date >= from) && (!to || record.date <= to));
  const chooseRange = (range) => { setDateRange(range); if (range !== "custom") { setFrom(""); setTo(""); } };
  const counts = { all: displayedRecords.length, in: displayedRecords.filter((record) => record.kind === "in").length, out: displayedRecords.filter((record) => record.kind === "out").length };
  return <Box sx={{ maxWidth: 1500, mx: "auto", py: .5 }}>
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 170px 178px 184px auto", gap: 1.25, alignItems: "center" }}><TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product name or reference..." InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 46, borderRadius: 1.5, bgcolor: "background.paper" } }} /><TextField select value={filter} onChange={(event) => setFilter(event.target.value)} size="small" sx={desktopSelectSx}><MenuItem value="all">All</MenuItem><MenuItem value="in">Stock In</MenuItem><MenuItem value="out">Stock Out</MenuItem></TextField><Button variant="outlined" startIcon={<CalendarMonthRoundedIcon />} onClick={(event) => setDateAnchor(event.currentTarget)} sx={desktopDateButtonSx}>Date and time</Button><Button variant="outlined" startIcon={<Inventory2RoundedIcon />} onClick={() => navigate("/stock/movement/add")} sx={desktopAdjustmentButtonSx}>Stock Adjustment</Button><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate("/stock/movement/add")} sx={desktopAddStockSx}>Add Stock</Button></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 2, mt: 2.5, mb: 2.5 }}><MovementStat label="All" value={counts.all} helper="Total Movements" icon={<Inventory2RoundedIcon />} tone="blue" /><MovementStat label="Stock In" value={counts.in} helper="Total In" icon={<MoveToInboxRoundedIcon />} tone="green" /><MovementStat label="Stock Out" value={counts.out} helper="Total Out" icon={<OutboxRoundedIcon />} tone="red" /></Box>
    <Card sx={{ borderRadius: 2.25, border: "1px solid", borderColor: "divider", boxShadow: "0 2px 8px rgba(15,23,42,.05)" }}><Box sx={desktopHistoryHeaderSx}><DesktopHeader>NO.</DesktopHeader><DesktopHeader>DATE AND TIME</DesktopHeader><DesktopHeader>PRODUCT</DesktopHeader><DesktopHeader>QUANTITY</DesktopHeader><DesktopHeader>TYPE</DesktopHeader><DesktopHeader>REASON</DesktopHeader></Box><Divider />{displayedRecords.map((record, index) => <Box key={record.id} sx={desktopHistoryRowSx}><Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 700 }}>{index + 1}</Typography><Box sx={{ display: "flex", alignItems: "center", gap: 1.25, whiteSpace: "nowrap", color: "text.secondary" }}><Stack direction="row" alignItems="center" spacing={.5}><CalendarMonthRoundedIcon sx={{ fontSize: 16 }} /><Typography sx={{ fontSize: 13 }}>{record.date.split("-").reverse().join("/")}</Typography></Stack><Stack direction="row" alignItems="center" spacing={.5}><AccessTimeRoundedIcon sx={{ fontSize: 16 }} /><Typography sx={{ fontSize: 13 }}>{record.time}</Typography></Stack></Box><Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}><Box sx={{ width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 1.25, bgcolor: "#f5f7fa", color: record.color, "& .MuiSvgIcon-root": { fontSize: 22 } }}>{record.icon}</Box><Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }}>{record.product}</Typography></Box><Typography color={record.kind === "out" ? "error.main" : "success.main"} sx={{ fontSize: 14, fontWeight: 800 }}>{record.qty}</Typography><Chip label={record.type} size="small" sx={{ justifySelf: "start", height: 28, fontWeight: 700, ...(record.kind === "out" ? { bgcolor: "#fff1f0", color: "#d14343" } : record.kind === "adjustment" ? { bgcolor: "#fff5e6", color: "#d78212" } : { bgcolor: "#e8f6ec", color: "#278a45" }) }} /><Typography color="text.secondary" sx={{ fontSize: 13 }}>{record.reason}{record.staffName ? ` • Staff: ${record.staffName}` : ""}</Typography></Box>)}</Card>
    <Popover open={Boolean(dateAnchor)} anchorEl={dateAnchor} onClose={() => setDateAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { sx: { width: 368, p: 2, borderRadius: 2 } } }}><Typography sx={{ fontWeight: 800, mb: 1.5 }}>Date and time</Typography><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>{["all", "today", "custom"].map((range) => <Button key={range} variant="outlined" onClick={() => chooseRange(range)} sx={{ minHeight: 44, borderColor: dateRange === range ? "primary.main" : "divider", bgcolor: dateRange === range ? "#eaf3ff" : "transparent", color: dateRange === range ? "primary.main" : "text.primary", textTransform: "uppercase", fontSize: 12 }}>{range}</Button>)}</Box>{dateRange === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: 1.5 }}><Box><Typography variant="caption" color="text.secondary">From</Typography><TextField fullWidth type="date" size="small" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ htmlInput: { "aria-label": "From date" } }} /></Box><Box><Typography variant="caption" color="text.secondary">To</Typography><TextField fullWidth type="date" size="small" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ htmlInput: { "aria-label": "To date" } }} /></Box></Box>}<Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1.5 }}><Button onClick={() => chooseRange("all")} sx={{ textTransform: "uppercase" }}>Reset</Button><Button variant="contained" onClick={() => setDateAnchor(null)} sx={{ textTransform: "uppercase" }}>Apply</Button></Stack></Popover>
  </Box>;
}

function MovementStat({ label, value, helper, icon, tone }) { const colors = tone === "green" ? { bg: "#f1fbf5", border: "#d5eddd", icon: "#1f9a4d", text: "#208b49" } : tone === "red" ? { bg: "#fff6f5", border: "#f6dddd", icon: "#e34b47", text: "#d94440" } : { bg: "#f4f8ff", border: "#d9e7fb", icon: "#1d73df", text: "#1769cf" }; return <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, minHeight: 108, px: 2.5, borderRadius: 2, bgcolor: colors.bg, border: "1px solid", borderColor: colors.border }}><Box sx={{ width: 58, height: 58, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "#fff", color: colors.icon, boxShadow: "0 2px 7px rgba(15,23,42,.08)" }}>{icon}</Box><Box><Typography sx={{ fontSize: 14, fontWeight: 800, color: colors.text }}>{label}</Typography><Typography sx={{ fontSize: 28, lineHeight: 1.1, fontWeight: 800, mt: .5 }}>{value}</Typography><Typography color="text.secondary" sx={{ fontSize: 12, mt: .35 }}>{helper}</Typography></Box></Box>; }

function DesktopHeader({ children, align }) { return <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700, textAlign: align }}>{children}</Typography>; }

const desktopHistoryGrid = "52px minmax(200px, 1.12fr) minmax(200px, 1.12fr) 112px 142px minmax(190px, 1fr)";
const desktopSelectSx = { "& .MuiOutlinedInput-root": { minHeight: 46, borderRadius: 1.5, bgcolor: "background.paper" } };
const desktopDateButtonSx = { minHeight: 46, justifyContent: "flex-start", borderRadius: 1.5, textTransform: "none", whiteSpace: "nowrap", color: "text.primary", borderColor: "divider" };
const desktopAdjustmentButtonSx = { minHeight: 46, borderRadius: 1.5, textTransform: "none", whiteSpace: "nowrap" };
const desktopAddStockSx = { minHeight: 46, borderRadius: 1.5, textTransform: "none", whiteSpace: "nowrap", px: 2.25 };
const desktopHistoryHeaderSx = { display: "grid", gridTemplateColumns: desktopHistoryGrid, columnGap: 2, alignItems: "center", minHeight: 54, px: 2.5 };
const desktopHistoryRowSx = { display: "grid", gridTemplateColumns: desktopHistoryGrid, columnGap: 2, alignItems: "center", minHeight: 74, px: 2.5, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } };

function HistoryCard({ record }) {
  const isDeleted = record.reason === "Product deleted";
  const isIn = record.kind === "in";
  const returnInvoice = String(record.reference || "").startsWith("RETURN:") ? String(record.reference).slice("RETURN:".length) : null;
  const statusColor = isDeleted ? "error.main" : isIn ? "success.main" : "error.main";

  return (
    <Card sx={{ borderRadius: 3, bgcolor: "background.paper", boxShadow: "0 4px 12px rgba(15,23,42,0.14)" }}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 1.75, alignItems: "start" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography color="text.primary" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{record.product}</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 3.25, mt: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: statusColor }}>
                {(isIn ? <ArrowDownwardRoundedIcon sx={{ fontSize: 24 }} /> : <ArrowUpwardRoundedIcon sx={{ fontSize: 24 }} />)}
                <Typography color={statusColor} sx={{ fontSize: 19, fontWeight: 700 }}>{record.qty}</Typography>
              </Box>
              <Typography color="text.primary" sx={{ fontSize: 19, fontWeight: 500, whiteSpace: "nowrap" }}>{record.amount}</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 3 }}><Typography color="text.secondary" sx={{ fontSize: 18, lineHeight: 1.35 }}>{record.reason}{record.staffName ? ` • Staff: ${record.staffName}` : ""}</Typography>{returnInvoice && <Chip label="RETURN" variant="outlined" sx={{ height: 42, flexShrink: 0, borderRadius: 999, borderColor: statusColor, color: statusColor, bgcolor: "background.paper", fontWeight: 700, "& .MuiChip-label": { px: 1.5, fontSize: 16 } }} />}</Box>
          </Box>
          <Chip label={isDeleted ? "Product Deleted" : returnInvoice || record.type} variant="outlined" sx={{ mt: 0.25, height: 42, borderRadius: 999, borderColor: statusColor, color: statusColor, bgcolor: "background.paper", fontWeight: 700, "& .MuiChip-label": { px: 1.5, fontSize: 16 } }} />
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, mt: 3.5, color: "text.secondary" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}><HistoryRoundedIcon sx={{ fontSize: 21 }} /><Typography noWrap sx={{ fontSize: 15 }}>{record.time}</Typography></Box>
          <Typography noWrap sx={{ textAlign: "right", fontSize: 15 }}>{record.date}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

const filterSx = { minHeight: 56, borderRadius: 1.75, borderColor: "text.primary", color: "text.primary", bgcolor: "background.paper", fontSize: 15, fontWeight: 600, px: 2, textTransform: "none" };
const selectedFilterSx = { ...filterSx, borderColor: "#ff5a36", bgcolor: "#ff5a36", color: "common.white", "&:hover": { bgcolor: "#e94c2b", borderColor: "#e94c2b" } };
