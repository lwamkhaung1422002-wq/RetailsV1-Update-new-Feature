import { useMemo, useState } from "react";
import { Alert, AppBar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Fab, IconButton, InputAdornment, Menu, MenuItem, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { DesktopPanel } from "../../components/Desktop/DesktopUI";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { useAllCustomersQuery } from "../../hooks/usePosQueries";
import CreditDefaultsDialog from "./CreditDefaultsDialog";
import CustomerDialog from "./CustomerDialog";
import CustomerDetailsPage from "./CustomerDetailsPage";

const valueOrDash = (value) => value || "—";
const formatKyat = (amount) => `${new Intl.NumberFormat("en-US").format(amount ?? 0)} \u1000\u103b\u1015\u103a`;
const desktopGrid = { display: "grid", gridTemplateColumns: "48px minmax(140px,1.2fr) minmax(110px,.85fr) minmax(170px,1.3fr) minmax(90px,.7fr) 65px minmax(125px,.8fr) 80px", gap: 2, alignItems: "center", px: 2 };

export default function CustomersPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop, hasPermission } = useAuth();
  const canAdd = hasPermission("sale.create");
  const canManageCredit = hasPermission("settings.manage");
  const canEdit = canAdd || hasPermission("price.edit") || canManageCredit;
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [creditDefaultsOpen, setCreditDefaultsOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuCustomer, setMenuCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [detailsCustomerId, setDetailsCustomerId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { data, error, isLoading } = useAllCustomersQuery({ includeStats: true });
  const customers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.customers || []).filter((customer) => !query || [customer.name, customer.phone]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [data, search]);

  const openMenu = (event, customer) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuCustomer(customer);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuCustomer(null); };
  const openEdit = (customer) => { setEditor(customer); closeMenu(); };
  const confirmDelete = async () => {
    if (!deletingCustomer || !canManageCredit || deletingCustomer.hasHistory) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.customers.remove(deletingCustomer.id);
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      setDeletingCustomer(null);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete customer.");
    } finally { setDeleteBusy(false); }
  };
  const searchField = <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} sx={isMobile ? { mb: 2, width: "100%", "& .MuiOutlinedInput-root": { bgcolor: "#fff", borderRadius: 2 } } : { width: 420, maxWidth: "100%", flex: "1 1 420px" }} />;
  const dialogs = <>
    <CustomerDialog open={editor !== null} customer={editor?.id ? editor : null} onClose={() => setEditor(null)} />
    {!isMobile && detailsCustomerId && <CustomerDetailsPage customerId={detailsCustomerId} onClose={() => setDetailsCustomerId(null)} />}
    {creditDefaultsOpen && <CreditDefaultsDialog open onClose={() => setCreditDefaultsOpen(false)} />}
    <Dialog open={Boolean(deletingCustomer)} onClose={deleteBusy ? undefined : () => setDeletingCustomer(null)} fullWidth maxWidth="xs">
      <DialogTitle>Delete "{deletingCustomer?.name}"?</DialogTitle>
      <DialogContent dividers><Typography>This customer has no transaction history.</Typography>{deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setDeletingCustomer(null)} disabled={deleteBusy}>Cancel</Button><Button color="error" variant="contained" onClick={confirmDelete} disabled={deleteBusy}>Delete</Button></DialogActions>
    </Dialog>
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
      {canEdit && <MenuItem onClick={() => openEdit(menuCustomer)}><EditOutlinedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>}
      {canManageCredit && <MenuItem disabled={Boolean(menuCustomer?.hasHistory)} title={menuCustomer?.hasHistory ? "Customer has transaction history and cannot be deleted." : undefined} onClick={() => { setDeletingCustomer(menuCustomer); setDeleteError(""); closeMenu(); }}><DeleteOutlineRoundedIcon sx={{ mr: 1.5 }} />Delete</MenuItem>}
    </Menu>
  </>;

  if (!isMobile) return <Box sx={{ width: "100%", minWidth: 0, py: 1 }}>
    {dialogs}
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
      {searchField}
      {canManageCredit && <Button variant="outlined" onClick={() => setCreditDefaultsOpen(true)} sx={{ minHeight: 44, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>Credit Defaults</Button>}
      {canAdd && <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditor({})} sx={{ minHeight: 44, px: 2.25, borderRadius: 2, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>Add Customer</Button>}
    </Box>
    <DesktopPanel>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
      <Box sx={{ overflowX: "auto" }}><Box sx={{ minWidth: 1000 }}>
        <Box sx={{ ...desktopGrid, py: 1.5 }}>{["NO.", "CUSTOMER", "PHONE", "ADDRESS", "CITY", "VISITS", "AMOUNT", "ACTIONS"].map((label) => <Typography key={label} color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>{label}</Typography>)}</Box>
        <Divider />
        {customers.map((customer, index) => <Box key={customer.id} role="button" tabIndex={0} aria-label={`View ${customer.name}`} onClick={() => setDetailsCustomerId(customer.id)} onKeyDown={(event) => { if (event.key === "Enter") setDetailsCustomerId(customer.id); }} sx={{ ...desktopGrid, py: 1.5, minHeight: 64, borderBottom: "1px solid", borderColor: "divider", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
          <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 600 }}>{index + 1}</Typography>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 600 }}>{customer.name}</Typography>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 500 }}>{valueOrDash(customer.phone)}</Typography>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 14 }}>{valueOrDash(customer.address)}</Typography>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 14, fontWeight: 500 }}>{valueOrDash(customer.city)}</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{customer.visitCount ?? 0}</Typography>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 700 }}>{formatKyat(customer.totalAmount)}</Typography>
          {(canEdit || canManageCredit) && <IconButton aria-label={`Actions for ${customer.name}`} size="small" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => openMenu(event, customer)}><MoreVertRoundedIcon fontSize="small" /></IconButton>}
        </Box>)}
      </Box></Box>
      {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
    </DesktopPanel>
  </Box>;

  return <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", px: 2, pb: canAdd ? 12 : 2.5, overflowX: "hidden" }}>
    {dialogs}
    <AppBar position="sticky" elevation={0} sx={{ mx: -2, mb: 2, width: "calc(100% + 32px)", bgcolor: "#1976d2" }}><Toolbar sx={{ minHeight: 64, position: "relative", justifyContent: "space-between", px: 1 }}>
      <IconButton aria-label="Back to More" onClick={() => navigate("/settings")} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton>
      <Typography noWrap align="center" sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 21, fontWeight: 700 }}>Customers</Typography>
      {canManageCredit ? <Button color="inherit" size="small" onClick={() => setCreditDefaultsOpen(true)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: 0.5, whiteSpace: "nowrap", ml: "auto" }}>Credit Defaults</Button> : <Box sx={{ width: 40 }} />}
    </Toolbar></AppBar>
    {searchField}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
    <Card sx={{ borderRadius: 2.5, boxShadow: "0 3px 9px rgba(15,23,42,.12)", overflow: "hidden" }}><CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
      {customers.map((customer, index) => <Box key={customer.id} role="button" tabIndex={0} aria-label={`View ${customer.name}`} onClick={() => navigate(`/customers/${customer.id}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/customers/${customer.id}`); }} sx={{ px: 2, py: 1.4, minWidth: 0, cursor: "pointer", borderBottom: index < customers.length - 1 ? "1px solid" : 0, borderColor: "divider" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 42%)", gap: 1.5, minWidth: 0 }}>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 15, fontWeight: 700 }}>{customer.name}</Typography>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 500 }}>{valueOrDash(customer.phone)}</Typography>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: canEdit || canManageCredit ? "minmax(0, 1fr) minmax(0, 30%) 32px" : "minmax(0, 1fr) minmax(0, 35%)", gap: 1, alignItems: "center", minWidth: 0, mt: .45 }}>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 13 }}>{valueOrDash(customer.address)}</Typography>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 500 }}>{valueOrDash(customer.city)}</Typography>
          {(canEdit || canManageCredit) && <IconButton aria-label={`Actions for ${customer.name}`} size="small" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => openMenu(event, customer)}><MoreVertRoundedIcon fontSize="small" /></IconButton>}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 60%)", gap: 1, minWidth: 0, mt: .45 }}>
          <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>Visits {customer.visitCount ?? 0}</Typography>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, textAlign: "right" }}>{formatKyat(customer.totalAmount)}</Typography>
        </Box>
      </Box>)}
      {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
    </CardContent></Card>
    {canAdd && <Fab aria-label="Add Customer" color="primary" onClick={() => setEditor({})} sx={{ position: "fixed", right: 26, bottom: 24, bgcolor: "#ff5a36", "&:hover": { bgcolor: "#e94c2b" } }}><AddRoundedIcon /></Fab>}
  </Box>;
}
