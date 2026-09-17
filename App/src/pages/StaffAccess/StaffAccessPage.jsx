import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  Select,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useApiResource, usePosApi } from "../../hooks/useApiResource";
import {
  AccessTabs,
  ManagerPinPanel,
  PermissionsTab,
  StaffTab,
} from "./StaffAccessViews";
import { ROLE_META, STAFF_ROLES, uniqueStaffRows } from "./staffAccessModel";
import { useStagedPermissions } from "./useStagedPermissions";

const emptyStaffForm = { name: "", email: "", role: "CASHIER" };
const emptyPinForm = { currentPin: "", pin: "", confirmPin: "" };

export default function StaffAccessPage() {
  const { shop } = useAuth();
  const isOwner = Boolean(shop?.isOwner || shop?.role === "OWNER");
  const canSetPin = isOwner || shop?.role === "MANAGER";
  if (!canSetPin) return <Box sx={{ p: 3 }}><Alert severity="error">Manager or owner access required.</Alert></Box>;
  return isOwner ? <OwnerStaffAccess /> : <ManagerStaffAccess />;
}

function OwnerStaffAccess() {
  const api = usePosApi();
  const { shop } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:768px)");
  const shopId = shop?.id;
  const [tab, setTab] = useState(0);
  const [staffDialog, setStaffDialog] = useState(null);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [pinFlow, setPinFlow] = useState(null);
  const [pinForm, setPinForm] = useState(emptyPinForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [staffRole, setStaffRole] = useState("all");
  const [staffStatus, setStaffStatus] = useState("all");
  const [linkResult, setLinkResult] = useState(null);
  const [actionError, setActionError] = useState("");

  const staged = useStagedPermissions(api, shopId);

  const loadStaff = useCallback(async () => {
    if (!shopId) return { assignments: [] };
    const result = await api.staff.list(shopId);
    return { assignments: result.staff || [] };
  }, [api, shopId]);
  const staffResource = useApiResource(loadStaff);
  const assignments = useMemo(() => staffResource.data?.assignments || [], [staffResource.data?.assignments]);
  const staffRows = useMemo(() => uniqueStaffRows(assignments), [assignments]);

  const loadApprovals = useCallback(() => shopId ? api.approvals.approvers(shopId) : Promise.resolve({ approvers: [] }), [api, shopId]);
  const approvalResource = useApiResource(loadApprovals);
  const ownerApprover = approvalResource.data?.approvers?.find((approver) => approver.role === "OWNER");
  const ownerPinConfigured = Boolean(ownerApprover?.pinConfigured);

  const changeTab = (nextTab) => {
    if (tab === 1) staged.requestAction(() => setTab(nextTab));
    else setTab(nextTab);
  };
  const openAdd = () => {
    setSaveError("");
    setStaffForm(emptyStaffForm);
    setStaffDialog({ mode: "add" });
  };
  const openEdit = (member) => {
    if (member.role === "OWNER") return;
    setSaveError("");
    setStaffForm({ name: member.user.name, email: member.user.email, role: member.role });
    setStaffDialog({ mode: "edit", member });
  };
  const saveStaff = async () => {
    if (!staffDialog) return;
    setSaving(true);
    setSaveError("");
    try {
      if (staffDialog.mode === "add") {
        const result = await api.staff.add({ name: staffForm.name.trim(), email: staffForm.email.trim(), role: staffForm.role }, shopId);
        setLinkResult({ type: "invite", title: "Staff Invitation Created", name: staffForm.name.trim(), email: staffForm.email.trim(), role: ROLE_META[staffForm.role].label, url: result.invitation.inviteUrl });
      } else {
        await api.staff.update(staffDialog.member.id, { role: staffForm.role }, shopId);
      }
      await staffResource.reload();
      void approvalResource.reload().catch(() => {});
      setStaffDialog(null);
    } catch (error) {
      setSaveError(error.message || "Unable to save staff.");
    } finally {
      setSaving(false);
    }
  };
  const runStaffAction = async (action, fallbackMessage) => {
    setActionError("");
    try {
      await action();
      await staffResource.reload();
    } catch (error) {
      setActionError(error.message || fallbackMessage);
    }
  };
  const handleResetLogin = (member) => runStaffAction(async () => {
    const result = await api.staff.resetLogin(member.id, shopId);
    setLinkResult({ type: "reset", title: "Login Reset Required", url: result.reset.resetUrl });
  }, "Unable to reset this Staff login.");
  const handleDeactivate = (member) => runStaffAction(() => api.staff.update(member.id, { active: false }, shopId), "Unable to deactivate this Staff member.");
  const handleReactivate = (member) => runStaffAction(() => api.staff.update(member.id, { active: true }, shopId), "Unable to reactivate this Staff member.");
  const handleGenerateNewInviteLink = (member) => runStaffAction(async () => {
    const result = await api.staff.generateInviteLink(member.inviteId, shopId);
    setLinkResult({ type: "rotated", title: "New Invite Link Generated", url: result.invitation.inviteUrl });
  }, "Unable to generate a new invitation link.");
  const handleCancelInvite = (member) => runStaffAction(() => api.staff.cancelInvite(member.inviteId, shopId), "Unable to cancel this invitation.");
  const openOwnerPin = () => {
    setSaveError("");
    setPinForm(emptyPinForm);
    setPinFlow("status");
  };
  const saveOwnerPin = async () => {
    if (pinForm.pin.length !== 6 || pinForm.pin !== pinForm.confirmPin || (ownerPinConfigured && pinForm.currentPin.length !== 6)) {
      setSaveError(ownerPinConfigured && pinForm.currentPin.length !== 6 ? "Enter your current 6-digit PIN." : "Enter matching 6-digit PINs.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api.approvals.setPin({ pin: pinForm.pin, ...(pinForm.currentPin ? { currentPin: pinForm.currentPin } : {}) }, shop.id);
      await approvalResource.reload();
      setPinFlow("status");
      setPinForm(emptyPinForm);
    } catch (error) {
      setSaveError(error.message || "Unable to save approval PIN.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: "none", mx: 0, px: { xs: 1.5, sm: 2, md: 0 }, pt: 0, pb: { xs: tab === 0 ? 11 : 2, md: 0 }, overflowX: "hidden" }}>
      {isMobile && <MobileStaffAccessHeader tab={tab} onBack={() => navigate(-1)} onFilter={() => setFilterOpen(true)} onApprovalPin={openOwnerPin} filtersActive={staffRole !== "all" || staffStatus !== "all"} />}
      <Box sx={{ p: { xs: 0, md: 2.25 }, border: { xs: 0, md: "1px solid" }, borderColor: { md: "#e3eaf3" }, borderRadius: { md: 2.25 }, bgcolor: { md: "#fff" }, boxShadow: { md: "0 2px 12px rgba(15,23,42,.045)" } }}>
        <Box sx={{ position: "relative", borderBottom: { md: "1px solid" }, borderColor: { md: "#e5ebf3" }, mb: { md: 1 } }}>
          <AccessTabs value={tab} onChange={changeTab} onAddStaff={openAdd} onApprovalPin={openOwnerPin} />
        </Box>
      {actionError && <Alert severity="error" sx={{ mb: 1.5 }}>{actionError}</Alert>}
      {tab === 0 && <StaffTab rows={staffRows} role={staffRole} status={staffStatus} onRoleChange={setStaffRole} onStatusChange={setStaffStatus} loading={staffResource.loading} error={staffResource.error} onRetry={staffResource.reload} onEditRole={openEdit} onResetLogin={handleResetLogin} onDeactivate={handleDeactivate} onReactivate={handleReactivate} onGenerateNewInviteLink={handleGenerateNewInviteLink} onCancelInvite={handleCancelInvite} />}
      {tab === 1 && <PermissionsTab staged={staged} />}
      </Box>

      <StaffDialog open={Boolean(staffDialog)} mode={staffDialog?.mode} form={staffForm} setForm={setStaffForm} saving={saving} error={saveError} onClose={() => { if (!saving) setStaffDialog(null); }} onSave={saveStaff} />
      <LinkResultDialog result={linkResult} onClose={() => setLinkResult(null)} />
      <OwnerPinFlowDialog mode={pinFlow} configured={ownerPinConfigured} form={pinForm} setForm={setPinForm} saving={saving} error={saveError || approvalResource.error?.message} onModeChange={(mode) => { setSaveError(""); setPinForm(emptyPinForm); setPinFlow(mode); }} onClose={() => { if (!saving) setPinFlow(null); }} onSave={saveOwnerPin} />
      <StaffFilterDialog open={filterOpen} role={staffRole} status={staffStatus} onRoleChange={setStaffRole} onStatusChange={setStaffStatus} onClose={() => setFilterOpen(false)} />
      {isMobile && tab === 0 && <MobileStaffActions onAddStaff={openAdd} onApprovalPin={openOwnerPin} />}
      <DiscardChangesDialog open={staged.confirmationOpen} onKeep={staged.keepEditing} onDiscard={staged.discardAndContinue} />
    </Box>
  );
}

function MobileStaffAccessHeader({ tab, onBack, onFilter, onApprovalPin, filtersActive }) {
  return (
    <AppBar position="sticky" elevation={0} sx={{ display: { xs: "block", md: "none" }, mx: { xs: -1.5, sm: -2 }, mb: 1.1, width: { xs: "calc(100% + 24px)", sm: "calc(100% + 32px)" }, bgcolor: "#1976d2", borderBottom: "1px solid rgba(255,255,255,.2)" }}>
      <Toolbar sx={{ minHeight: "54px !important", px: "8px !important", display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 44px" }}>
        <IconButton aria-label="Back" onClick={onBack} sx={{ color: "common.white" }}><ArrowBackRoundedIcon /></IconButton>
        <Typography component="h1" noWrap align="center" sx={{ color: "common.white", fontSize: 17, lineHeight: 1.2, fontWeight: 650 }}>Staff &amp; Access</Typography>
        <Box sx={{ position: "relative" }}>
          <IconButton aria-label={tab === 0 ? "Filter staff" : "Approval PIN"} onClick={tab === 0 ? onFilter : onApprovalPin} sx={{ color: "common.white" }}>{tab === 0 ? <FilterAltOutlinedIcon /> : <LockOutlinedIcon />}</IconButton>
          {tab === 0 && filtersActive && <Box sx={{ position: "absolute", top: 7, right: 6, width: 7, height: 7, borderRadius: "50%", bgcolor: "#ffca28", border: "1px solid #1976d2" }} />}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

function MobileStaffActions({ onAddStaff, onApprovalPin }) {
  return (
    <Paper elevation={7} sx={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, display: { xs: "block", md: "none" }, px: 1.5, py: 1.5, borderTop: "1px solid", borderColor: "#dfe7f1", borderRadius: 0, bgcolor: "rgba(255,255,255,.98)" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.15 }}>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAddStaff} sx={{ minHeight: 52, borderRadius: 1.35, bgcolor: "#1976d2", textTransform: "none", fontSize: 14.5, fontWeight: 700, boxShadow: "0 3px 9px rgba(25,118,210,.2)" }}>Add Staff</Button>
        <Button variant="outlined" startIcon={<LockOutlinedIcon />} onClick={onApprovalPin} sx={{ minHeight: 52, px: .75, borderRadius: 1.35, borderColor: "#9fc4ea", color: "#1265bd", bgcolor: "#fff", textTransform: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: .55 } }}>Approval PIN</Button>
      </Box>
    </Paper>
  );
}

function StaffFilterDialog({ open, role, status, onRoleChange, onStatusChange, onClose }) {
  const clear = () => { onRoleChange("all"); onStatusChange("all"); };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { m: 2, borderRadius: 2.25 } } }}>
      <DialogTitle component="div" sx={{ px: 2.5, pt: 2.25, pb: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography component="h2" sx={{ color: "#101744", fontSize: 19, fontWeight: 700 }}>Filter staff</Typography><IconButton aria-label="Close filters" onClick={onClose}><CloseRoundedIcon /></IconButton></DialogTitle>
      <DialogContent sx={{ px: 2.5, pt: "8px !important", pb: 2.5 }}>
        <Stack spacing={2}>
          <FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={role} onChange={(event) => onRoleChange(event.target.value)}><MenuItem value="all">All Roles</MenuItem><MenuItem value="OWNER">Owner</MenuItem>{STAFF_ROLES.map((item) => <MenuItem key={item} value={item}>{ROLE_META[item].label}</MenuItem>)}</Select></FormControl>
          <FormControl fullWidth><InputLabel>Status</InputLabel><Select label="Status" value={status} onChange={(event) => onStatusChange(event.target.value)}><MenuItem value="all">All Status</MenuItem><MenuItem value="SETUP_REQUIRED">Setup Required</MenuItem><MenuItem value="ACTIVE">Active</MenuItem><MenuItem value="DEACTIVATED">Deactivated</MenuItem></Select></FormControl>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 1 }}><Button variant="outlined" onClick={clear} disabled={role === "all" && status === "all"} sx={{ minHeight: 46, textTransform: "none", fontWeight: 600 }}>Clear</Button><Button variant="contained" onClick={onClose} sx={{ minHeight: 46, textTransform: "none", fontWeight: 650, boxShadow: "none" }}>Apply Filters</Button></Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function ManagerStaffAccess() {
  const api = usePosApi();
  const { shop, user } = useAuth();
  const [pinDialog, setPinDialog] = useState(false);
  const [pinForm, setPinForm] = useState(emptyPinForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const loadApprovers = useCallback(() => api.approvals.approvers(shop.id), [api, shop.id]);
  const approverResource = useApiResource(loadApprovers);
  const configured = Boolean(approverResource.data?.approvers?.find((approver) => approver.id === user?.id)?.pinConfigured);
  const savePin = async () => {
    if (pinForm.pin.length !== 6 || pinForm.pin !== pinForm.confirmPin) {
      setSaveError("Enter matching 6-digit PINs.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api.approvals.setPin({ pin: pinForm.pin, ...(pinForm.currentPin ? { currentPin: pinForm.currentPin } : {}) }, shop.id);
      await approverResource.reload();
      setPinDialog(false);
      setPinForm(emptyPinForm);
    } catch (error) {
      setSaveError(error.message || "Unable to save approval PIN.");
    } finally {
      setSaving(false);
    }
  };
  return <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1.5, sm: 2, md: 0 }, py: { xs: 2, md: 1 } }}><Box sx={{ mb: 2 }}><Typography component="h1" sx={{ color: "#101744", fontSize: { xs: 25, md: 30 }, fontWeight: 800 }}>Staff &amp; Access</Typography><Typography color="text.secondary" sx={{ fontSize: 14 }}>Manage your approval credential for this branch.</Typography></Box>{approverResource.error && <Alert severity="warning" sx={{ mb: 2 }}>PIN status could not be loaded. You can still open the PIN form.</Alert>}<ManagerPinPanel onSetPin={() => { setSaveError(""); setPinForm(emptyPinForm); setPinDialog(true); }} /><PinDialog open={pinDialog} configured={configured} form={pinForm} setForm={setPinForm} saving={saving} error={saveError} onClose={() => { if (!saving) setPinDialog(false); }} onSave={savePin} /></Box>;
}

export function StaffDialog({ open, mode, form, setForm, saving, error, onClose, onSave }) {
  const isMobile = useMediaQuery("(max-width:768px)");
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const valid = form.name.trim() && form.email.trim() && form.role;
  if (mode === "add" && !isMobile) return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { width: 880, maxWidth: "calc(100vw - 48px)", borderRadius: 2.5, overflow: "hidden", boxShadow: "0 20px 56px rgba(15,23,42,.28)" } } }}>
      <DialogTitle sx={{ px: 3.5, py: 2, display: "grid", gridTemplateColumns: "56px minmax(0,1fr) 44px", gap: 1.75, alignItems: "center" }}>
        <Box sx={{ width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 2, bgcolor: "#eaf3ff", color: "primary.main" }}><PersonAddAlt1RoundedIcon sx={{ fontSize: 30 }} /></Box>
        <Typography component="span" sx={{ color: "#101744", fontSize: 24, lineHeight: 1.25, fontWeight: 700 }}>Add Staff Member</Typography>
        <IconButton aria-label="Close add staff" onClick={onClose} disabled={saving} sx={{ color: "#101744" }}><CloseRoundedIcon sx={{ fontSize: 29 }} /></IconButton>
      </DialogTitle>
      <Divider sx={{ mx: 3.5 }} />
      <DialogContent sx={{ px: 3.5, py: 2 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <LabeledStaffField label="Full Name" required>
            <TextField autoFocus value={form.name} onChange={update("name")} placeholder="Enter full name" fullWidth slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineRoundedIcon /></InputAdornment> } }} sx={desktopStaffFieldSx} />
          </LabeledStaffField>
          <LabeledStaffField label="Email Address" required>
            <TextField type="email" value={form.email} onChange={update("email")} placeholder="Enter email address" fullWidth slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon /></InputAdornment> } }} sx={desktopStaffFieldSx} />
          </LabeledStaffField>
          <Divider />
          <LabeledStaffField label="Role" required>
            <Box role="radiogroup" aria-label="Role" sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 2 }}>
              {STAFF_ROLES.map((role) => <DesktopRoleOption key={role} role={role} selected={form.role === role} onSelect={() => setForm((current) => ({ ...current, role }))} />)}
            </Box>
          </LabeledStaffField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3.5, py: 1.75, borderTop: "1px solid", borderColor: "#e5ebf3", gap: 1.25 }}><Button variant="outlined" onClick={onClose} disabled={saving} sx={{ minHeight: 44, px: 2.75, borderRadius: 1.5, color: "#101744", borderColor: "#d4deeb", textTransform: "none", fontWeight: 600 }}>Cancel</Button><Button variant="contained" startIcon={<PersonAddAlt1RoundedIcon />} disabled={saving || !valid} onClick={() => void onSave()} sx={{ minHeight: 44, px: 2.75, borderRadius: 1.5, textTransform: "none", fontWeight: 650, boxShadow: "none" }}>{saving ? "Saving…" : "Add Staff Member"}</Button></DialogActions>
    </Dialog>
  );
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, fontWeight: 800 }}><Box component="span">{mode === "add" ? "Add Staff" : "Edit Role"}</Box></DialogTitle>
      <DialogContent dividers><Stack spacing={2}>{error && <Alert severity="error">{error}</Alert>}<TextField label="Name" value={form.name} disabled={mode === "edit"} onChange={update("name")} /><TextField label="Email" type="email" value={form.email} disabled={mode === "edit"} onChange={update("email")} /><FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={form.role} onChange={update("role")}>{STAFF_ROLES.map((role) => <MenuItem key={role} value={role}>{ROLE_META[role].label}</MenuItem>)}</Select></FormControl></Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" disabled={saving || !valid} onClick={() => void onSave()}>{saving ? "Saving…" : mode === "add" ? "Add Staff" : "Save Changes"}</Button></DialogActions>
    </Dialog>
  );
}

