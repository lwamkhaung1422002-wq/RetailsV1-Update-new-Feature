import { useMemo, useState } from "react";
import { Alert, AppBar, Box, Button, Card, CardContent, Divider, IconButton, InputAdornment, Menu, MenuItem, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { DesktopPage, DesktopPanel } from "../../components/Desktop/DesktopUI";
import { useAllCustomersQuery } from "../../hooks/usePosQueries";
import CustomerDialog from "./CustomerDialog";
import { useNavigate } from "react-router";

const valueOrDash = (value) => value || "—";

export default function CustomersPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuCustomer, setMenuCustomer] = useState(null);
  const { data, error, isLoading } = useAllCustomersQuery();
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
    <DesktopPage title="Customers" subtitle="Manage saved customer contact information." actionLabel="Add Customer" onAction={() => setEditor({})}>
      {editorDialog}
      <DesktopPanel>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} sx={{ width: 420, maxWidth: "100%", mb: 2.5 }} />
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(210px,1.2fr) minmax(150px,.8fr) minmax(220px,1.3fr) minmax(130px,.7fr) 84px", gap: 2, px: 2, py: 1.5 }}>
          {["CUSTOMER NAME", "PHONE", "ADDRESS", "CITY", "ACTIONS"].map((label) => <Typography key={label} color="text.secondary" sx={{ fontSize: 12, fontWeight: 700 }}>{label}</Typography>)}
        </Box>
        <Divider />
        {customers.map((customer) => <Box key={customer.id} sx={{ display: "grid", gridTemplateColumns: "minmax(210px,1.2fr) minmax(150px,.8fr) minmax(220px,1.3fr) minmax(130px,.7fr) 84px", gap: 2, alignItems: "center", px: 2, py: 1.5, minHeight: 64, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography noWrap fontWeight={700}>{customer.name}</Typography>
          <Typography noWrap>{valueOrDash(customer.phone)}</Typography>
          <Typography noWrap>{valueOrDash(customer.address)}</Typography>
          <Typography noWrap>{valueOrDash(customer.city)}</Typography>
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(customer)} sx={{ textTransform: "none" }}>Edit</Button>
        </Box>)}
        {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
      </DesktopPanel>
    </DesktopPage>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", px: 2, pb: 2.5, overflowX: "hidden" }}>
      {editorDialog}
      <AppBar position="sticky" elevation={0} sx={{ mx: -2, mb: 2, width: "calc(100% + 32px)", bgcolor: "#1976d2" }}>
        <Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) auto", gap: 1 }}>
          <IconButton aria-label="Back to More" onClick={() => navigate("/settings")} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton>
          <Typography noWrap align="center" sx={{ fontSize: 21, fontWeight: 700 }}>Customers</Typography>
          <Button color="inherit" startIcon={<AddRoundedIcon />} onClick={() => setEditor({})} sx={{ textTransform: "none", whiteSpace: "nowrap" }}>Add</Button>
        </Toolbar>
      </AppBar>
      <TextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} sx={{ mb: 2, "& .MuiOutlinedInput-root": { bgcolor: "#fff", borderRadius: 2 } }} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message || "Unable to load customers."}</Alert>}
      <Card sx={{ borderRadius: 2.5, boxShadow: "0 3px 9px rgba(15,23,42,.12)", overflow: "hidden" }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          {customers.map((customer, index) => <Box key={customer.id} sx={{ px: 2, py: 1.4, minWidth: 0, borderBottom: index < customers.length - 1 ? "1px solid" : 0, borderColor: "divider" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1.5, minWidth: 0 }}>
              <Typography noWrap fontWeight={700} sx={{ minWidth: 0 }}>{customer.name}</Typography>
              <Typography noWrap color="text.secondary" sx={{ maxWidth: "38vw", overflow: "hidden", textOverflow: "ellipsis" }}>{valueOrDash(customer.phone)}</Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto 32px", gap: 1, alignItems: "center", minWidth: 0, mt: .45 }}>
              <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 14 }}>{valueOrDash(customer.address)}</Typography>
              <Typography noWrap color="text.secondary" sx={{ maxWidth: "28vw", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }}>{valueOrDash(customer.city)}</Typography>
              <IconButton aria-label={`Actions for ${customer.name}`} size="small" onClick={(event) => { setMenuAnchor(event.currentTarget); setMenuCustomer(customer); }}><MoreVertRoundedIcon fontSize="small" /></IconButton>
            </Box>
          </Box>)}
          {!isLoading && !customers.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>No customers found.</Typography>}
        </CardContent>
      </Card>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => openEdit(menuCustomer)}><EditOutlinedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>
      </Menu>
    </Box>
  );
}
