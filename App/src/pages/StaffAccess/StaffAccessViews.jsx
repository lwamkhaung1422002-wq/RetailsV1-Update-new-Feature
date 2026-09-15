import { useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { EmptyState, ErrorState, LoadingState } from "../../components/ApiState/ApiState";
import {
  PERMISSION_GROUPS,
  ROLE_META,
  STAFF_ROLES,
  avatarTone,
  initials,
} from "./staffAccessModel";

const surface = {
  border: "1px solid",
  borderColor: "#dfe7f1",
  borderRadius: 2,
  bgcolor: "#fff",
  boxShadow: "0 1px 3px rgba(15,23,42,.035)",
};

const selectSx = {
  height: 44,
  borderRadius: 1.6,
  bgcolor: "#fff",
  fontWeight: 650,
  fontSize: 14,
  minWidth: 0,
  "& .MuiSelect-select": { display: "flex", alignItems: "center", minWidth: 0 },
};

export function AccessTabs({ value, onChange, onAddStaff, onApprovalPin }) {
  const items = [
    ["Staff", <GroupOutlinedIcon key="staff" />],
    ["Permissions", <ShieldOutlinedIcon key="permissions" />],
  ];
  return (
    <Box sx={{ display: "flex", flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center", justifyContent: "space-between", gap: { xs: .8, md: 1 }, mb: { xs: 1.25, md: 0 } }}>
      <Tabs value={value} onChange={(_event, next) => onChange(next)} variant="fullWidth" aria-label="Staff and access sections" sx={{ minHeight: 46, width: { xs: "100%", md: 380 }, "& .MuiTabs-flexContainer": { gap: { xs: 1.25, md: 1.75 } }, "& .MuiTabs-indicator": { display: "none" }, "& .MuiTab-root": { minWidth: 0, minHeight: 46, px: { xs: 1, sm: 2 }, border: "1px solid #dbe5f0", borderRadius: 1.4, bgcolor: "#fff", color: "#53627e", textTransform: "none", fontSize: { xs: 13, sm: 14 }, fontWeight: 600, flexDirection: "row", gap: { xs: .55, sm: .8 }, whiteSpace: "nowrap", transition: "border-color 150ms ease, background-color 150ms ease", "&.Mui-selected": { color: "#076ed8", borderColor: "#76b5f4", bgcolor: "#eef7ff", fontWeight: 700 } }, "& .MuiSvgIcon-root": { fontSize: { xs: 19, sm: 20 } } }}>
        {items.map(([label, icon]) => <Tab key={label} icon={icon} iconPosition="start" label={label} />)}
      </Tabs>
      <Stack direction="row" spacing={.85} sx={{ display: { xs: "none", md: "flex" }, width: "auto", justifyContent: "flex-end", flexShrink: 0 }}>
        {value === 0 && <Button variant="contained" startIcon={<PersonAddAlt1RoundedIcon />} onClick={onAddStaff} sx={{ minHeight: 44, flex: { xs: 1, md: "none" }, px: 2, borderRadius: 1.45, bgcolor: "#087cf0", textTransform: "none", fontSize: 13.25, fontWeight: 700, boxShadow: "0 4px 12px rgba(8,124,240,.24)", "&:hover": { bgcolor: "#066bcf", boxShadow: "0 5px 14px rgba(8,124,240,.3)" } }}>Add Staff</Button>}
        <Button variant="outlined" startIcon={<LockOutlinedIcon />} onClick={onApprovalPin} sx={{ minHeight: 44, px: { xs: 1.15, sm: 1.8 }, borderRadius: 1.45, bgcolor: "#fff", color: "#076ed8", borderColor: "#69aff5", borderWidth: 1.5, textTransform: "none", fontSize: { xs: 11.75, sm: 13.25 }, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 7px rgba(8,124,240,.09)", "&:hover": { bgcolor: "#edf6ff", borderColor: "#087cf0", borderWidth: 1.5, boxShadow: "0 3px 10px rgba(8,124,240,.14)" } }}>Approval PIN</Button>
      </Stack>
    </Box>
  );
}

export function BranchSelect({ branches, value, onChange, helper, fullWidth = false }) {
  return (
    <Box sx={{ width: fullWidth ? "100%" : { xs: "100%", md: 300 }, minWidth: 0 }}>
      <FormControl fullWidth>
        <Select value={value} onChange={(event) => onChange(event.target.value)} displayEmpty inputProps={{ "aria-label": "Branch" }} sx={selectSx} renderValue={(selected) => {
          const branch = branches.find((entry) => entry.id === selected);
          return <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}><BusinessRoundedIcon sx={{ color: "#42578b", fontSize: 20, flexShrink: 0 }} /><Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }}>{branch?.name || "Select branch"}</Typography></Stack>;
        }}>
          {branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
        </Select>
      </FormControl>
      {helper && <Typography color="text.secondary" sx={{ mt: .55, fontSize: 11.5 }}>{helper}</Typography>}
    </Box>
  );
}

function StaffAvatar({ name, size = 42 }) {
  const tone = avatarTone(name);
  return <Avatar sx={{ width: size, height: size, bgcolor: tone.background, color: tone.color, fontSize: size * .39, fontWeight: 800 }}>{initials(name)}</Avatar>;
}

export function RoleChip({ role, compact = false }) {
  const meta = ROLE_META[role] || ROLE_META.CASHIER;
  return <Chip label={meta.label} size="small" sx={{ width: "fit-content", height: compact ? 28 : 25, borderRadius: 1.1, bgcolor: meta.background, color: meta.color, fontSize: compact ? 12 : 11.75, fontWeight: 600, "& .MuiChip-label": { px: compact ? .9 : 1.1 } }} />;
}

export function StatusPill({ active, setLabel = false, compact = false }) {
  const good = Boolean(active);
  return (
    <Chip
      size="small"
      label={setLabel ? (good ? "Set" : "Setup Needed") : (good ? "Active" : "Inactive")}
      icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: good ? "#079455" : setLabel ? "#f59e0b" : "#f04438" }} />}
      sx={{ height: compact ? 25 : 28, width: "fit-content", borderRadius: 1.5, bgcolor: good ? "#e3f8ec" : setLabel ? "#fff3df" : "#ffe9ec", color: good ? "#067647" : setLabel ? "#ad5f00" : "#d92d20", fontSize: compact ? 11.25 : 12, fontWeight: 600, "& .MuiChip-icon": { width: compact ? 7 : 8, height: compact ? 7 : 8, ml: compact ? .65 : .8, mr: compact ? -.3 : -.15 }, "& .MuiChip-label": { px: compact ? .65 : .9 } }}
    />
  );
}