export function LinkResultDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
  };
  const close = () => { setCopied(false); onClose(); };
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
      <DialogTitle sx={{ color: "#101744", fontWeight: 800 }}>{result.title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {result.type === "invite" && <Box><Typography sx={{ fontWeight: 700 }}>{result.name}</Typography><Typography color="text.secondary">{result.role}</Typography><Typography color="text.secondary">{result.email}</Typography></Box>}
          {result.type === "invite" && <Alert severity="warning">Status: Setup Required<br />Invite expires in 24 hours.</Alert>}
          {result.type === "rotated" && <Alert severity="info">The previous invitation link is no longer valid.</Alert>}
          {result.type === "reset" && <Alert severity="warning">All active sessions for this Staff member have been revoked.</Alert>}
          <Box><Typography sx={{ mb: .75, color: "#101744", fontSize: 13, fontWeight: 700 }}>{result.type === "reset" ? "Reset Link" : "Invite Link"}</Typography><TextField value={result.url} fullWidth multiline maxRows={3} slotProps={{ htmlInput: { readOnly: true } }} /></Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button variant="outlined" onClick={() => void copy()}>{copied ? "Copied" : result.type === "reset" ? "Copy Reset Link" : result.type === "rotated" ? "Copy Link" : "Copy Invite Link"}</Button><Button variant="contained" onClick={close}>Done</Button></DialogActions>
    </Dialog>
  );
}

