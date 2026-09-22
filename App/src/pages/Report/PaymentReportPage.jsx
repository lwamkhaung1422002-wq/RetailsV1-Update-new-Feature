import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppBar, Box, Button, CircularProgress, Dialog, DialogContent, IconButton, InputAdornment, MenuItem, Paper, Stack, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { queryKeys } from "../../lib/queryKeys";

const dateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const money = (value) => `${Number(value || 0).toLocaleString()} MMK`;
const signedMoney = (value) => `${Number(value || 0) >= 0 ? "+" : "-"}${Math.abs(Number(value || 0)).toLocaleString()} MMK`;
const paymentDateTime = (value) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Yangon", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const panelSx = { border: "1px solid #dbe5f0", borderRadius: 2, bgcolor: "#fff", boxShadow: "0 2px 9px rgba(24,52,82,.055)" };
const filterFieldSx = { "& .MuiOutlinedInput-root": { height: 56, borderRadius: 1.5, bgcolor: "#fff", fontSize: 15, fontWeight: 650, "& fieldset": { borderColor: "#c9d6e6" } } };
const searchFieldSx = { flex: 1, minWidth: 0, ...filterFieldSx };

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
  const [filters, setFilters] = useState({ from: `${today.slice(0, 7)}-01`, to: today, method: "", staffId: "", search: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftRange, setDraftRange] = useState({ from: filters.from, to: filters.to, preset: "custom" });
  const reportQuery = useInfiniteQuery({
    queryKey: queryKeys.reports(shop?.id, "payments", filters),
    queryFn: ({ pageParam }) => api.reports.payments({ ...filters, branchId: shop?.id || undefined, cursor: pageParam || undefined, pageSize: 50 }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(shop?.id),
  });
  const { data: reportData, error: reportError, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = reportQuery;
  const pages = useMemo(() => reportData?.pages || [], [reportData?.pages]);
  const data = pages[0];
  const recent = useMemo(() => [...new Map(pages.flatMap((page) => page.recent || []).map((payment) => [payment.id, payment])).values()], [pages]);
  const methods = useMemo(() => [...new Set((data?.methods || []).map((entry) => entry.method))], [data?.methods]);
  const loadMoreRef = useRef(null);
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const openFilters = () => { setDraftRange({ from: filters.from, to: filters.to, preset: "custom" }); setFilterOpen(true); };
  const choosePreset = (preset) => setDraftRange({ ...(preset === "today" ? { from: today, to: today } : weekRange()), preset });
  const resetRange = () => setDraftRange({ from: `${today.slice(0, 7)}-01`, to: today, preset: "custom" });
  const applyRange = () => { setFilters((current) => ({ ...current, from: draftRange.from, to: draftRange.to })); setFilterOpen(false); };
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchingNextPage || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, recent.length]);

  if (!shop) return <Alert severity="error">Choose a branch.</Alert>;
  return <Box sx={{ width: "100%", maxWidth: "none", mx: 0, px: { xs: 1.5, md: 0 }, pb: { xs: 2.5, md: 1 } }}>
    {isMobile && <MobileHeader onBack={() => navigate(-1)} onFilter={openFilters} />}
    {isLoading ? <LoadingState /> : reportError ? <ErrorState error={reportError} onRetry={() => void refetch()} /> : <ReportContent data={data} recent={recent} methods={methods} filters={filters} isMobile={isMobile} onUpdate={update} onFilter={openFilters} loadMoreRef={loadMoreRef} hasMore={hasNextPage} loadingMore={isFetchingNextPage} />}
    <DateFilterDialog open={filterOpen} value={draftRange} onChange={setDraftRange} onPreset={choosePreset} onReset={resetRange} onApply={applyRange} onClose={() => setFilterOpen(false)} />
  </Box>;
}

function MobileHeader({ onBack, onFilter }) {
  return <AppBar position="sticky" elevation={0} sx={{ mx: -1.5, mb: 1.5, width: "calc(100% + 24px)", bgcolor: "#1976d2", borderBottom: "1px solid rgba(255,255,255,.2)" }}><Toolbar disableGutters sx={{ minHeight: "52px !important", px: 1, display: "grid", gridTemplateColumns: "44px 1fr 44px" }}><IconButton aria-label="Back" onClick={onBack} sx={{ color: "#fff" }}><ArrowBackRoundedIcon /></IconButton><Typography component="h1" sx={{ color: "#fff", textAlign: "center", fontSize: 16, fontWeight: 700 }}>Payment Report</Typography><IconButton aria-label="Filter payment report" onClick={onFilter} sx={{ color: "#fff" }}><FilterAltOutlinedIcon /></IconButton></Toolbar></AppBar>;
}