function SummaryCard({ label, value, icon, color, background }) {
  return (
    <Paper elevation={0} sx={{ ...surface, p: { xs: .9, sm: 1.3, md: 1.6 }, minHeight: { xs: 94, md: 92 }, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "48px minmax(0,1fr)", md: "54px minmax(0,1fr)" }, alignItems: "center", justifyItems: { xs: "center", sm: "stretch" }, textAlign: { xs: "center", sm: "left" }, gap: { xs: .5, sm: 1.1, md: 1.35 } }}>
      <Box sx={{ width: { xs: 36, sm: 48, md: 52 }, height: { xs: 36, sm: 48, md: 52 }, display: "grid", placeItems: "center", borderRadius: 1.4, bgcolor: background, color, "& .MuiSvgIcon-root": { fontSize: { xs: 22, sm: 27, md: 29 } } }}>{icon}</Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: { xs: "column-reverse", sm: "column" }, justifyContent: "center", gap: { xs: .25, sm: .45 } }}><Typography sx={{ color: "#344873", fontSize: { xs: 10.5, sm: 12.5 }, lineHeight: 1.2, fontWeight: 600 }}>{label}</Typography><Typography sx={{ color: "#101744", fontSize: { xs: 20, md: 23 }, lineHeight: 1, fontWeight: 700 }}>{value}</Typography></Box>
    </Paper>
  );
}

