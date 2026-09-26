import { useEffect, useState } from "react";
import { Alert, AppBar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { DesktopPanel } from "../../components/Desktop/DesktopUI";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import CustomerDialog from "./CustomerDialog";

const amount = (value) => Number(value ?? 0).toLocaleString("en-US");
const date = (value) => value ? new Date(value).toLocaleDateString() : "—";
const statusLabel = (status) => ({ LEGACY: "Historical", ON_TIME: "On Time", OPEN: "Open", OVERDUE: "Overdue", LATE: "Late" })[status] || status;

function InfoRow({ label, value }) {
  return <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.75 }}><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="body2" fontWeight={600} textAlign="right">{value ?? "—"}</Typography></Box>;
}

function Section({ title, children, mobile }) {
  if (mobile) return <Card sx={{ borderRadius: 2.5, boxShadow: "0 3px 9px rgba(15,23,42,.12)" }}><CardContent><Typography fontWeight={700} sx={{ mb: 1.25 }}>{title}</Typography>{children}</CardContent></Card>;
  return <DesktopPanel><Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1.5 }}>{title}</Typography>{children}</DesktopPanel>;
}

export default function CustomerDetailsPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:768px)");
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop, hasPermission } = useAuth();
  const canEdit = hasPermission("sale.create") || hasPermission("price.edit") || hasPermission("settings.manage");
  const canDelete = hasPermission("settings.manage");
  const [customer, setCustomer] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [reportState, setReportState] = useState(null);
  const report = reportState?.customerId === customerId ? reportState.value : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState(null);
  const visibleReportError = reportError?.customerId === customerId ? reportError.message : "";
  const [reloadKey, setReloadKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    api.customers.get(customerId).then(({ customer: value }) => {
      if (active) { setCustomer(value); setLoadedId(customerId); setError(""); setLoading(false); }
    }).catch((loadError) => {
      if (active) { setError(loadError.message || "Unable to load customer."); setLoadedId(customerId); setLoading(false); }
    });
    api.customers.creditReport(customerId).then(({ report: value }) => { if (active) { setReportState({ customerId, value }); setReportError(null); } })
      .catch((loadError) => { if (active) setReportError({ customerId, message: loadError.message || "Unable to load the credit report." }); });
    return () => { active = false; };
  }, [api, customerId, reloadKey]);

  const deleteCustomer = async () => {
    if (!customer || !canDelete || customer.hasHistory) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.customers.remove(customer.id);
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      navigate("/customers");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete customer.");
    } finally { setDeleteBusy(false); }
  };

  if (loading || loadedId !== customerId) return <Box sx={{ p: 3 }}><Typography>Loading customer…</Typography></Box>;
  if (error || !customer) return <Box sx={{ p: 3 }}><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/customers")}>Customers</Button><Alert severity="error" sx={{ mt: 2 }}>{error || "Customer not found."}</Alert></Box>;

  const headerActions = <>
    {!isMobile && canEdit && <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditorOpen(true)} sx={{ textTransform: "none" }}>Edit</Button>}
    {(canDelete || (isMobile && canEdit)) && <IconButton aria-label="Customer actions" onClick={(event) => setMenuAnchor(event.currentTarget)} color={isMobile ? "inherit" : "default"}><MoreVertRoundedIcon /></IconButton>}
  </>;
  const hasLegacy = report?.recentInvoices?.some((invoice) => invoice.status === "LEGACY");
  const recentInvoices = report?.recentInvoices || [];

  return <Box sx={isMobile ? { minHeight: "100vh", bgcolor: "#f8fafc", px: 2, pb: 3 } : { width: "100%", minWidth: 0, py: 1 }}>
    <CustomerDialog open={editorOpen} customer={customer} onClose={() => setEditorOpen(false)} onSaved={(saved) => { setCustomer(saved); setReportState(null); setReloadKey((key) => key + 1); }} />
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
      {isMobile && canEdit && <MenuItem onClick={() => { setMenuAnchor(null); setEditorOpen(true); }}><EditOutlinedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>}
      {canDelete && <MenuItem disabled={customer.hasHistory} title={customer.hasHistory ? "Customer has transaction history and cannot be deleted." : undefined} onClick={() => { setMenuAnchor(null); setDeleteError(""); setDeleteOpen(true); }}><DeleteOutlineRoundedIcon sx={{ mr: 1.5 }} />Delete</MenuItem>}
    </Menu>
    <Dialog open={deleteOpen} onClose={deleteBusy ? undefined : () => setDeleteOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Delete "{customer.name}"?</DialogTitle>
      <DialogContent dividers><Typography>This customer has no transaction history.</Typography>{deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</Button><Button color="error" variant="contained" onClick={deleteCustomer} disabled={deleteBusy}>Delete</Button></DialogActions>
    </Dialog>

    {isMobile ? <AppBar position="sticky" elevation={0} sx={{ mx: -2, mb: 2, width: "calc(100% + 32px)", bgcolor: "#1976d2" }}><Toolbar sx={{ minHeight: 64, gap: 1 }}>
      <IconButton aria-label="Back to Customers" onClick={() => navigate("/customers")} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700 }}>{customer.name}</Typography>{headerActions}
    </Toolbar></AppBar> : <Box sx={{ mb: 2 }}>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/customers")} sx={{ textTransform: "none" }}>Customers</Button>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}><Typography variant="h5" fontWeight={700}>{customer.name}</Typography><Box>{headerActions}</Box></Box>
    </Box>}
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: "wrap" }}>
      <Chip size="small" label={customer.pricingType === "WHOLESALE" ? "Wholesale" : "Retail"} color={customer.pricingType === "WHOLESALE" ? "primary" : "default"} />
      {customer.phone && <Typography variant="body2" color="text.secondary">{customer.phone}</Typography>}
    </Stack>

    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 2 }}>
        <Section title="Customer Information" mobile={isMobile}>
          <InfoRow label="Phone" value={customer.phone || "—"} /><InfoRow label="Address" value={customer.address || "—"} /><InfoRow label="City" value={customer.city || "—"} /><InfoRow label="Pricing Type" value={customer.pricingType === "WHOLESALE" ? "Wholesale" : "Retail"} />
        </Section>
        <Section title="Commercial Terms" mobile={isMobile}>
          <InfoRow label="Credit Limit" value={amount(customer.effectiveCreditLimit)} /><InfoRow label="Payment Terms" value={`${customer.effectivePaymentTermsDays ?? 30} days`} /><InfoRow label="Limit Source" value={customer.creditLimitOverride == null ? "Shop Default" : "Custom"} /><InfoRow label="Terms Source" value={customer.paymentTermsDaysOverride == null ? "Shop Default" : "Custom"} />
        </Section>
      </Box>
      {visibleReportError && <Alert severity="warning">{visibleReportError}</Alert>}
      {report && <>
        <Section title="Credit Summary" mobile={isMobile}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
            {[["Credit Limit", report.effectiveCreditLimit], ["Outstanding", report.outstanding], ["Available Credit", report.availableCredit], ["Overdue", report.overdueAmount]].map(([label, value]) => <Paper key={label} variant="outlined" sx={{ p: 1.5, borderRadius: 2, minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography sx={{ fontSize: { xs: 18, sm: 23 }, fontWeight: 700, overflowWrap: "anywhere" }}>{amount(value)}</Typography></Paper>)}
          </Box>
        </Section>
        <Section title="Payment Behavior" mobile={isMobile}>
          {report.creditInvoices ? <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", columnGap: 3 }}>
            <InfoRow label="Credit Invoices" value={report.creditInvoices} /><InfoRow label="Paid On Time" value={report.paidOnTime} /><InfoRow label="Paid Late" value={report.paidLate} /><InfoRow label="Currently Overdue" value={report.currentlyOverdue} /><InfoRow label="Average Days Late" value={Number(report.averageDaysLate ?? 0).toFixed(1)} /><InfoRow label="Longest Delay" value={`${report.longestDelay ?? 0} days`} /><InfoRow label="Last Credit Payment" value={date(report.lastPayment)} />
          </Box> : <Stack spacing={1}><Typography variant="body2" color="text.secondary">No tracked credit payment history yet.</Typography>{report.lastPayment && <InfoRow label="Last Credit Payment" value={date(report.lastPayment)} />}</Stack>}
          {hasLegacy && <Typography variant="caption" color="text.secondary">Older credit records without a recorded due date are excluded from on-time/late statistics.</Typography>}
        </Section>
        <Section title="Recent Credit Invoices" mobile={isMobile}>
          {!recentInvoices.length ? <Typography variant="body2" color="text.secondary">No credit invoices yet.</Typography> : isMobile ? <Stack spacing={1.25}>{recentInvoices.map((invoice) => <Paper key={invoice.orderId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.75 }}><Typography fontWeight={700}>#{invoice.orderNumber || invoice.orderId}</Typography><Typography variant="body2" fontWeight={700}>{statusLabel(invoice.status)}</Typography></Box>
            <InfoRow label="Amount" value={amount(invoice.effectiveAmount)} /><InfoRow label="Outstanding" value={amount(invoice.outstanding)} /><InfoRow label="Due" value={invoice.dueAt ? date(invoice.dueAt) : "Not recorded"} /><InfoRow label="Paid" value={date(invoice.finalPaidAt)} />{invoice.daysLate > 0 && <InfoRow label="Delay" value={`${invoice.daysLate} days`} />}
          </Paper>)}</Stack> : <TableContainer><Table size="small"><TableHead><TableRow>{["Invoice", "Amount", "Outstanding", "Due", "Paid", "Status"].map((heading) => <TableCell key={heading}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{recentInvoices.map((invoice) => <TableRow key={invoice.orderId}><TableCell>#{invoice.orderNumber || invoice.orderId}</TableCell><TableCell>{amount(invoice.effectiveAmount)}</TableCell><TableCell>{amount(invoice.outstanding)}</TableCell><TableCell>{invoice.dueAt ? date(invoice.dueAt) : "Not recorded"}</TableCell><TableCell>{date(invoice.finalPaidAt)}</TableCell><TableCell>{statusLabel(invoice.status)}{invoice.daysLate > 0 ? ` · ${invoice.daysLate} days` : ""}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
        </Section>
      </>}
    </Stack>
  </Box>;
}
