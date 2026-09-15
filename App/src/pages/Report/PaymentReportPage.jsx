import { useCallback, useMemo, useState } from "react";
import { Alert, AppBar, Box, Button, Dialog, DialogContent, IconButton, MenuItem, Paper, Stack, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const dateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const money = (value) => `${Number(value || 0).toLocaleString()} MMK`;
const panelSx = { border: "1px solid #dbe5f0", borderRadius: 2, bgcolor: "#fff", boxShadow: "0 2px 9px rgba(24,52,82,.055)" };
const filterFieldSx = { "& .MuiOutlinedInput-root": { height: 56, borderRadius: 1.5, bgcolor: "#fff", fontSize: 15, fontWeight: 650, "& fieldset": { borderColor: "#c9d6e6" } } };

function weekRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  return { from: dateKey(start), to: dateKey(today) };
}

export default function PaymentReportPage() {
  const api = usePosApi();
  const { shop } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:768px)");
  const today = dateKey();
  const [filters, setFilters] = useState({ from: `${today.slice(0, 7)}-01`, to: today, branchId: shop?.id || "", method: "", staffId: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftRange, setDraftRange] = useState({ from: filters.from, to: filters.to, preset: "custom" });
  const load = useCallback(() => api.reports.payments(filters), [api, filters]);
  const resource = useApiResource(load);
  const data = resource.data;
  const methods = useMemo(() => [...new Set((data?.methods || []).map((entry) => entry.method))], [data?.methods]);
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const openFilters = () => { setDraftRange({ from: filters.from, to: filters.to, preset: "custom" }); setFilterOpen(true); };
  const choosePreset = (preset) => setDraftRange({ ...(preset === "today" ? { from: today, to: today } : weekRange()), preset });
  const resetRange = () => setDraftRange({ from: `${today.slice(0, 7)}-01`, to: today, preset: "custom" });
  const applyRange = () => { setFilters((current) => ({ ...current, from: draftRange.from, to: draftRange.to })); setFilterOpen(false); };

  if (!shop) return <Alert severity="error">Choose a branch.</Alert>;
  return <Box sx={{ width: "100%", maxWidth: 1440, mx: "auto", px: { xs: 1.5, md: 0 }, pb: { xs: 2.5, md: 1 } }}>
    {isMobile && <MobileHeader onBack={() => navigate(-1)} onFilter={openFilters} />}
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.reload()} /> : <ReportContent data={data} methods={methods} filters={filters} isMobile={isMobile} onUpdate={update} onFilter={openFilters} />}
    <DateFilterDialog open={filterOpen} value={draftRange} onChange={setDraftRange} onPreset={choosePreset} onReset={resetRange} onApply={applyRange} onClose={() => setFilterOpen(false)} />
  </Box>;
}

function MobileHeader({ onBack, onFilter }) {
  return <AppBar position="sticky" elevation={0} sx={{ mx: -1.5, mb: 1.5, width: "calc(100% + 24px)", bgcolor: "#1976d2", borderBottom: "1px solid rgba(255,255,255,.2)" }}><Toolbar disableGutters sx={{ minHeight: "52px !important", px: 1, display: "grid", gridTemplateColumns: "44px 1fr 44px" }}><IconButton aria-label="Back" onClick={onBack} sx={{ color: "#fff" }}><ArrowBackRoundedIcon /></IconButton><Typography component="h1" sx={{ color: "#fff", textAlign: "center", fontSize: 16, fontWeight: 700 }}>Payment Report</Typography><IconButton aria-label="Filter payment report" onClick={onFilter} sx={{ color: "#fff" }}><FilterAltOutlinedIcon /></IconButton></Toolbar></AppBar>;
}

