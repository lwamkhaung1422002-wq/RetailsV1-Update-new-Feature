import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { usePosApi } from "../../hooks/useApiResource";

const money = (value) => Number(value ?? 0).toLocaleString("en-US");
const date = (value) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Yangon", month: "short", day: "2-digit", year: "numeric" }).format(new Date(value)) : "Not recorded";

export default function CustomerTransactionReport({ open, customerId, onClose, onInvoice, onPayment }) {
  const api = usePosApi();
  const isMobile = useMediaQuery("(max-width:768px)");
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dateError = dateMode === "custom" && from && to && from > to ? "From date must be on or before To date." : "";

  useEffect(() => {
    if (!open || !customerId || dateError) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      api.customers.transactionReport(customerId, {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(dateMode === "custom" && from ? { from } : {}),
        ...(dateMode === "custom" && to ? { to } : {}),
      }).then((data) => { if (active) setResult(data); })
        .catch((failure) => { if (active) setError(failure.message || "Unable to load customer transactions."); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, customerId, dateError, dateMode, from, open, search, to]);

  const invoices = result?.invoices || [];
  const summary = result?.summary;
  const paymentAction = (invoice) => invoice.paymentCount > 0
    ? <Button size="small" onClick={() => onPayment(invoice.orderId)}>{invoice.paymentCount > 1 ? `${invoice.paymentCount} Payments` : "View Payment"}</Button>
    : "—";
  const invoiceAction = (invoice) => <Button size="small" onClick={() => onInvoice(invoice.orderId)}>#{invoice.orderNumber || invoice.orderId}</Button>;

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="customer-transaction-title" slotProps={{ paper: { sx: { borderRadius: 2.5, maxHeight: "90vh", m: { xs: 1.5, sm: 3 } } } }}>
    <DialogTitle id="customer-transaction-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700 }}>
      Customer Transaction Report
      <IconButton aria-label="Close transaction report" onClick={onClose}><CloseRoundedIcon /></IconButton>
    </DialogTitle>
    <DialogContent dividers sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack spacing={2}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1.25 }}>
          {[["Total Purchases", summary?.totalPurchases], ["Total Paid", summary?.totalPaid], ["Outstanding", summary?.outstanding], ["Invoices", summary?.invoiceCount]].map(([label, value]) => <Card key={label} variant="outlined" sx={{ borderRadius: 2, minWidth: 0 }}><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{label}</Typography><Typography sx={{ fontWeight: 700, fontSize: 18, overflowWrap: "anywhere" }}>{money(value)}</Typography></CardContent></Card>)}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" placeholder="Search invoice number..." value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flex: "1 1 220px" }} />
          <Button variant={dateMode === "all" ? "contained" : "outlined"} onClick={() => setDateMode("all")}>All</Button>
          <Button variant={dateMode === "custom" ? "contained" : "outlined"} onClick={() => setDateMode("custom")}>Custom</Button>
          {dateMode === "custom" && <><TextField size="small" type="date" label="From" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField size="small" type="date" label="To" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></>}
        </Box>
        {(dateError || error) && <Alert severity="error">{dateError || error}</Alert>}
        {loading && <Typography color="text.secondary">Loading transactions…</Typography>}
        {!loading && !invoices.length && <Typography color="text.secondary">No customer transactions found.</Typography>}
        {!isMobile && invoices.length > 0 && <TableContainer><Table size="small" sx={{ "& .MuiTableCell-root": { whiteSpace: "nowrap", px: 1, py: 0.9 } }}><TableHead><TableRow>{["Date", "Invoice", "Purchase Amount", "Paid", "Remaining", "Due Date", "Status", "Payment"].map((heading) => <TableCell key={heading}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{invoices.map((invoice) => <TableRow key={invoice.orderId}><TableCell>{date(invoice.date)}</TableCell><TableCell>{invoiceAction(invoice)}</TableCell><TableCell>{money(invoice.effectiveAmount)}</TableCell><TableCell>{money(invoice.paidAmount)}</TableCell><TableCell>{money(invoice.remainingAmount)}</TableCell><TableCell>{date(invoice.dueAt)}</TableCell><TableCell>{invoice.paymentStatus}</TableCell><TableCell>{paymentAction(invoice)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
        {isMobile && invoices.length > 0 && <Stack spacing={1.25}>{invoices.map((invoice) => <Card key={invoice.orderId} variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{invoiceAction(invoice)}<Typography sx={{ fontWeight: 700 }}>{invoice.paymentStatus}</Typography></Box><Box sx={{ mt: 0.5 }}><ReportRow label="Date" value={date(invoice.date)} /><ReportRow label="Purchase" value={money(invoice.effectiveAmount)} /><ReportRow label="Paid" value={money(invoice.paidAmount)} /><ReportRow label="Remaining" value={money(invoice.remainingAmount)} /><ReportRow label="Due" value={date(invoice.dueAt)} /></Box>{paymentAction(invoice)}</CardContent></Card>)}</Stack>}
      </Stack>
    </DialogContent>
  </Dialog>;
}

function ReportRow({ label, value }) {
  return <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.35 }}><Typography color="text.secondary" sx={{ fontSize: 13 }}>{label}</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value}</Typography></Box>;
}
