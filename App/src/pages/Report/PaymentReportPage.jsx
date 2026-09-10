import { useCallback, useMemo, useState } from "react";
import { Alert, Box, MenuItem, Paper, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const dateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const money = (value) => `${Number(value || 0).toLocaleString()} MMK`;

export default function PaymentReportPage() {
  const api = usePosApi();
  const { shop, user } = useAuth();
  const isMobile = useMediaQuery("(max-width:768px)");
  const today = dateKey();
  const [filters, setFilters] = useState({ from: `${today.slice(0, 7)}-01`, to: today, branchId: shop?.id || "", method: "", staffId: "" });
  const load = useCallback(() => api.reports.payments(filters), [api, filters]);
  const resource = useApiResource(load);
  const data = resource.data;
  const methods = useMemo(() => [...new Set((data?.methods || []).map((entry) => entry.method))], [data?.methods]);
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const content = resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.reload()} /> : <>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,minmax(0,1fr))", gap: 1.25, mb: 2 }}><TextField label="From" type="date" value={filters.from} onChange={update("from")} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="To" type="date" value={filters.to} onChange={update("to")} slotProps={{ inputLabel: { shrink: true } }} /><TextField select label="Branch" value={filters.branchId} onChange={update("branchId")}><MenuItem value={shop?.id}>{shop?.name}</MenuItem>{(user?.shops || []).filter((entry) => entry.id !== shop?.id).map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name}</MenuItem>)}</TextField><TextField select label="Payment Method" value={filters.method} onChange={update("method")}><MenuItem value="">All methods</MenuItem>{methods.map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField><TextField select label="Staff" value={filters.staffId} onChange={update("staffId")}><MenuItem value="">All staff</MenuItem><MenuItem value="unassigned">Unassigned/System</MenuItem>{(data?.staff || []).map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}</TextField></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 1.25, mb: 2 }}>{[["Collected", data?.summary.collected], ["Refunds", data?.summary.refunds], ["Net Collected", data?.summary.netCollected], ["Outstanding", data?.summary.outstanding]].map(([label, value]) => <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography color="text.secondary" sx={{ fontSize: 13 }}>{label}</Typography><Typography fontWeight={800} sx={{ mt: 0.5 }}>{money(value)}</Typography></Paper>)}</Box>
    <Typography fontWeight={800} sx={{ mb: 1 }}>Payment Methods</Typography>{!data?.methods.length ? <EmptyState title="No payments for this period." /> : <Stack spacing={1}>{data.methods.map((method) => <Paper key={method.method} variant="outlined" sx={{ p: 1.75, borderRadius: 2, display: "grid", gridTemplateColumns: "1fr repeat(3,minmax(90px,1fr))", gap: 1.5 }}><Typography fontWeight={750}>{method.method}</Typography><ReportValue label="Collected" value={money(method.collected)} /><ReportValue label="Refunds" value={money(method.refunds)} /><ReportValue label="Net" value={money(method.netCollected)} /></Paper>)}</Stack>}
    <Typography fontWeight={800} sx={{ mt: 2.5, mb: 1 }}>Recent Payments</Typography>{!data?.recent.length ? <EmptyState title="No payments for this period." /> : <Stack spacing={1}>{data.recent.map((payment) => <Paper key={payment.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2, display: "grid", gridTemplateColumns: isMobile ? "1fr auto" : "1.4fr 1fr 1fr 1fr auto", gap: 1.5, alignItems: "center" }}><Box><Typography fontWeight={750}>{payment.type}</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>{new Date(payment.paidAt).toLocaleString()}</Typography></Box><ReportValue label="Method" value={payment.method} /><ReportValue label="Staff" value={payment.actor?.name || "Unassigned/System"} />{payment.approver && <ReportValue label="Approved by" value={payment.approver.name} />}<Typography fontWeight={800} color={payment.amount < 0 ? "error.main" : "success.main"}>{money(payment.amount)}</Typography></Paper>)}</Stack>}
  </>;
  if (!shop) return <Alert severity="error">Choose a branch.</Alert>;
  return isMobile ? <Box sx={{ p: 2.25 }}><Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Payment Report</Typography>{content}</Box> : <DesktopPage title="Payment Report"><DesktopPanel>{content}</DesktopPanel></DesktopPage>;
}

function ReportValue({ label, value }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography><Typography fontWeight={700} sx={{ mt: 0.25 }}>{value}</Typography></Box>; }