function ReportContent({ data, methods, filters, isMobile, onUpdate, onFilter }) {
  const summary = [
    { label: "Collected", value: data?.summary.collected, icon: <AccountBalanceWalletRoundedIcon />, color: "#076de3", background: "#edf5ff", border: "#cfe3fb" },
    { label: "Refunds", value: data?.summary.refunds, icon: <ReplayRoundedIcon />, color: "#ed1824", background: "#fff1f2", border: "#f8d4d8" },
    { label: "Net Collected", value: data?.summary.netCollected, icon: <BarChartRoundedIcon />, color: "#06a953", background: "#edfbf4", border: "#cdeedc" },
    { label: "Outstanding", value: data?.summary.outstanding, icon: <DescriptionRoundedIcon />, color: "#ef9200", background: "#fff9ec", border: "#f4dfb5" },
  ];
  return <Stack spacing={{ xs: 1.5, md: 2.25 }}>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(4,minmax(0,1fr))" }, gap: { xs: 1, md: 1.75 } }}>{summary.map((item) => <SummaryCard key={item.label} {...item} hideIcon={isMobile} />)}</Box>
    {!isMobile && <Box sx={{ display: "grid", gridTemplateColumns: "minmax(220px,352px) minmax(220px,352px) 72px", gap: 1.5, alignItems: "center" }}><TextField select value={filters.method} onChange={onUpdate("method")} fullWidth slotProps={{ select: { displayEmpty: true, renderValue: (value) => value || "All Methods" }, htmlInput: { "aria-label": "Payment method" } }} sx={filterFieldSx}><MenuItem value="">All Methods</MenuItem>{methods.map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField><TextField select value={filters.staffId} onChange={onUpdate("staffId")} fullWidth slotProps={{ select: { displayEmpty: true, renderValue: (value) => value === "" ? "All Staff" : value === "unassigned" ? "Unassigned/System" : data?.staff?.find((member) => member.id === value)?.name || value }, htmlInput: { "aria-label": "Staff" } }} sx={filterFieldSx}><MenuItem value="">All Staff</MenuItem><MenuItem value="unassigned">Unassigned/System</MenuItem>{(data?.staff || []).map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}</TextField><IconButton aria-label="Filter by date" onClick={onFilter} sx={{ width: 64, height: 56, border: "2px solid #087cf0", borderRadius: 1.5, color: "#087cf0", bgcolor: "#fff" }}><FilterAltOutlinedIcon sx={{ fontSize: 30 }} /></IconButton></Box>}
    <MethodsSection data={data} isMobile={isMobile} />
    <RecentSection data={data} isMobile={isMobile} />
  </Stack>;
}

function SummaryCard({ label, value, icon, color, background, border, hideIcon }) {
  return <Paper elevation={0} sx={{ minHeight: { xs: 84, md: 128 }, px: { xs: 1.4, md: 2.25 }, py: { xs: 1.3, md: 2 }, display: "flex", alignItems: "center", gap: 1.6, border: "1px solid", borderColor: border, borderRadius: 2, bgcolor: background }}>{!hideIcon && <Box sx={{ width: 74, height: 74, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 2, bgcolor: `${color}12`, color, "& .MuiSvgIcon-root": { fontSize: 39 } }}>{icon}</Box>}<Box sx={{ minWidth: 0 }}><Typography sx={{ color: "#253b70", fontSize: { xs: 11.5, md: 17 }, fontWeight: 650 }}>{label}</Typography><Typography noWrap sx={{ mt: .45, color: "#080f4f", fontSize: { xs: 16, md: 24 }, lineHeight: 1.2, fontWeight: 800 }}>{money(value)}</Typography></Box></Paper>;
}

function Section({ icon, title, children }) { return <Paper elevation={0} sx={{ ...panelSx, p: { xs: 1.25, md: 2.25 } }}><Stack direction="row" spacing={1.25} sx={{ mb: { xs: 1.25, md: 1.75 }, alignItems: "center", color: "#087cf0" }}>{icon}<Typography component="h2" sx={{ color: "#080f4f", fontSize: { xs: 16, md: 19 }, fontWeight: 750 }}>{title}</Typography></Stack>{children}</Paper>; }

function MethodsSection({ data, isMobile }) {
  if (!data?.methods.length) return <Section icon={<PaymentsRoundedIcon />} title="Payment Methods"><EmptyState title="No payments for this period." /></Section>;
  return <Section icon={<PaymentsRoundedIcon />} title="Payment Methods">{isMobile ? <Stack spacing={1}>{data.methods.map((method) => <Paper key={method.method} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}><Typography sx={{ color: "#101744", fontSize: 14, fontWeight: 750 }}>{method.method}</Typography><Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: .75 }}><Value label="Collected" value={money(method.collected)} /><Value label="Refunds" value={money(method.refunds)} /><Value label="Net" value={money(method.netCollected)} /></Box></Paper>)}</Stack> : <Box sx={{ overflow: "hidden", border: "1px solid #d8e2ef", borderRadius: 1.5 }}><TableHeader columns={["Method", "Collected", "Refunds", "Net"]} />{data.methods.map((method, index) => <Box key={method.method} sx={{ minHeight: 68, px: 2, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", alignItems: "center", borderTop: index ? "1px solid #d8e2ef" : 0 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><MethodMark method={method.method} /><Typography sx={{ fontSize: 16, fontWeight: 700 }}>{method.method}</Typography></Stack><Typography>{money(method.collected)}</Typography><Typography>{money(method.refunds)}</Typography><Typography>{money(method.netCollected)}</Typography></Box>)}</Box>}</Section>;
}

function RecentSection({ data, isMobile }) {
  if (!data?.recent.length) return <Section icon={<HistoryRoundedIcon />} title="Recent Payments"><EmptyState title="No payments for this period." /></Section>;
  return <Section icon={<HistoryRoundedIcon />} title="Recent Payments">{isMobile ? <Stack spacing={1}>{data.recent.map((payment) => <Paper key={payment.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{payment.type}</Typography><Typography sx={{ color: payment.amount < 0 ? "#e11d25" : "#00a94f", fontSize: 13.5, fontWeight: 800 }}>{money(payment.amount)}</Typography></Box><Typography color="text.secondary" sx={{ mt: .3, fontSize: 11.5 }}>{new Date(payment.paidAt).toLocaleString()}</Typography><Box sx={{ mt: .8, display: "flex", gap: 1.5 }}><Typography sx={{ fontSize: 12 }}>{payment.method}</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>{payment.actor?.name || "Unassigned/System"}</Typography></Box></Paper>)}</Stack> : <Box sx={{ overflow: "hidden", border: "1px solid #d8e2ef", borderRadius: 1.5 }}><TableHeader columns={["Type", "Date & Time", "Method", "Staff", "Amount"]} />{data.recent.map((payment, index) => <Box key={payment.id} sx={{ minHeight: 66, px: 2, display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", alignItems: "center", borderTop: index ? "1px solid #d8e2ef" : 0 }}><Stack direction="row" spacing={1.4} sx={{ alignItems: "center" }}><Box sx={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: "50%", color: payment.amount < 0 ? "#ef151d" : "#00a94f", bgcolor: payment.amount < 0 ? "#ffe2e5" : "#dcf8e9" }}>{payment.amount < 0 ? <ArrowDownwardRoundedIcon /> : <ArrowUpwardRoundedIcon />}</Box><Typography>{payment.type}</Typography></Stack><Typography>{new Date(payment.paidAt).toLocaleString()}</Typography><Typography>{payment.method}</Typography><Typography>{payment.actor?.name || "Unassigned/System"}</Typography><Typography sx={{ color: payment.amount < 0 ? "#e11d25" : "#00a94f", fontWeight: 750 }}>{money(payment.amount)}</Typography></Box>)}</Box>}</Section>;
}

function TableHeader({ columns }) { return <Box sx={{ minHeight: 52, px: 2, display: "grid", gridTemplateColumns: `repeat(${columns.length},minmax(0,1fr))`, alignItems: "center", bgcolor: "#f2f6fc" }}>{columns.map((label) => <Typography key={label} sx={{ color: "#3d527e", fontSize: 13.5, fontWeight: 650 }}>{label}</Typography>)}</Box>; }
function MethodMark({ method }) { const cash = method.toLowerCase() === "cash"; return <Box sx={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 1.25, bgcolor: cash ? "#dcf8e9" : "#f1e2ff", color: cash ? "#00a94f" : "#8d18e5" }}><PaymentsRoundedIcon /></Box>; }
function Value({ label, value }) { return <Box sx={{ minWidth: 0 }}><Typography color="text.secondary" sx={{ fontSize: 9.5 }}>{label}</Typography><Typography sx={{ mt: .2, fontSize: 11, fontWeight: 650, overflowWrap: "anywhere" }}>{value}</Typography></Box>; }

function DateFilterDialog({ open, value, onChange, onPreset, onReset, onApply, onClose }) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { width: 390, maxWidth: "calc(100vw - 24px)", m: 1.5, borderRadius: 1.5, overflow: "hidden" } } }}><Box sx={{ minHeight: 52, px: 2, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e1e8f1" }}><Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "#101744" }}><FilterAltOutlinedIcon sx={{ fontSize: 19 }} /><Typography sx={{ fontSize: 15, fontWeight: 750 }}>Filter</Typography></Stack><IconButton aria-label="Close filters" onClick={onClose} size="small"><CloseRoundedIcon sx={{ fontSize: 19 }} /></IconButton></Box><DialogContent sx={{ p: 1.75 }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: .7 }}>{[["today", "Today"], ["week", "This Week"], ["custom", "Custom"]].map(([preset, label]) => <Button key={preset} variant={value.preset === preset ? "contained" : "text"} onClick={() => preset === "custom" ? onChange((current) => ({ ...current, preset })) : onPreset(preset)} sx={{ minHeight: 38, px: .5, borderRadius: 1, bgcolor: value.preset === preset ? undefined : "#eef4fb", color: value.preset === preset ? undefined : "#41567d", textTransform: "none", fontSize: 12, fontWeight: 650, boxShadow: "none" }}>{label}</Button>)}</Box><Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}><DateField label="From" value={value.from} onChange={(event) => onChange((current) => ({ ...current, from: event.target.value, preset: "custom" }))} /><DateField label="To" value={value.to} onChange={(event) => onChange((current) => ({ ...current, to: event.target.value, preset: "custom" }))} /></Box><Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}><Button onClick={onReset} sx={{ minHeight: 44, borderRadius: 1, bgcolor: "#eef4fb", color: "#42577e", textTransform: "none", fontWeight: 650 }}>Reset</Button><Button variant="contained" onClick={onApply} disabled={!value.from || !value.to || value.from > value.to} sx={{ minHeight: 44, borderRadius: 1, textTransform: "none", fontWeight: 700, boxShadow: "none" }}>Apply</Button></Box></DialogContent></Dialog>;
}

function DateField({ label, value, onChange }) { return <Box><Typography sx={{ mb: .5, color: "#42577e", fontSize: 11, fontWeight: 650 }}>{label}</Typography><TextField type="date" value={value} onChange={onChange} fullWidth slotProps={{ htmlInput: { "aria-label": label } }} sx={{ "& .MuiOutlinedInput-root": { height: 42, borderRadius: 1, fontSize: 12 } }} /></Box>; }