const desktopStaffFieldSx = { "& .MuiOutlinedInput-root": { minHeight: 52, borderRadius: 1.5, bgcolor: "#fff", "& fieldset": { borderColor: "#cbd7e6" } }, "& .MuiInputAdornment-root": { color: "#657694" } };
const desktopRoleIcons = { MANAGER: <GroupOutlinedIcon />, CASHIER: <PointOfSaleOutlinedIcon />, STOCK_STAFF: <Inventory2OutlinedIcon /> };

function LabeledStaffField({ label, required = false, children }) {
  return <Box><Typography sx={{ mb: .8, color: "#101744", fontSize: 14, fontWeight: 600 }}>{label}{required && <Box component="span" sx={{ ml: .5, color: "error.main" }}>*</Box>}</Typography>{children}</Box>;
}

function DesktopRoleOption({ role, selected, onSelect }) {
  const meta = ROLE_META[role];
  return <Box role="radio" aria-checked={selected} tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} sx={{ position: "relative", minHeight: 100, px: 2, py: 1.25, display: "grid", placeItems: "center", border: "1px solid", borderColor: selected ? meta.color : `${meta.color}55`, borderRadius: 1.75, bgcolor: meta.background, color: meta.color, cursor: "pointer", outline: "none", transition: "border-color 150ms ease, box-shadow 150ms ease", ...(selected && { boxShadow: `0 0 0 2px ${meta.color}20` }), "&:focus-visible": { boxShadow: `0 0 0 3px ${meta.color}35` } }}><Radio checked={selected} tabIndex={-1} sx={{ position: "absolute", top: 7, left: 8, p: .5, color: "#526789", "&.Mui-checked": { color: meta.color } }} /><Stack spacing={.35} sx={{ alignItems: "center" }}><Box sx={{ "& .MuiSvgIcon-root": { fontSize: 30 } }}>{desktopRoleIcons[role]}</Box><Typography sx={{ fontSize: 16, fontWeight: 700 }}>{meta.label}</Typography></Stack></Box>;
}

