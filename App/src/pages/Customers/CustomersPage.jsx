import { useMemo, useState } from "react";
import { Alert, AppBar, Box, Button, Card, CardContent, Divider, Fab, IconButton, InputAdornment, Menu, MenuItem, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { DesktopPanel } from "../../components/Desktop/DesktopUI";
import { useAuth } from "../../context/AuthContext";
import { useAllCustomersQuery } from "../../hooks/usePosQueries";
import CustomerDialog from "./CustomerDialog";
import { useNavigate } from "react-router";

const valueOrDash = (value) => value || "—";
const formatKyat = (amount) => `${new Intl.NumberFormat("en-US").format(amount ?? 0)} \u1000\u103b\u1015\u103a`;
const desktopGrid = { display: "grid", gridTemplateColumns: "48px minmax(140px,1.2fr) minmax(110px,.85fr) minmax(170px,1.3fr) minmax(90px,.7fr) 65px minmax(125px,.8fr) 80px", gap: 2, alignItems: "center", px: 2 };

export default function CustomersPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sale.create");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuCustomer, setMenuCustomer] = useState(null);
  const { data, error, isLoading } = useAllCustomersQuery({ includeStats: true });
  const customers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.customers || []).filter((customer) => !query || [customer.name, customer.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)));
  }, [data, search]);
  const openEdit = (customer) => {
    setEditor(customer);
    setMenuAnchor(null);
    setMenuCustomer(null);
  };
  const editorDialog = <CustomerDialog open={editor !== null} customer={editor?.id ? editor : null} onClose={() => setEditor(null)} />;

  if (!isMobile) return (
    <Box sx={{ width: "100%", minWidth: 0, py: 1 }}>
      {editorDialog}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2 }}>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} sx={{ width: 420, maxWidth: "100%" }} />
        {canEdit && <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditor({})} sx={{ minHeight: 44, px: 2.25, borderRadius: 2, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>Add Customer</Button>}
      </Box>
      <DesktopPanel>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 1000 }}>
            <Box sx={{ ...desktopGrid, py: 1.5 }}>
              {["NO.", "CUSTOMER", "PHONE", "ADDRESS", "CITY", "VISITS", "AMOUNT", "ACTIONS"].map((label) => <Typography key={label} color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>{label}</Typography>)}
            </Box>
            <Divider />
            {customers.map((customer, index) => <Box key={customer.id} sx={{ ...desktopGrid, py: 1.5, minHeight: 64, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 600 }}>{index + 1}</Typography>
              <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 600 }}>{customer.name}</Typography>
              <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 500 }}>{valueOrDash(customer.phone)}</Typography>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 14 }}>{valueOrDash(customer.address)}</Typography>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 14, fontWeight: 500 }}>{valueOrDash(customer.city)}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{customer.visitCount ?? 0}</Typography>
              <Typography noWrap sx={{ minWidth: 0, fontSize: 14, fontWeight: 700 }}>{formatKyat(customer.totalAmount)}</Typography>
              {canEdit && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(customer)} sx={{ textTransform: "none" }}>Edit</Button>}
            </Box>)}
          </Box>
        </Box>
        {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
      </DesktopPanel>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", px: 2, pb: canEdit ? 12 : 2.5, overflowX: "hidden" }}>
      {editorDialog}
      <AppBar position="sticky" elevation={0} sx={{ mx: -2, mb: 2, width: "calc(100% + 32px)", bgcolor: "#1976d2" }}>
        <Toolbar sx={{ minHeight: 64, position: "relative" }}>
          <IconButton aria-label="Back to More" onClick={() => navigate("/settings")} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton>
          <Typography noWrap align="center" sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 21, fontWeight: 700 }}>Customers</Typography>
        </Toolbar>
      </AppBar>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} sx={{ mb: 2, "& .MuiOutlinedInput-root": { bgcolor: "#fff", borderRadius: 2 } }} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
      <Card sx={{ borderRadius: 2.5, boxShadow: "0 3px 9px rgba(15,23,42,.12)", overflow: "hidden" }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          {customers.map((customer, index) => <Box key={customer.id} sx={{ px: 2, py: 1.4, minWidth: 0, borderBottom: index < customers.length - 1 ? "1px solid" : 0, borderColor: "divider" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 42%)", gap: 1.5, minWidth: 0 }}>
              <Typography noWrap sx={{ minWidth: 0, fontSize: 15, fontWeight: 700 }}>{customer.name}</Typography>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 500 }}>{valueOrDash(customer.phone)}</Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: canEdit ? "minmax(0, 1fr) minmax(0, 30%) 32px" : "minmax(0, 1fr) minmax(0, 35%)", gap: 1, alignItems: "center", minWidth: 0, mt: .45 }}>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 13 }}>{valueOrDash(customer.address)}</Typography>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 500 }}>{valueOrDash(customer.city)}</Typography>
              {canEdit && <IconButton aria-label={`Actions for ${customer.name}`} size="small" onClick={(event) => { setMenuAnchor(event.currentTarget); setMenuCustomer(customer); }}><MoreVertRoundedIcon fontSize="small" /></IconButton>}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 60%)", gap: 1, minWidth: 0, mt: .45 }}>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>Visits {customer.visitCount ?? 0}</Typography>
              <Typography noWrap sx={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, textAlign: "right" }}>{formatKyat(customer.totalAmount)}</Typography>
            </Box>
          </Box>)}
          {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
        </CardContent>
      </Card>
      {canEdit && <Fab aria-label="Add Customer" color="primary" onClick={() => setEditor({})} sx={{ position: "fixed", right: 26, bottom: 24, bgcolor: "#ff5a36", "&:hover": { bgcolor: "#e94c2b" } }}><AddRoundedIcon /></Fab>}
      {canEdit && <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => openEdit(menuCustomer)}><EditOutlinedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>
      </Menu>}
    </Box>
  );
}