export function StaffTab({ rows, role, status, onRoleChange, onStatusChange, loading, error, onRetry, onEdit, onLogout }) {
  const isMobile = useMediaQuery("(max-width:768px)");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((member) => {
      const matchesQuery = !query || member.user?.name?.toLowerCase().includes(query) || member.user?.email?.toLowerCase().includes(query);
      const matchesRole = role === "all" || member.role === role;
      const matchesStatus = status === "all" || (status === "active" ? member.active : !member.active);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [role, rows, search, status]);
  const visibleRows = filtered;
  const activeCount = rows.filter((member) => member.active).length;
  const inactiveCount = rows.length - activeCount;
  const filtersActive = Boolean(search || role !== "all" || status !== "all");
  const clearFilters = () => { setSearch(""); onRoleChange("all"); onStatusChange("all"); };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <Stack spacing={{ xs: 1.5, md: 1.75 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: { xs: .65, sm: 1.1, md: 1.5 } }}>
        <SummaryCard label="Team Members" value={rows.length} icon={<GroupOutlinedIcon />} color="#087cf0" background="#e8f3ff" />
        <SummaryCard label="Active Members" value={activeCount} icon={<GroupOutlinedIcon />} color="#079455" background="#e5f8ed" />
        <SummaryCard label="Inactive Members" value={inactiveCount} icon={<PersonOffOutlinedIcon />} color="#f04438" background="#ffe8ec" />
      </Box>

      <Paper elevation={0} sx={{ ...surface, p: { xs: 0, md: 1.1 }, border: { xs: 0, md: "1px solid #dfe7f1" }, boxShadow: "none", bgcolor: "transparent" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(320px,1.8fr) repeat(2,minmax(170px,.8fr)) auto" }, gap: 1 }}>
          <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email..." fullWidth slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "#42578b" }} /></InputAdornment> } }} sx={{ "& .MuiOutlinedInput-root": { height: 44, borderRadius: 1.6, bgcolor: "#fff", fontSize: { xs: 13.5, md: 14 } } }} />
          <Box sx={{ display: { xs: "none", md: "contents" } }}>
            <Select value={role} onChange={(event) => onRoleChange(event.target.value)} sx={selectSx} inputProps={{ "aria-label": "Filter by role" }}><MenuItem value="all">All Roles</MenuItem>{Object.entries(ROLE_META).map(([key, meta]) => <MenuItem key={key} value={key}>{meta.label}</MenuItem>)}</Select>
            <Select value={status} onChange={(event) => onStatusChange(event.target.value)} sx={selectSx} inputProps={{ "aria-label": "Filter by status" }}><MenuItem value="all">All Status</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></Select>
          </Box>
          <Button onClick={clearFilters} disabled={!filtersActive} sx={{ display: { xs: "none", md: "inline-flex" }, minWidth: 72, minHeight: 42, textTransform: "none" }}>Clear</Button>
        </Box>
      </Paper>

      {!filtered.length ? <EmptyState title={rows.length ? "No staff match these filters." : "No staff yet."} /> : <Box>
        {!isMobile && <Box sx={{ px: 2, pb: 1, display: "grid", gridTemplateColumns: "minmax(44px,.5fr) repeat(5,minmax(0,1fr))", columnGap: 1.5, alignItems: "center" }}><Typography sx={desktopStaffCardLabelSx}>No</Typography><Typography sx={desktopStaffCardLabelSx}>Staff</Typography><Typography sx={desktopStaffCardLabelSx}>Role</Typography><Typography sx={desktopStaffCardLabelSx}>Status</Typography><Typography sx={desktopStaffCardLabelSx}>Last Login</Typography><Typography sx={{ ...desktopStaffCardLabelSx, textAlign: "right", pr: 1 }}>Actions</Typography></Box>}
        <Stack spacing={{ xs: 1, md: 1.15 }}>{visibleRows.map((member, index) => <StaffMemberCard key={member.id} member={member} number={index + 1} onEdit={onEdit} onLogout={onLogout} compact={isMobile} />)}</Stack>
      </Box>}
    </Stack>
  );
}

function StaffMemberCard({ member, number, onEdit, onLogout, compact }) {
  const owner = member.role === "OWNER";
  const [menuAnchor, setMenuAnchor] = useState(null);
  const lastLogin = member.user?.lastLoginAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(member.user.lastLoginAt)) : "Not available";
  if (!compact) {
    return (
      <Paper elevation={0} sx={{ ...surface, px: 2, py: 1.25, minWidth: 0, boxShadow: "0 2px 9px rgba(24,52,82,.07)" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(44px,.5fr) repeat(5,minmax(0,1fr))", columnGap: 1.5, alignItems: "center", minWidth: 0 }}>
          <Typography sx={{ color: "#61708d", fontSize: 13, fontWeight: 650 }}>{number}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: "center" }}><StaffAvatar name={member.user?.name} size={50} /><Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ color: "#101744", fontSize: 14.5, lineHeight: 1.3, fontWeight: 650 }}>{member.user?.name}</Typography><Typography noWrap color="text.secondary" sx={{ mt: .2, fontSize: 12 }}>{member.user?.email}</Typography></Box></Stack>
          <Box sx={{ justifySelf: "start" }}><RoleChip role={member.role} compact /></Box>
          <StatusPill active={member.active} />
          <Stack direction="row" spacing={.75} sx={{ minWidth: 0, alignItems: "center", color: "#61708d" }}><AccessTimeRoundedIcon sx={{ fontSize: 18, flexShrink: 0 }} /><Typography noWrap sx={{ fontSize: 12.25 }}>{lastLogin}</Typography></Stack>
          <Box sx={{ minHeight: 38, display: "grid", alignItems: "center", justifyItems: "end", pr: 1 }}><StaffActionsMenu member={member} owner={owner} anchor={menuAnchor} setAnchor={setMenuAnchor} onEdit={onEdit} onLogout={onLogout} /></Box>
        </Box>
      </Paper>
    );
  }
  return (
    <Paper elevation={0} sx={{ ...surface, p: { xs: 1.5, sm: 1.65 }, minWidth: 0, boxShadow: "0 2px 8px rgba(24,52,82,.07)" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", alignItems: "center", gap: { xs: .75, sm: 1 } }}>
        <StaffAvatar name={member.user?.name} size={42} />
        <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ color: "#101744", fontSize: { xs: 13.25, sm: 14.25 }, lineHeight: 1.3, fontWeight: 650 }}>{member.user?.name}</Typography><Typography noWrap color="text.secondary" sx={{ mt: .1, fontSize: { xs: 10.75, sm: 11.75 } }}>{member.user?.email}</Typography></Box>
        <StaffActionsMenu member={member} owner={owner} anchor={menuAnchor} setAnchor={setMenuAnchor} onEdit={onEdit} onLogout={onLogout} />
      </Box>
      <Box sx={{ mt: 1.25, pt: 1.15, display: "grid", gridTemplateColumns: "minmax(0,1fr) 1px minmax(0,1fr)", alignItems: "center", gap: { xs: .75, sm: 1.15 }, borderTop: "1px solid #edf1f6" }}>
        <StatusPill active={member.active} compact />
        <Box sx={{ width: 1, height: 34, bgcolor: "#e5ebf3" }} />
        <Box sx={{ minWidth: 0 }}><Stack direction="row" spacing={.6} sx={{ alignItems: "center", color: "#61708d" }}><AccessTimeRoundedIcon sx={{ fontSize: 16 }} /><Typography sx={{ fontSize: 11.25, fontWeight: 600 }}>Last Login</Typography></Stack><Typography noWrap color="text.secondary" sx={{ mt: .2, pl: 2.7, fontSize: 11.25 }}>{lastLogin}</Typography></Box>
      </Box>
    </Paper>
  );
}