function OwnerPinFlowDialog({ mode, configured, form, setForm, saving, error, onModeChange, onClose, onSave }) {
  const [verificationPassword, setVerificationPassword] = useState("");
  const [flowError, setFlowError] = useState("");
  const open = Boolean(mode);
  const updatePin = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(0, 6) }));
  const changeMode = (nextMode) => {
    setVerificationPassword("");
    setFlowError("");
    onModeChange(nextMode);
  };
  const close = () => {
    setVerificationPassword("");
    setFlowError("");
    onClose();
  };
  const newPinValid = form.pin.length === 6 && form.confirmPin.length === 6 && form.pin === form.confirmPin;
  const changeValid = newPinValid && form.currentPin.length === 6;
  const isPinForm = mode === "change" || mode === "setup" || mode === "reset";
  const title = mode === "status" ? "Owner Approval PIN" : mode === "change" ? "Change Owner PIN" : mode === "verify" ? "Reset Owner PIN" : mode === "reset" ? "Set New Owner PIN" : "Set Owner PIN";
  const subtitle = mode === "status"
    ? "Highest-level approval for sensitive actions."
    : mode === "change"
      ? "Enter your current PIN and set a new one."
      : mode === "verify"
        ? "Verify your account to reset your PIN."
        : "Create a new PIN for approval actions.";

  return (
    <Dialog open={open} onClose={saving ? undefined : close} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { width: 560, maxWidth: "calc(100vw - 28px)", borderRadius: 2.5, overflow: "hidden", boxShadow: "0 24px 70px rgba(15,23,42,.3)" } } }}>
      <DialogTitle component="div" sx={{ px: { xs: 2.25, sm: 4 }, pt: { xs: 2.5, sm: 3 }, pb: 1.5, position: "relative", textAlign: "center" }}>
        <IconButton aria-label="Close approval PIN" onClick={close} disabled={saving} sx={{ position: "absolute", top: 9, right: 9, color: "#61708d" }}><CloseRoundedIcon sx={{ fontSize: 20 }} /></IconButton>
        <Box sx={{ mx: "auto", mb: 1.2, width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: "50%", bgcolor: "#eaf3ff", color: "primary.main", "& .MuiSvgIcon-root": { fontSize: 28 } }}>{mode === "change" || mode === "reset" || mode === "setup" ? <KeyRoundedIcon /> : <LockOutlinedIcon />}</Box>
        <Typography component="h2" sx={{ color: "#101744", fontSize: { xs: 20, sm: 22 }, lineHeight: 1.25, fontWeight: 750 }}>{title}</Typography>
        <Typography sx={{ mt: .5, color: "#6c7a96", fontSize: { xs: 12.5, sm: 13.5 }, lineHeight: 1.45 }}>{subtitle}</Typography>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2.25, sm: 4 }, pt: { xs: 1.2, sm: 1.5 }, pb: mode === "status" ? { xs: 2.5, sm: 3 } : 2 }}>
        <Stack spacing={1.75}>
          {(error || flowError) && <Alert severity={flowError ? "warning" : "error"} sx={{ py: .35, alignItems: "center", "& .MuiAlert-message": { fontSize: 12.5 } }}>{flowError || error}</Alert>}

          {mode === "status" && <>
            <Box sx={{ p: { xs: 1.5, sm: 1.8 }, display: "flex", alignItems: "center", gap: 1.3, border: "1px solid", borderColor: configured ? "#b8ead0" : "#f3d39b", borderRadius: 1.7, bgcolor: configured ? "#ecfdf3" : "#fff8eb" }}>
              <CheckCircleRoundedIcon sx={{ color: configured ? "#079455" : "#d97706", fontSize: 23 }} />
              <Box><Typography sx={{ color: configured ? "#067647" : "#9a5300", fontSize: 14, fontWeight: 700 }}>{configured ? "PIN is set" : "PIN setup needed"}</Typography><Typography sx={{ mt: .15, color: "#66758f", fontSize: 11.5 }}>{configured ? "Your owner approval PIN is ready to use." : "Create a PIN to approve sensitive actions."}</Typography></Box>
            </Box>
            <Button fullWidth variant="contained" startIcon={<KeyRoundedIcon />} onClick={() => changeMode(configured ? "change" : "setup")} sx={{ minHeight: 46, borderRadius: 1.4, textTransform: "none", fontWeight: 700, boxShadow: "0 4px 12px rgba(8,124,240,.2)" }}>{configured ? "Change PIN" : "Set PIN"}</Button>
            {configured && <Button onClick={() => changeMode("verify")} sx={{ alignSelf: "center", py: .35, textTransform: "none", fontSize: 12.5, fontWeight: 650 }}>Forgot PIN?</Button>}
          </>}

          {mode === "verify" && <PinField label="Your Password" value={verificationPassword} onChange={(event) => { setVerificationPassword(event.target.value); setFlowError(""); }} autoComplete="current-password" />}

          {isPinForm && <>
            {mode === "change" && <PinField label="Current PIN" value={form.currentPin} onChange={updatePin("currentPin")} numeric />}
            <PinField label="New PIN" value={form.pin} onChange={updatePin("pin")} numeric />
            <PinField label="Confirm New PIN" value={form.confirmPin} onChange={updatePin("confirmPin")} numeric error={Boolean(form.confirmPin && form.pin !== form.confirmPin)} helperText={form.confirmPin && form.pin !== form.confirmPin ? "PINs do not match." : "Use exactly 6 digits."} />
          </>}
        </Stack>
      </DialogContent>

      {mode !== "status" && <DialogActions sx={{ px: { xs: 2.25, sm: 4 }, py: 1.9, borderTop: "1px solid", borderColor: "#e5ebf3", gap: 1 }}>
        <Button variant="outlined" onClick={() => changeMode("status")} disabled={saving} sx={{ minHeight: 40, px: 2.2, borderRadius: 1.35, color: "#101744", borderColor: "#d4deeb", textTransform: "none", fontWeight: 600 }}>Cancel</Button>
        {mode === "verify" ? <Button variant="contained" disabled={!verificationPassword || saving} onClick={() => setFlowError("Password verification for PIN reset requires backend support.")} sx={pinPrimaryActionSx}>Verify</Button> : mode === "reset" ? <Button variant="contained" disabled={!newPinValid || saving} onClick={() => setFlowError("Resetting a forgotten PIN requires verified-account backend support.")} sx={pinPrimaryActionSx}>Set PIN</Button> : <Button variant="contained" disabled={saving || (mode === "change" ? !changeValid : !newPinValid)} onClick={() => void onSave()} sx={pinPrimaryActionSx}>{saving ? "Saving…" : mode === "change" ? "Update PIN" : "Set PIN"}</Button>}
      </DialogActions>}
    </Dialog>
  );
}

