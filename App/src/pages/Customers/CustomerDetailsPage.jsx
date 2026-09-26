import { useEffect, useState } from "react";
import { Alert, AppBar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import CustomerDialog from "./CustomerDialog";

const amount = (value) => Number(value ?? 0).toLocaleString("en-US");
const date = (value) => value ? new Date(value).toLocaleDateString() : "—";
const statusLabel = (status) => ({ LEGACY: "Historical", ON_TIME: "On Time", OPEN: "Open", OVERDUE: "Overdue", LATE: "Late" })[status] || status;

function InfoRow({ label, value }) {
  return <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.65, minWidth: 0 }}>
    <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>{label}</Typography>
    <Typography sx={{ fontSize: 14, fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value ?? "—"}</Typography>
  </Box>;
}

function TermRow({ label, value, source }) {
  return <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.7, minWidth: 0 }}>
    <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>{label}</Typography>
    <Box sx={{ textAlign: "right", minWidth: 0 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>{source}</Typography>
    </Box>
  </Box>;
}

function Section({ title, children }) {
  return <Card variant="outlined" sx={{ borderRadius: 2.5, boxShadow: "0 2px 7px rgba(15,23,42,.05)", minWidth: 0 }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.25 }, "&:last-child": { pb: { xs: 2, sm: 2.25 } } }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1.1 }}>{title}</Typography>
      {children}
    </CardContent>
  </Card>;
}

