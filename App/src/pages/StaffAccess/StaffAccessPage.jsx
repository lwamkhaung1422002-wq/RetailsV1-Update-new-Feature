import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";

const roles = ["MANAGER", "CASHIER", "STOCK_STAFF"];
const roleLabels = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier", STOCK_STAFF: "Stock Staff" };
const permissionGroups = [
  ["Sales", [["sale.create", "Create sales"], ["order.view", "View orders"], ["order.fulfill", "Complete orders"], ["order.cancel", "Cancel paid sale"]]],
  ["Payments", [["payment.view", "View payments"], ["payment.receive", "Receive payments"], ["payment.refund", "Refund without approval"], ["payment.void", "Void payment"]]],
  ["Inventory", [["stock.view", "View stock"], ["stock.receive", "Receive stock"], ["stock.adjust", "Adjust stock"], ["product.view", "View products"], ["product.manage", "Manage products"]]],
  ["Pricing", [["price.view", "View prices"], ["price.edit", "Edit prices"]]],
  ["Suppliers", [["supplier.view", "View suppliers"], ["supplier.manage", "Manage suppliers"], ["supplier.pay", "Pay suppliers"], ["purchase.view", "View purchases"], ["purchase.manage", "Manage purchases"]]],
  ["Expenses", [["expense.view", "View expenses"], ["expense.manage", "Manage expenses"]]],
  ["Reports", [["report.viewSales", "View sales"], ["report.viewCost", "View cost"], ["report.viewProfit", "View profit"], ["audit.view", "View activity"]]],
  ["Settings", [["settings.manage", "Manage settings"]]],
];

const emptyForm = { name: "", email: "", password: "", role: "CASHIER", branchId: "" };

