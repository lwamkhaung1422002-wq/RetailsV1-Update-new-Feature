import { useCallback, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography, useMediaQuery } from "@mui/material";
import { useNavigate } from "react-router";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const money = (value) => value === null || value === undefined ? "Restricted" : `${Number(value).toLocaleString()} MMK`;

export default function BranchesPage() {
  const api = usePosApi();
  const navigate = useNavigate();
  const { shop, selectShop, reloadShops } = useAuth();
  const isMobile = useMediaQuery("(max-width:768px)");
  const [tab, setTab] = useState(0);
  const [branchFilter, setBranchFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ name: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const loadOverview = useCallback(() => api.branches.overview(), [api]);
  const loadInventory = useCallback(() => api.branches.inventory(), [api]);
  const overview = useApiResource(loadOverview);
  const inventory = useApiResource(loadInventory);
  const branches = overview.data?.branches || [];
  const inventoryRows = useMemo(() => (inventory.data?.inventory || []).filter((row) => (branchFilter === "all" || row.shopId === branchFilter) && (!search.trim() || [row.name, row.sku, row.branchName].filter(Boolean).some((value) => value.toLowerCase().includes(search.trim().toLowerCase())))), [branchFilter, inventory.data?.inventory, search]);

  const openBranch = (branch, path = "/") => { selectShop(branch); navigate(path); };
  const openAdd = () => { setForm({ name: "", address: "" }); setSaveError(""); setDialog({ mode: "add" }); };
  const openEdit = (branch) => { setForm({ name: branch.name, address: branch.address || "" }); setSaveError(""); setDialog({ mode: "edit", branch }); };
  const save = async () => {
    setSaving(true); setSaveError("");
    try {
      if (dialog.mode === "add") await api.branches.create({ ...form, currencyCode: shop?.setting?.currencyCode || "MMK" });
      else await api.branches.update(dialog.branch.id, form);
      await reloadShops();
      await Promise.all([overview.reload(), inventory.reload()]);
      setDialog(null);
    } catch (error) { setSaveError(error.message || "Unable to save branch."); }
    finally { setSaving(false); }
  };

  const loading = tab === 0 ? overview.loading : inventory.loading;
  const error = tab === 0 ? overview.error : inventory.error;
  const body = loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => void (tab === 0 ? overview.reload() : inventory.reload())} /> : <>
    <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}><Tab label="Overview" /><Tab label="Inventory" /></Tabs>
    {tab === 0 ? (!branches.length ? <EmptyState title="No other branches." /> : <Stack spacing={1.25}>{branches.map((branch) => <Paper key={branch.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(180px,1.4fr) repeat(5,minmax(90px,1fr)) auto", gap: 1.5, alignItems: "center" }}><Box><Typography fontWeight={800}>{branch.name}</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>{branch.address || branch.role}</Typography></Box><Metric label="Today Sales" value={branch.todaySales === null ? null : money(branch.todaySales)} /><Metric label="Orders" value={branch.orders} /><Metric label="Low Stock" value={branch.lowStock} /><Metric label="Stock Value" value={branch.stockValue === null ? null : money(branch.stockValue)} /><Metric label="Staff" value={branch.staff} /><Stack direction="row" spacing={1}><Button size="small" onClick={() => openBranch(branch)}>Open</Button>{branch.isOwner && <Button size="small" onClick={() => openEdit(branch)}>Edit</Button>}</Stack></Box></Paper>)}</Stack>) : <><Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px minmax(0,1fr)", gap: 1.5, mb: 2 }}><TextField select label="Branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><MenuItem value="all">All branches</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField><TextField label="Search product" value={search} onChange={(event) => setSearch(event.target.value)} /></Box>{!inventoryRows.length ? <EmptyState title="No inventory." /> : <Stack spacing={1.1}>{inventoryRows.map((row) => <Paper key={`${row.shopId}:${row.productId}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(180px,1.5fr) 1fr 1fr 1fr auto", gap: 1.5, alignItems: "center", minWidth: 0 }}><Box><Typography fontWeight={750}>{row.name}</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>{row.sku || "No SKU"}</Typography></Box><Metric label="Branch" value={row.branchName} /><Metric label="On hand" value={row.onHand} /><Metric label="Available" value={row.available} /><Button size="small" onClick={() => openBranch(branches.find((branch) => branch.id === row.shopId), "/stock")}>Manage</Button></Box></Paper>)}</Stack>}</>}
  </>;

  return <>
    {isMobile ? <Box sx={{ p: 2.25 }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" fontWeight={800}>Branches</Typography>{shop?.isOwner && <Button variant="contained" onClick={openAdd}>Add Branch</Button>}</Stack>{body}</Box> : <DesktopPage title="Branches" actionLabel={shop?.isOwner ? "Add Branch" : undefined} onAction={openAdd}><DesktopPanel>{body}</DesktopPanel></DesktopPage>}
    <Dialog open={Boolean(dialog)} onClose={saving ? undefined : () => setDialog(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}><DialogTitle fontWeight={800}>{dialog?.mode === "add" ? "Add Branch" : "Edit Branch"}</DialogTitle><DialogContent dividers><Stack spacing={2}>{saveError && <Alert severity="error">{saveError}</Alert>}<TextField label="Branch name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><TextField label="Address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} multiline minRows={2} /></Stack></DialogContent><DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setDialog(null)} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void save()} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save"}</Button></DialogActions></Dialog>
  </>;
}

function Metric({ label, value }) { return <Box><Typography color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography><Typography fontWeight={700} sx={{ mt: 0.25 }}>{value === null || value === undefined ? "Restricted" : value}</Typography></Box>; }