function StaffActionsMenu({ member, owner, anchor, setAnchor, onEdit, onLogout }) {
  const close = () => setAnchor(null);
  return <><IconButton aria-label={`Actions for ${member.user?.name}`} onClick={(event) => setAnchor(event.currentTarget)} sx={{ width: 36, height: 36, borderRadius: 1.2, color: "#405587", bgcolor: "#edf3ff", "&:hover": { bgcolor: "#dfeaff" } }}><MoreVertRoundedIcon /></IconButton><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>{!owner && <MenuItem onClick={() => { close(); onEdit(member); }}><EditOutlinedIcon sx={{ mr: 1, fontSize: 19 }} />Edit</MenuItem>}<MenuItem disabled={!owner || !onLogout} title={owner ? "Sign out of this account" : "Remote staff logout requires backend session support"} onClick={() => { if (!owner || !onLogout) return; close(); void onLogout(); }}><LogoutRoundedIcon sx={{ mr: 1, fontSize: 19 }} />Logout</MenuItem></Menu></>;
}

const desktopStaffCardLabelSx = { color: "#61708d", fontSize: 11.5, lineHeight: 1.2, fontWeight: 600 };

const roleIcons = {
  MANAGER: <GroupOutlinedIcon />,
  CASHIER: <PointOfSaleOutlinedIcon />,
  STOCK_STAFF: <Inventory2OutlinedIcon />,
};