const pinPrimaryActionSx = { minHeight: 40, px: 2.2, borderRadius: 1.35, textTransform: "none", fontWeight: 650, boxShadow: "none" };

function PinField({ label, value, onChange, numeric = false, error = false, helperText, autoComplete }) {
  return <Box><Typography sx={{ mb: .65, color: "#101744", fontSize: 12.5, fontWeight: 650 }}>{label}</Typography><TextField fullWidth type="password" value={value} onChange={onChange} error={error} helperText={helperText} autoComplete={autoComplete} slotProps={{ htmlInput: numeric ? { inputMode: "numeric", pattern: "[0-9]*", maxLength: 6, "aria-label": label } : { "aria-label": label } }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 43, borderRadius: 1.35, bgcolor: "#fff", "& fieldset": { borderColor: "#cbd7e6" } }, "& .MuiFormHelperText-root": { mx: .25, fontSize: 11 } }} /></Box>;
}

function PinDialog({ open, owner = false, configured = false, form, setForm, saving, error, onClose, onSave }) {
  const updatePin = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(0, 6) }));
  const valid = form.pin.length === 6 && form.confirmPin.length === 6 && (!configured || form.currentPin.length === 6);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{owner ? "Owner Approval PIN" : "Manager Approval PIN"}</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>{error && <Alert severity="error">{error}</Alert>}{configured && <TextField label="Current PIN" type="password" value={form.currentPin} onChange={updatePin("currentPin")} slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }} helperText="Required when changing an existing PIN." />}<TextField label="New 6-digit PIN" type="password" value={form.pin} onChange={updatePin("pin")} slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }} /><TextField label="Confirm PIN" type="password" value={form.confirmPin} onChange={updatePin("confirmPin")} slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }} /></Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void onSave()} disabled={saving || !valid}>{saving ? "Saving…" : "Save PIN"}</Button></DialogActions>
    </Dialog>
  );
}

function DiscardChangesDialog({ open, onKeep, onDiscard }) {
  return <Dialog open={open} onClose={onKeep} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}><DialogTitle sx={{ fontWeight: 800 }}>Discard unsaved changes?</DialogTitle><DialogContent><Typography color="text.secondary">Your permission changes have not been saved. Discard them and continue?</Typography></DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onKeep}>Keep editing</Button><Button color="error" variant="contained" onClick={onDiscard}>Discard changes</Button></DialogActions></Dialog>;
}