function ReportContent({ data, recent, methods, filters, isMobile, onUpdate, onFilter, loadMoreRef, hasMore, loadingMore }) {
  const summary = [
    { label: "Collected", value: data?.summary.collected, color: "#076de3", background: "#edf5ff", border: "#cfe3fb" },
    { label: "Refunds", value: data?.summary.refunds, color: "#ed1824", background: "#fff1f2", border: "#f8d4d8" },
    { label: "Net Collected", value: data?.summary.netCollected, color: "#06a953", background: "#edfbf4", border: "#cdeedc" },
  ];
  return <Stack spacing={{ xs: 1.5, md: 2.25 }}>
    {isMobile && <TextField fullWidth value={filters.search} onChange={onUpdate("search")} placeholder="Search payments..." slotProps={{ htmlInput: { "aria-label": "Search payments" }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "text.secondary" }} /></InputAdornment> } }} sx={searchFieldSx} />}
    <Box data-testid="payment-summary" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(3,minmax(0,1fr))" }, gap: { xs: 1, md: 1.75 } }}>{summary.map((item, index) => <SummaryCard key={item.label} {...item} fullWidth={isMobile && index === summary.length - 1} />)}</Box>
    {!isMobile && <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", minWidth: 0 }}><TextField fullWidth value={filters.search} onChange={onUpdate("search")} placeholder="Search payments..." slotProps={{ htmlInput: { "aria-label": "Search payments" }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "text.secondary" }} /></InputAdornment> } }} sx={searchFieldSx} /><TextField select value={filters.method} onChange={onUpdate("method")} slotProps={{ select: { displayEmpty: true, renderValue: (value) => value || "All Methods" }, htmlInput: { "aria-label": "Payment method" } }} sx={{ width: 220, flexShrink: 0, ...filterFieldSx }}><MenuItem value="">All Methods</MenuItem>{methods.map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField><TextField select value={filters.staffId} onChange={onUpdate("staffId")} slotProps={{ select: { displayEmpty: true, renderValue: (value) => value === "" ? "All Staff" : value === "unassigned" ? "Unassigned/System" : data?.staff?.find((member) => member.id === value)?.name || value }, htmlInput: { "aria-label": "Staff" } }} sx={{ width: 220, flexShrink: 0, ...filterFieldSx }}><MenuItem value="">All Staff</MenuItem><MenuItem value="unassigned">Unassigned/System</MenuItem>{(data?.staff || []).map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}</TextField><IconButton aria-label="Filter by date" onClick={onFilter} sx={{ width: 64, height: 56, flexShrink: 0, border: "2px solid #087cf0", borderRadius: 1.5, color: "#087cf0", bgcolor: "#fff" }}><FilterAltOutlinedIcon sx={{ fontSize: 30 }} /></IconButton></Box>}
    {!isMobile && <MethodsSection data={data} />}
    <RecentSection recent={recent} isMobile={isMobile} loadMoreRef={loadMoreRef} hasMore={hasMore} loadingMore={loadingMore} />
  </Stack>;
}

function SummaryCard({ label, value, color, background, border, fullWidth }) {
  return <Paper data-testid="payment-summary-card" data-full-width={fullWidth ? "true" : "false"} elevation={0} sx={{ gridColumn: fullWidth ? "1 / -1" : "auto", minHeight: { xs: 84, md: 128 }, px: { xs: 1.4, md: 2.25 }, py: { xs: 1.3, md: 2 }, display: "flex", alignItems: "center", border: "1px solid", borderColor: border, borderRadius: 2, bgcolor: background }}><Box sx={{ minWidth: 0 }}><Typography sx={{ color, fontSize: { xs: 13, md: 17 }, lineHeight: 1.3, fontWeight: 650 }}>{label}</Typography><Typography noWrap sx={{ mt: .45, color: "#080f4f", fontSize: { xs: 18, md: 25 }, lineHeight: 1.2, fontWeight: 800 }}>{money(value)}</Typography></Box></Paper>;
}

function Section({ icon, title, children }) { return <Paper elevation={0} sx={{ ...panelSx, p: { xs: 1.25, md: 2.25 } }}><Stack direction="row" spacing={1.25} sx={{ mb: { xs: 1.25, md: 1.75 }, alignItems: "center", color: "#087cf0" }}>{icon}<Typography component="h2" sx={{ color: "#080f4f", fontSize: { xs: 17, md: 20 }, fontWeight: 750 }}>{title}</Typography></Stack>{children}</Paper>; }