function CustomerDetailsContent({ customer, report, reportError, isMobile }) {
  const hasLegacy = report?.recentInvoices?.some((invoice) => invoice.status === "LEGACY");
  const recentInvoices = report?.recentInvoices || [];
  return <Stack spacing={1.75} sx={{ minWidth: 0 }}>
    <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: 1.75 }}>
      <Section title="Customer Information">
        <InfoRow label="Name" value={customer.name || "—"} />
        <InfoRow label="Phone" value={customer.phone || "—"} />
        <InfoRow label="Address" value={customer.address || "—"} />
        <InfoRow label="City" value={customer.city || "—"} />
        <InfoRow label="Pricing Type" value={customer.pricingType === "WHOLESALE" ? "Wholesale" : "Retail"} />
      </Section>
      <Section title="Commercial Terms">
        <TermRow label="Credit Limit" value={amount(customer.effectiveCreditLimit)} source={customer.creditLimitOverride == null ? "Shop Default" : "Custom"} />
        <TermRow label="Payment Terms" value={`${customer.effectivePaymentTermsDays ?? 30} days`} source={customer.paymentTermsDaysOverride == null ? "Shop Default" : "Custom"} />
      </Section>
    </Box>
    {reportError && <Alert severity="warning">{reportError}</Alert>}
    {report && <>
      <Section title="Credit Summary">
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.25 }}>
          {[["Credit Limit", report.effectiveCreditLimit], ["Outstanding", report.outstanding], ["Available Credit", report.availableCredit], ["Overdue", report.overdueAmount]].map(([label, value]) => <Box key={label} sx={{ p: 1.35, borderRadius: 2, bgcolor: "action.hover", minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: isMobile ? 20 : 21, fontWeight: 700, overflowWrap: "anywhere" }}>{amount(value)}</Typography>
          </Box>)}
        </Box>
      </Section>
      <Section title="Payment Behavior">
        {report.creditInvoices ? <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", columnGap: 3 }}>
          <InfoRow label="Credit Invoices" value={report.creditInvoices} /><InfoRow label="Paid On Time" value={report.paidOnTime} /><InfoRow label="Paid Late" value={report.paidLate} /><InfoRow label="Currently Overdue" value={report.currentlyOverdue} /><InfoRow label="Average Days Late" value={Number(report.averageDaysLate ?? 0).toFixed(1)} /><InfoRow label="Longest Delay" value={`${report.longestDelay ?? 0} days`} /><InfoRow label="Last Credit Payment" value={date(report.lastPayment)} />
        </Box> : <Stack spacing={1}><Typography sx={{ fontSize: 13, color: "text.secondary" }}>No tracked credit payment history yet.</Typography>{report.lastPayment && <InfoRow label="Last Credit Payment" value={date(report.lastPayment)} />}</Stack>}
        {hasLegacy && <Typography sx={{ display: "block", mt: 1, fontSize: 12.5, fontWeight: 400, color: "text.secondary" }}>Older credit records without a recorded due date are excluded from on-time/late statistics.</Typography>}
      </Section>
      <Section title="Recent Credit Invoices">
        {!recentInvoices.length ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No credit invoices yet.</Typography> : isMobile ? <Stack spacing={1.25}>{recentInvoices.map((invoice) => <Box key={invoice.orderId} sx={{ p: 1.35, border: "1px solid", borderColor: "divider", borderRadius: 2, minWidth: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.6 }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>#{invoice.orderNumber || invoice.orderId}</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{statusLabel(invoice.status)}</Typography></Box>
          <InfoRow label="Amount" value={amount(invoice.effectiveAmount)} /><InfoRow label="Outstanding" value={amount(invoice.outstanding)} /><InfoRow label="Due" value={invoice.dueAt ? date(invoice.dueAt) : "Not recorded"} /><InfoRow label="Paid" value={date(invoice.finalPaidAt)} />{invoice.daysLate > 0 && <InfoRow label="Delay" value={`${invoice.daysLate} days`} />}
        </Box>)}</Stack> : <TableContainer sx={{ maxWidth: "100%" }}><Table size="small" sx={{ "& .MuiTableCell-root": { px: 1, py: 0.9, fontSize: 12.5, whiteSpace: "nowrap" } }}><TableHead><TableRow>{["Invoice", "Amount", "Outstanding", "Due", "Paid", "Status"].map((heading) => <TableCell key={heading}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{recentInvoices.map((invoice) => <TableRow key={invoice.orderId}><TableCell sx={{ fontWeight: 700 }}>#{invoice.orderNumber || invoice.orderId}</TableCell><TableCell>{amount(invoice.effectiveAmount)}</TableCell><TableCell>{amount(invoice.outstanding)}</TableCell><TableCell>{invoice.dueAt ? date(invoice.dueAt) : "Not recorded"}</TableCell><TableCell>{date(invoice.finalPaidAt)}</TableCell><TableCell>{statusLabel(invoice.status)}{invoice.daysLate > 0 ? ` · ${invoice.daysLate} days` : ""}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
      </Section>
    </>}
  </Stack>;
}

export default function CustomerDetailsPage({ customerId: selectedCustomerId, onClose }) {
  const { customerId: routeCustomerId } = useParams();
  const customerId = selectedCustomerId || routeCustomerId;
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
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState(null);
  const visibleReportError = reportError?.customerId === customerId ? reportError.message : "";
  const [reloadKey, setReloadKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const visibleCustomer = loadedId === customerId && !error ? customer : null;
  const closeDetails = () => onClose ? onClose() : navigate("/customers");

  useEffect(() => {
    let active = true;
    api.customers.get(customerId).then(({ customer: value }) => {
      if (active) { setCustomer(value); setLoadedId(customerId); setError(""); }
    }).catch((loadError) => {
      if (active) { setError(loadError.message || "Unable to load customer."); setLoadedId(customerId); }
    });
    api.customers.creditReport(customerId).then(({ report: value }) => { if (active) { setReportState({ customerId, value }); setReportError(null); } })
      .catch((loadError) => { if (active) setReportError({ customerId, message: loadError.message || "Unable to load the credit report." }); });
    return () => { active = false; };
  }, [api, customerId, reloadKey]);

  const deleteCustomer = async () => {
    if (!visibleCustomer || !canDelete || visibleCustomer.hasHistory) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.customers.remove(visibleCustomer.id);
      await queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "customers"] });
      closeDetails();
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete customer.");
    } finally { setDeleteBusy(false); }
  };

  const content = loadedId !== customerId ? <Typography sx={{ p: 1 }}>Loading customer…</Typography>
    : error || !customer ? <Alert severity="error">{error || "Customer not found."}</Alert>
    : <CustomerDetailsContent customer={customer} report={report} reportError={visibleReportError} isMobile={isMobile} />;

  return <>
    {isMobile ? <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", pb: 3, minWidth: 0 }}>
      <AppBar position="sticky" elevation={0} sx={{ width: "100%", bgcolor: "#1976d2" }}>
        <Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) 48px", px: 1 }}>
          <IconButton aria-label="Back to Customers" onClick={closeDetails} sx={{ color: "inherit" }}><ArrowBackRoundedIcon /></IconButton>
          <Typography noWrap sx={{ textAlign: "center", fontSize: 18.5, fontWeight: 700 }}>Customer Details</Typography>
          <IconButton aria-label="Customer actions" disabled={!visibleCustomer || (!canEdit && !canDelete)} onClick={(event) => setMenuAnchor(event.currentTarget)} sx={{ color: "inherit" }}><MoreVertRoundedIcon /></IconButton>
        </Toolbar>
      </AppBar>
      <Box sx={{ px: 2, pt: 2 }}>{content}</Box>
    </Box> : <Dialog open onClose={closeDetails} fullWidth maxWidth={false} aria-labelledby="customer-details-title" slotProps={{ paper: { sx: { width: 810, maxWidth: "calc(100vw - 48px)", maxHeight: "86vh", m: 0 } } }}>
      <DialogTitle id="customer-details-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, py: 1.25, pl: 2.5, pr: 1.5 }}>
        <Typography component="span" sx={{ fontSize: 19, fontWeight: 700 }}>Customer Details</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {visibleCustomer && canEdit && <Button onClick={() => setEditorOpen(true)} sx={{ textTransform: "none", fontSize: 14 }}>Edit</Button>}
          {visibleCustomer && canDelete && <Button color="error" disabled={visibleCustomer.hasHistory} title={visibleCustomer.hasHistory ? "Customer has transaction history and cannot be deleted." : undefined} onClick={() => { setDeleteError(""); setDeleteOpen(true); }} sx={{ textTransform: "none", fontSize: 14 }}>Delete</Button>}
          <IconButton aria-label="Close Customer Details" onClick={closeDetails}><CloseRoundedIcon /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2.5, minWidth: 0, overflowY: "auto" }}>{content}</DialogContent>
    </Dialog>}
    {visibleCustomer && <CustomerDialog open={editorOpen} customer={visibleCustomer} onClose={() => setEditorOpen(false)} onSaved={(saved) => { setCustomer(saved); setReportState(null); setReloadKey((key) => key + 1); }} />}
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
      {visibleCustomer && canEdit && <MenuItem onClick={() => { setMenuAnchor(null); setEditorOpen(true); }}><EditOutlinedIcon sx={{ mr: 1.5 }} />Edit</MenuItem>}
      {visibleCustomer && canDelete && <MenuItem disabled={Boolean(visibleCustomer.hasHistory)} title={visibleCustomer.hasHistory ? "Customer has transaction history and cannot be deleted." : undefined} onClick={() => { setMenuAnchor(null); setDeleteError(""); setDeleteOpen(true); }}><DeleteOutlineRoundedIcon sx={{ mr: 1.5 }} />Delete</MenuItem>}
    </Menu>
    <Dialog open={deleteOpen} onClose={deleteBusy ? undefined : () => setDeleteOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Delete "{visibleCustomer?.name}"?</DialogTitle>
      <DialogContent dividers><Typography>This customer has no transaction history.</Typography>{deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</Button><Button color="error" variant="contained" onClick={deleteCustomer} disabled={deleteBusy}>Delete</Button></DialogActions>
    </Dialog>
  </>;
}