const permissionIcons = {
  sales: <ShoppingCartOutlinedIcon />,
  payments: <PaymentsOutlinedIcon />,
  inventory: <Inventory2OutlinedIcon />,
  products: <LocalOfferOutlinedIcon />,
  suppliers: <LocalShippingOutlinedIcon />,
  reports: <AssessmentOutlinedIcon />,
  settings: <SettingsOutlinedIcon />,
  audit: <FactCheckOutlinedIcon />,
};

export function PermissionsTab({ staged }) {
  const isMobile = useMediaQuery("(max-width:768px)");
  const roleMeta = ROLE_META[staged.role];
  return (
    <Stack spacing={1.25}>
      <Paper elevation={0} sx={{ ...surface, p: { xs: 1.2, md: 1.4 } }}>
        <Typography sx={{ mb: 1.1, color: "#101744", fontSize: 15.5, fontWeight: 650 }}>Role Permissions</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: { xs: .65, md: 1 } }}>{STAFF_ROLES.map((role) => <RoleChoice key={role} role={role} selected={staged.role === role} onClick={() => staged.selectRole(role)} compact={isMobile} />)}</Box>
      </Paper>
      <Box sx={{ minWidth: 0 }}>
          <Paper elevation={0} sx={{ ...surface, p: { xs: 1.25, md: 1.5 }, mb: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Stack direction="row" spacing={1.1} sx={{ minWidth: 0, alignItems: "center" }}><Box sx={{ width: 42, height: 42, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 1.4, color: roleMeta.color, bgcolor: roleMeta.background }}>{roleIcons[staged.role]}</Box><Typography sx={{ color: "#101744", fontSize: 16, fontWeight: 650 }}>{roleMeta.label}</Typography></Stack>
            <Button startIcon={<RestartAltRoundedIcon />} onClick={staged.resetToDefault} disabled={staged.resource.loading} sx={{ flexShrink: 0, textTransform: "none", fontWeight: 600, fontSize: { xs: 12, sm: 13 } }}>Reset to Default</Button>
          </Paper>
          {staged.saveError && <Alert severity="error" sx={{ mb: 1.25 }}>{staged.saveError}</Alert>}
          {staged.resource.loading ? <PermissionSkeleton /> : staged.resource.error ? <ErrorState error={staged.resource.error} onRetry={staged.resource.reload} /> : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "repeat(3,minmax(0,1fr))" }, gap: 1.25 }}>{PERMISSION_GROUPS.map((group) => <PermissionGroup key={group.id} group={group} permissions={staged.draftPermissions} onToggle={staged.togglePermission} />)}</Box>
          )}
      </Box>
      <PermissionActions staged={staged} />
    </Stack>
  );
}

function RoleChoice({ role, selected, onClick, compact = false }) {
  const meta = ROLE_META[role];
  return (
    <Button onClick={onClick} variant="outlined" sx={{ minWidth: 0, minHeight: compact ? 76 : 54, px: compact ? .4 : 1.1, flexDirection: compact ? "column" : "row", justifyContent: "center", gap: compact ? .4 : 1, borderColor: selected ? "#59a9ff" : "#e0e7f1", bgcolor: selected ? "#edf6ff" : "#fff", color: selected ? "#076ed8" : "#17204c", textTransform: "none", "&:hover": { borderColor: "#59a9ff", bgcolor: "#f4f9ff" } }}><Box sx={{ width: compact ? 32 : 34, height: compact ? 32 : 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 1.2, bgcolor: meta.background, color: meta.color, "& .MuiSvgIcon-root": { fontSize: compact ? 20 : 21 } }}>{roleIcons[role]}</Box><Typography sx={{ fontSize: compact ? 11.25 : 13.5, lineHeight: 1.15, fontWeight: 600, whiteSpace: compact ? "normal" : "nowrap" }}>{meta.label}</Typography></Button>
  );
}