export default function StaffAccessPage() {
  const api = usePosApi();
  const { shop, user } = useAuth();
  const isOwner = Boolean(shop?.isOwner);
  const canSetPin = isOwner || shop?.role === "MANAGER";
  const isMobile = useMediaQuery("(max-width:768px)");
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedRole, setSelectedRole] = useState("MANAGER");
  const [permissionBranchId, setPermissionBranchId] = useState(shop?.id || "");
  const [pinDialog, setPinDialog] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", pin: "", confirmPin: "" });
  const ownedBranches = useMemo(() => (user?.shops || []).filter((branch) => branch.isOwner), [user?.shops]);
  const loadStaff = useCallback(async () => isOwner ? { staff: (await Promise.all(ownedBranches.map((branch) => api.staff.list(branch.id)))).flatMap((result) => result.staff || []) } : { staff: [] }, [api, isOwner, ownedBranches]);
  const loadPolicies = useCallback(() => isOwner ? api.staff.policies(permissionBranchId || shop?.id) : Promise.resolve({ policies: [] }), [api, isOwner, permissionBranchId, shop?.id]);
  const staffResource = useApiResource(loadStaff);
  const policyResource = useApiResource(loadPolicies);
  const staff = staffResource.data?.staff ?? [];
  const selectedPolicy = useMemo(() => (policyResource.data?.policies ?? []).find((policy) => policy.role === selectedRole), [policyResource.data?.policies, selectedRole]);

  const openAdd = () => { setForm({ ...emptyForm, branchId: shop?.id || ownedBranches[0]?.id || "" }); setSaveError(""); setDialog({ mode: "add" }); };
  const openEdit = (member) => { setForm({ name: member.user.name, email: member.user.email, password: "", role: member.role, active: member.active, branchId: member.branch.id }); setSaveError(""); setDialog({ mode: "edit", member }); };
  const closeDialog = () => { if (!saving) setDialog(null); };
  const saveStaff = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (dialog.mode === "add") await api.staff.add({ name: form.name, email: form.email, ...(form.password ? { password: form.password } : {}), role: form.role }, form.branchId);
      else await api.staff.update(dialog.member.id, { role: form.role, active: form.active }, dialog.member.branch.id);
      await staffResource.reload();
      setDialog(null);
    } catch (error) {
      setSaveError(error.message || "Unable to save staff.");
    } finally {
      setSaving(false);
    }
  };
  const togglePermission = async (key, enabled) => {
    const next = enabled
      ? [...new Set([...(selectedPolicy?.permissions ?? []), key])]
      : (selectedPolicy?.permissions ?? []).filter((permission) => permission !== key);
    setSaveError("");
    try {
      await api.staff.updatePolicy(selectedRole, next, permissionBranchId);
      await policyResource.reload();
    } catch (error) {
      setSaveError(error.message || "Unable to update permissions.");
    }
  };
  const savePin = async () => {
    if (pinForm.pin.length !== 6 || pinForm.pin !== pinForm.confirmPin) {
      setSaveError("Enter matching 6-digit PINs.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api.approvals.setPin({ pin: pinForm.pin, ...(pinForm.currentPin ? { currentPin: pinForm.currentPin } : {}) });
      setPinDialog(false);
      setPinForm({ currentPin: "", pin: "", confirmPin: "" });
    } catch (error) {
      setSaveError(error.message || "Unable to save approval PIN.");
    } finally {
      setSaving(false);
    }
  };

  if (!canSetPin) return <Box sx={{ p: 3 }}><Alert severity="error">Manager or owner access required.</Alert></Box>;
  const loading = staffResource.loading || policyResource.loading;
  const error = staffResource.error || policyResource.error;
  const content = loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => { void staffResource.reload(); void policyResource.reload(); }} /> : (
    <>
      {!isOwner ? <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography fontWeight={700}>Manager approval PIN</Typography><Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Use this PIN to approve sensitive actions in this branch.</Typography><Button variant="contained" onClick={() => { setSaveError(""); setPinDialog(true); }}>Set or change PIN</Button></Paper> : <>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}><Button variant="outlined" onClick={() => { setSaveError(""); setPinDialog(true); }}>Set or change PIN</Button></Box>
      <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tab label="Staff" />
        <Tab label="Permissions" />
      </Tabs>
      {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
      {tab === 0 ? (
        !staff.length ? <EmptyState title="No staff yet." /> : isMobile ? (
          <Stack spacing={1.25}>{staff.map((member) => <Paper key={member.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Stack direction="row" justifyContent="space-between" gap={2}><Box sx={{ minWidth: 0 }}><Typography fontWeight={700} noWrap>{member.user.name}</Typography><Typography color="text.secondary" noWrap sx={{ fontSize: 13 }}>{member.user.email}</Typography><Typography sx={{ mt: 1, fontSize: 14 }}>{roleLabels[member.role]} · {member.branch.name}</Typography></Box><Stack alignItems="flex-end" spacing={1}><Chip size="small" color={member.active ? "success" : "default"} label={member.active ? "Active" : "Inactive"} />{member.role !== "OWNER" && <Button size="small" onClick={() => openEdit(member)}>Edit</Button>}</Stack></Stack></Paper>)}</Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}><Table size="small"><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Branch</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{staff.map((member) => <TableRow key={member.id}><TableCell><Typography fontWeight={700}>{member.user.name}</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>{member.user.email}</Typography></TableCell><TableCell>{roleLabels[member.role]}</TableCell><TableCell>{member.branch.name}</TableCell><TableCell><Chip size="small" color={member.active ? "success" : "default"} label={member.active ? "Active" : "Inactive"} /></TableCell><TableCell align="right">{member.role !== "OWNER" && <Button size="small" onClick={() => openEdit(member)}>Edit</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        )
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px minmax(0,1fr)", gap: 2 }}>
          <Stack spacing={1.5}><FormControl fullWidth><InputLabel>Branch</InputLabel><Select label="Branch" value={permissionBranchId} onChange={(event) => setPermissionBranchId(event.target.value)}>{ownedBranches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl><FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>{roles.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}</Select></FormControl></Stack>
          <Stack spacing={2}>{permissionGroups.map(([group, entries]) => <Paper key={group} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography fontWeight={700} sx={{ mb: 1 }}>{group}</Typography><Stack>{entries.map(([key, label]) => <FormControlLabel key={key} label={label} labelPlacement="start" sx={{ m: 0, minHeight: 42, justifyContent: "space-between" }} control={<Switch checked={selectedPolicy?.permissions?.includes(key) ?? false} onChange={(event) => void togglePermission(key, event.target.checked)} />} />)}</Stack></Paper>)}</Stack>
        </Box>
      )}
      </>}
    </>
  );

  return <>
    {isMobile ? <Box sx={{ p: 2.25 }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" fontWeight={800}>Staff & Access</Typography>{tab === 0 && <Button variant="contained" onClick={openAdd}>Add Staff</Button>}</Stack>{content}</Box> : <DesktopPage title="Staff & Access" actionLabel={tab === 0 ? "Add Staff" : undefined} onAction={openAdd}><DesktopPanel>{content}</DesktopPanel></DesktopPage>}
    <Dialog open={Boolean(dialog)} onClose={closeDialog} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
      <DialogTitle fontWeight={800}>{dialog?.mode === "add" ? "Add Staff" : "Edit Staff"}</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>{saveError && <Alert severity="error">{saveError}</Alert>}<TextField label="Name" value={form.name} disabled={dialog?.mode === "edit"} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><TextField label="Email" type="email" value={form.email} disabled={dialog?.mode === "edit"} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />{dialog?.mode === "add" && <TextField label="Password for new account" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} helperText="Not needed when the email already has an account." />}<FormControl fullWidth><InputLabel>Branch</InputLabel><Select label="Branch" value={form.branchId} disabled={dialog?.mode === "edit"} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}>{ownedBranches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl><FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>{roles.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}</Select></FormControl>{dialog?.mode === "edit" && <FormControlLabel control={<Switch checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />} label={form.active ? "Active" : "Inactive"} />}</Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={closeDialog}>Cancel</Button><Button variant="contained" disabled={saving || !form.name.trim() || !form.email.trim() || !form.branchId} onClick={() => void saveStaff()}>{saving ? "Saving…" : "Save"}</Button></DialogActions>
    </Dialog>
    <Dialog open={pinDialog} onClose={saving ? undefined : () => setPinDialog(false)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
      <DialogTitle fontWeight={800}>Approval</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>{saveError && <Alert severity="error">{saveError}</Alert>}<TextField label="Current PIN" type="password" inputMode="numeric" value={pinForm.currentPin} onChange={(event) => setPinForm((current) => ({ ...current, currentPin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} helperText="Required when changing an existing PIN." /><TextField label="New 6-digit PIN" type="password" inputMode="numeric" value={pinForm.pin} onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><TextField label="Confirm PIN" type="password" inputMode="numeric" value={pinForm.confirmPin} onChange={(event) => setPinForm((current) => ({ ...current, confirmPin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /></Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setPinDialog(false)} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void savePin()} disabled={saving || pinForm.pin.length !== 6 || pinForm.confirmPin.length !== 6}>{saving ? "Saving…" : "Save"}</Button></DialogActions>
    </Dialog>
  </>;
}