function MethodsSection({ data }) {
  if (!data?.methods.length) return <Section icon={<PaymentsRoundedIcon />} title="Payment Methods"><EmptyState title="No payments for this period." /></Section>;
  return <Section icon={<PaymentsRoundedIcon />} title="Payment Methods"><Box sx={{ overflow: "hidden", border: "1px solid #d8e2ef", borderRadius: 1.5 }}><TableHeader columns={["Method", "Collected", "Refunds", "Net"]} />{data.methods.map((method, index) => <Box key={method.method} sx={{ minHeight: 68, px: 2, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", alignItems: "center", borderTop: index ? "1px solid #d8e2ef" : 0 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><MethodMark method={method.method} /><Typography sx={{ fontSize: 16, fontWeight: 700 }}>{method.method}</Typography></Stack><Typography sx={{ fontSize: 15, fontWeight: 500 }}>{money(method.collected)}</Typography><Typography sx={{ fontSize: 15, fontWeight: 500 }}>{money(method.refunds)}</Typography><Typography sx={{ fontSize: 15, fontWeight: 650 }}>{money(method.netCollected)}</Typography></Box>)}</Box></Section>;
}

function RecentSection({ recent, isMobile, loadMoreRef, hasMore, loadingMore }) {
  if (!recent.length) return <Section icon={<HistoryRoundedIcon />} title="Recent Payments"><EmptyState title="No payments for this period." /></Section>;
  return <Section icon={<HistoryRoundedIcon />} title="Recent Payments">{isMobile ? <Stack spacing={1}>{recent.map((payment) => <Paper key={payment.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}><Box data-testid="payment-row-primary" sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 1, alignItems: "baseline" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 15, fontWeight: 700 }}>{payment.type}</Typography><Typography noWrap sx={{ textAlign: "right", color: payment.amount < 0 ? "#e11d25" : "#00a94f", fontSize: 15, fontWeight: 800 }}>{signedMoney(payment.amount)}</Typography></Box><Box data-testid="payment-row-source" sx={{ mt: .65, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 1, alignItems: "baseline" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 13, fontWeight: 650, textOverflow: "ellipsis", overflow: "hidden" }}>{payment.source || "—"}</Typography><Typography noWrap color="text.secondary" sx={{ textAlign: "right", fontSize: 13 }}>{payment.actor?.name || "Unassigned/System"}</Typography></Box><Box data-testid="payment-row-meta" sx={{ mt: .45, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 1, alignItems: "baseline" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 13 }}>{payment.method}</Typography><Typography noWrap color="text.secondary" sx={{ textAlign: "right", fontSize: 12.5 }}>{paymentDateTime(payment.paidAt)}</Typography></Box></Paper>)}</Stack> : <Box sx={{ overflow: "hidden", border: "1px solid #d8e2ef", borderRadius: 1.5 }}><TableHeader columns={["Type", "Source", "Date & Time", "Method", "Staff", "Amount"]} />{recent.map((payment, index) => <Box key={payment.id} sx={{ minHeight: 66, px: 2, display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", alignItems: "center", borderTop: index ? "1px solid #d8e2ef" : 0 }}><Stack direction="row" spacing={1.4} sx={{ alignItems: "center" }}><Box sx={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: "50%", color: payment.amount < 0 ? "#ef151d" : "#00a94f", bgcolor: payment.amount < 0 ? "#ffe2e5" : "#dcf8e9" }}>{payment.amount < 0 ? <ArrowDownwardRoundedIcon /> : <ArrowUpwardRoundedIcon />}</Box><Typography sx={{ fontSize: 15, fontWeight: 650 }}>{payment.type}</Typography></Stack><Typography sx={{ fontSize: 15 }}>{payment.source || "—"}</Typography><Typography sx={{ fontSize: 14.5 }}>{new Date(payment.paidAt).toLocaleString()}</Typography><Typography sx={{ fontSize: 15 }}>{payment.method}</Typography><Typography sx={{ fontSize: 15 }}>{payment.actor?.name || "Unassigned/System"}</Typography><Typography sx={{ color: payment.amount < 0 ? "#e11d25" : "#00a94f", fontSize: 15, fontWeight: 750 }}>{money(payment.amount)}</Typography></Box>)}</Box>}<Box ref={loadMoreRef} aria-label="Payment activity pagination" sx={{ minHeight: 2, mt: hasMore || loadingMore ? 1.5 : 0, display: "grid", placeItems: "center" }}>{loadingMore && <CircularProgress size={24} aria-label="Loading more payments" />}</Box></Section>;
}

function TableHeader({ columns }) { return <Box sx={{ minHeight: 52, px: 2, display: "grid", gridTemplateColumns: `repeat(${columns.length},minmax(0,1fr))`, alignItems: "center", bgcolor: "#f2f6fc" }}>{columns.map((label) => <Typography key={label} sx={{ color: "#3d527e", fontSize: 14.5, fontWeight: 700 }}>{label}</Typography>)}</Box>; }
function MethodMark({ method }) { const cash = method.toLowerCase() === "cash"; return <Box sx={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 1.25, bgcolor: cash ? "#dcf8e9" : "#f1e2ff", color: cash ? "#00a94f" : "#8d18e5" }}><PaymentsRoundedIcon /></Box>; }

function DateFilterDialog({ open, value, onChange, onPreset, onReset, onApply, onClose }) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { width: { xs: 390, md: 540 }, maxWidth: "calc(100vw - 24px)", m: 1.5, borderRadius: { xs: 1.5, md: 2 }, overflow: "hidden", boxShadow: { md: "0 20px 55px rgba(15,23,42,.28)" } } } }}><Box sx={{ minHeight: { xs: 52, md: 62 }, px: { xs: 2, md: 3 }, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e1e8f1" }}><Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "#101744" }}><FilterAltOutlinedIcon sx={{ fontSize: { xs: 19, md: 22 } }} /><Typography sx={{ fontSize: { xs: 15, md: 18 }, fontWeight: 750 }}>Filter</Typography></Stack><IconButton aria-label="Close filters" onClick={onClose} size="small"><CloseRoundedIcon sx={{ fontSize: { xs: 19, md: 22 } }} /></IconButton></Box><DialogContent sx={{ p: { xs: 1.75, md: 3 } }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: { xs: .7, md: 1 } }}>{[["today", "Today"], ["week", "This Week"], ["custom", "Custom"]].map(([preset, label]) => <Button key={preset} variant={value.preset === preset ? "contained" : "text"} onClick={() => preset === "custom" ? onChange((current) => ({ ...current, preset })) : onPreset(preset)} sx={{ minHeight: { xs: 38, md: 46 }, px: .5, borderRadius: 1, bgcolor: value.preset === preset ? undefined : "#eef4fb", color: value.preset === preset ? undefined : "#41567d", textTransform: "none", fontSize: { xs: 12, md: 14 }, fontWeight: 650, boxShadow: "none" }}>{label}</Button>)}</Box><Box sx={{ mt: { xs: 1.5, md: 2.25 }, display: "grid", gridTemplateColumns: "1fr 1fr", gap: { xs: 1.25, md: 1.75 } }}><DateField label="From" value={value.from} onChange={(event) => onChange((current) => ({ ...current, from: event.target.value, preset: "custom" }))} /><DateField label="To" value={value.to} onChange={(event) => onChange((current) => ({ ...current, to: event.target.value, preset: "custom" }))} /></Box><Box sx={{ mt: { xs: 1.5, md: 2.25 }, display: "grid", gridTemplateColumns: "1fr 1fr", gap: { xs: 1, md: 1.25 } }}><Button onClick={onReset} sx={{ minHeight: { xs: 44, md: 50 }, borderRadius: 1, bgcolor: "#eef4fb", color: "#42577e", textTransform: "none", fontSize: { md: 14 }, fontWeight: 650 }}>Reset</Button><Button variant="contained" onClick={onApply} disabled={!value.from || !value.to || value.from > value.to} sx={{ minHeight: { xs: 44, md: 50 }, borderRadius: 1, textTransform: "none", fontSize: { md: 14 }, fontWeight: 700, boxShadow: "none" }}>Apply</Button></Box></DialogContent></Dialog>;
}

function DateField({ label, value, onChange }) { return <Box><Typography sx={{ mb: { xs: .5, md: .75 }, color: "#42577e", fontSize: { xs: 11, md: 13 }, fontWeight: 650 }}>{label}</Typography><TextField type="date" value={value} onChange={onChange} fullWidth slotProps={{ htmlInput: { "aria-label": label } }} sx={{ "& .MuiOutlinedInput-root": { height: { xs: 42, md: 50 }, borderRadius: 1, fontSize: { xs: 12, md: 14 } } }} /></Box>; }