function PermissionGroup({ group, permissions, onToggle }) {
  const isMobile = useMediaQuery("(max-width:768px)");
  return (
    <Paper elevation={0} sx={{ ...surface, p: { xs: 1.3, md: 1.5 }, minWidth: 0 }}>
      <Stack direction="row" spacing={1.1} sx={{ mb: 1, alignItems: "center" }}><Box sx={{ width: 38, height: 38, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 1.25, color: group.color, bgcolor: group.background }}>{permissionIcons[group.id]}</Box><Box sx={{ minWidth: 0 }}><Typography sx={{ color: "#101744", fontSize: 13.5, fontWeight: 650 }}>{group.title}</Typography>{isMobile && <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>{group.description}</Typography>}</Box></Stack>
      <Stack>{group.permissions.map(([key, label], index) => <Box key={key} sx={{ minHeight: 37, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, borderTop: index ? "1px solid #edf1f6" : 0 }}><Typography sx={{ color: "#344873", fontSize: 12.5, fontWeight: 400 }}>{label}</Typography><Switch size="small" checked={permissions.includes(key)} onChange={(event) => onToggle(key, event.target.checked)} slotProps={{ input: { "aria-label": `${label} permission` } }} /></Box>)}</Stack>
    </Paper>
  );
}

function PermissionSkeleton() {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3,1fr)" }, gap: 1.25 }}>{Array.from({ length: 6 }, (_value, index) => <Skeleton key={index} variant="rounded" height={190} />)}</Box>;
}

function PermissionActions({ staged }) {
  return (
    <Paper elevation={0} sx={{ ...surface, position: "sticky", bottom: { xs: 0, md: 12 }, zIndex: 5, p: 1, display: "grid", gridTemplateColumns: { xs: "1fr 1.45fr", md: "minmax(0,1fr) 138px 164px" }, gap: 1, boxShadow: "0 -4px 18px rgba(15,23,42,.08)" }}>
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, minHeight: { xs: staged.dirty ? 35 : 0, md: 42 }, display: staged.dirty ? "flex" : { xs: "none", md: "flex" }, alignItems: "center", px: 1.25, borderRadius: 1.2, bgcolor: staged.dirty ? "#fff7e8" : "transparent", color: "#b65d00" }}>{staged.dirty && <><Box sx={{ width: 9, height: 9, mr: 1, borderRadius: "50%", bgcolor: "#f5aa18" }} /><Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>You have unsaved changes</Typography></>}</Box>
      <Button variant="outlined" onClick={staged.cancel} disabled={!staged.dirty || staged.saving} sx={{ minHeight: 42, textTransform: "none", fontWeight: 700 }}>Cancel</Button>
      <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={() => void staged.save()} disabled={!staged.dirty || staged.saving} sx={{ minHeight: 42, textTransform: "none", fontWeight: 750, boxShadow: "none" }}>{staged.saving ? "Saving…" : "Save Changes"}</Button>
    </Paper>
  );
}

export function ManagerPinPanel({ onSetPin }) {
  return <Paper elevation={0} sx={{ ...surface, maxWidth: 620, p: 2.5 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><Box sx={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 1.6, bgcolor: "#e8f3ff", color: "primary.main" }}><LockOutlinedIcon sx={{ fontSize: 29 }} /></Box><Box><Typography sx={{ color: "#101744", fontSize: 20, fontWeight: 800 }}>Manager Approval PIN</Typography><Typography color="text.secondary" sx={{ mt: .25, fontSize: 13.5 }}>Use your individual PIN to approve sensitive actions in this branch.</Typography></Box></Stack><Button variant="contained" onClick={onSetPin} sx={{ mt: 2.25, minHeight: 44, textTransform: "none", fontWeight: 750 }}>Set or change PIN</Button></Paper>;
}
