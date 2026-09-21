import { useCallback, useState } from "react";
import { Alert, Box, Chip, MenuItem, Paper, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const dateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const operationFilterSx = { "& .MuiOutlinedInput-root": { bgcolor: "#fff", borderRadius: 1.5, fontSize: 14.5, "& fieldset": { borderColor: "#cbd8e7" }, "&:hover fieldset": { borderColor: "#8eadd0" } } };
const operationMetrics = [
  { key: "orders", label: "Orders", color: "#0b6fdc", background: "#edf5ff", border: "#cfe3fb" },
  { key: "cancelled", label: "Cancelled", color: "#d32f2f", background: "#fff1f2", border: "#f4d0d4" },
  { key: "refunds", label: "Refunds", color: "#d32f2f", background: "#fff5f5", border: "#f3d7d9" },
  { key: "stockAdjustments", label: "Stock Adjustments", color: "#087b75", background: "#effaf8", border: "#ccebe6" },
  { key: "paymentReversals", label: "Payment Reversals", color: "#b86605", background: "#fff8eb", border: "#f2dfb8" },
  { key: "managerApprovals", label: "Manager Approvals", color: "#5a43b5", background: "#f5f2ff", border: "#ddd5f8" },
];
const groupTone = (group) => ({
  Sales: "#1976d2",
  Inventory: "#087b75",
  "Supplier/Payments": "#b86605",
  "Staff Activity": "#5a43b5",
  "Sensitive Actions": "#d32f2f",
}[group] || "#1976d2");

export default function OperationsPage() {
  const api = usePosApi();
  const { shop } = useAuth();
  const isMobile = useMediaQuery("(max-width:768px)");
  const today = dateKey();
  const [filters, setFilters] = useState({ from: `${today.slice(0, 7)}-01`, to: today, staffId: "", group: "" });
  const load = useCallback(() => api.reports.operations({ ...filters, branchId: shop?.id }), [api, filters, shop?.id]);
  const resource = useApiResource(load);
  const data = resource.data;
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const summary = data?.summary || {};
  const body = resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.reload()} /> : <>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 1.25, mb: 2, p: { xs: 1.25, md: 1.5 }, border: "1px solid #dbe5f0", borderRadius: 2, bgcolor: "#fff", boxShadow: "0 2px 9px rgba(24,52,82,.05)" }}><TextField label="From" type="date" value={filters.from} onChange={update("from")} slotProps={{ inputLabel: { shrink: true } }} sx={operationFilterSx} /><TextField label="To" type="date" value={filters.to} onChange={update("to")} slotProps={{ inputLabel: { shrink: true } }} sx={operationFilterSx} /><TextField select label="Staff" value={filters.staffId} onChange={update("staffId")} sx={operationFilterSx}><MenuItem value="">All staff</MenuItem>{(data?.staff || []).map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}</TextField><TextField select label="Activity" value={filters.group} onChange={update("group")} sx={operationFilterSx}><MenuItem value="">All activity</MenuItem>{["Sales", "Inventory", "Supplier/Payments", "Staff Activity", "Sensitive Actions"].map((group) => <MenuItem key={group} value={group}>{group}</MenuItem>)}</TextField></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(6,1fr)", gap: 1.1, mb: 2.5 }}>{operationMetrics.map(({ key, label, color, background, border }) => <Paper key={key} variant="outlined" sx={{ p: 1.75, minWidth: 0, borderRadius: 2, borderColor: border, bgcolor: background, boxShadow: "0 2px 7px rgba(24,52,82,.04)" }}><Typography sx={{ color, fontSize: { xs: 12.5, md: 13 }, lineHeight: 1.3, fontWeight: 650 }}>{label}</Typography><Typography sx={{ mt: 0.4, color: "#10234f", fontSize: { xs: 21, md: 22 }, lineHeight: 1.2, fontWeight: 800 }}>{summary[key] || 0}</Typography></Paper>)}</Box>
    {!data?.groups.length ? <EmptyState title="No activity for this period." /> : <Stack spacing={2.25}>{data.groups.map((section) => <Box key={section.group}><Typography sx={{ mb: 1, pl: 1.25, borderLeft: "4px solid", borderColor: groupTone(section.group), color: "#10234f", fontSize: 17, lineHeight: 1.35, fontWeight: 800 }}>{section.group}</Typography><Stack spacing={1}>{section.events.map((event) => <Paper key={event.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2, borderColor: "#dbe5f0", borderLeft: "3px solid", borderLeftColor: groupTone(section.group), bgcolor: "#fff", boxShadow: "0 2px 8px rgba(24,52,82,.045)" }}><Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(180px,1.4fr) 1fr 1fr auto", gap: 1.5, alignItems: "center", minWidth: 0 }}><Box><Typography sx={{ color: "#10234f", fontSize: 15.5, fontWeight: 750 }}>{event.label}</Typography><Typography color="text.secondary" sx={{ mt: .2, fontSize: 12.5 }}>{event.entity}{event.entityId ? ` · ${event.entityId}` : ""}</Typography></Box><Value label="Staff" value={`${event.actor.name} · ${event.actor.role}`} />{event.approver ? <Value label="Approved by" value={`${event.approver.name} · ${event.approver.role}`} /> : <Box />}{event.authorizationMode === "manager-override" && <Chip size="small" color="primary" label="Manager approval" sx={{ fontWeight: 650 }} />}</Box>{event.reason && <Typography color="text.secondary" sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.45 }}>{event.reason}</Typography>}<Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 12.5 }}>{new Date(event.createdAt).toLocaleString()}</Typography></Paper>)}</Stack></Box>)}</Stack>}
  </>;
  if (!shop) return <Alert severity="error">Choose a shop.</Alert>;
  return isMobile ? <Box sx={{ p: 2.25, bgcolor: "#f8fafc", minHeight: "100vh" }}><Typography component="h1" sx={{ mx: -2.25, mt: -2.25, mb: 2, px: 2.25, py: 1.6, bgcolor: "primary.main", color: "common.white", fontSize: 18, lineHeight: 1.3, fontWeight: 750 }}>Operations</Typography>{body}</Box> : <DesktopPage title="Operations"><DesktopPanel>{body}</DesktopPanel></DesktopPage>;
}

function Value({ label, value }) { return <Box sx={{ minWidth: 0 }}><Typography color="text.secondary" sx={{ fontSize: 12.5, fontWeight: 500 }}>{label}</Typography><Typography sx={{ mt: 0.25, color: "#1a2d55", fontSize: 14.5, lineHeight: 1.4, fontWeight: 700, overflowWrap: "anywhere" }}>{value}</Typography></Box>; }
