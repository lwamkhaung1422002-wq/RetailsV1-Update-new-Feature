import { useCallback, useState } from "react";
import { Alert, Box, Chip, MenuItem, Paper, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const dateKey = (value = new Date()) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });

export default function OperationsPage() {
  const api = usePosApi();
  const { shop } = useAuth();
  const isMobile = useMediaQuery("(max-width:768px)");
  const today = dateKey();
  const [filters, setFilters] = useState({ from: `${today.slice(0, 7)}-01`, to: today, branchId: "", staffId: "", group: "" });
  const load = useCallback(() => api.reports.operations(filters), [api, filters]);
  const resource = useApiResource(load);
  const data = resource.data;
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const summary = data?.summary || {};
  const body = resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.reload()} /> : <>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,minmax(0,1fr))", gap: 1.25, mb: 2 }}><TextField label="From" type="date" value={filters.from} onChange={update("from")} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="To" type="date" value={filters.to} onChange={update("to")} slotProps={{ inputLabel: { shrink: true } }} /><TextField select label="Branch" value={filters.branchId} onChange={update("branchId")}><MenuItem value="">All branches</MenuItem>{(data?.branches || []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField><TextField select label="Staff" value={filters.staffId} onChange={update("staffId")}><MenuItem value="">All staff</MenuItem>{(data?.staff || []).map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}</TextField><TextField select label="Activity" value={filters.group} onChange={update("group")}><MenuItem value="">All activity</MenuItem>{["Sales", "Inventory", "Supplier/Payments", "Staff Activity", "Sensitive Actions"].map((group) => <MenuItem key={group} value={group}>{group}</MenuItem>)}</TextField></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(6,1fr)", gap: 1.1, mb: 2.5 }}>{[["Orders", summary.orders], ["Cancelled", summary.cancelled], ["Refunds", summary.refunds], ["Stock Adjustments", summary.stockAdjustments], ["Payment Reversals", summary.paymentReversals], ["Manager Approvals", summary.managerApprovals]].map(([label, value]) => <Paper key={label} variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}><Typography color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography><Typography fontWeight={800} sx={{ mt: 0.4, fontSize: 20 }}>{value || 0}</Typography></Paper>)}</Box>
    {!data?.groups.length ? <EmptyState title="No activity for this period." /> : <Stack spacing={2.25}>{data.groups.map((section) => <Box key={section.group}><Typography fontWeight={800} sx={{ mb: 1 }}>{section.group}</Typography><Stack spacing={1}>{section.events.map((event) => <Paper key={event.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}><Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(180px,1.4fr) 1fr 1fr 1fr auto", gap: 1.5, alignItems: "center", minWidth: 0 }}><Box><Typography fontWeight={750}>{event.label}</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>{event.entity}{event.entityId ? ` · ${event.entityId}` : ""}</Typography></Box><Value label="Branch" value={event.branch.name} /><Value label="Staff" value={`${event.actor.name} · ${event.actor.role}`} />{event.approver ? <Value label="Approved by" value={`${event.approver.name} · ${event.approver.role}`} /> : <Box />}{event.authorizationMode === "manager-override" && <Chip size="small" color="primary" label="Manager approval" />}</Box>{event.reason && <Typography color="text.secondary" sx={{ mt: 1, fontSize: 13 }}>{event.reason}</Typography>}<Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 12 }}>{new Date(event.createdAt).toLocaleString()}</Typography></Paper>)}</Stack></Box>)}</Stack>}
  </>;
  if (!shop) return <Alert severity="error">Choose a branch.</Alert>;
  return isMobile ? <Box sx={{ p: 2.25 }}><Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Operations</Typography>{body}</Box> : <DesktopPage title="Operations"><DesktopPanel>{body}</DesktopPanel></DesktopPage>;
}

function Value({ label, value }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography><Typography fontWeight={700} sx={{ mt: 0.25 }}>{value}</Typography></Box>; }
