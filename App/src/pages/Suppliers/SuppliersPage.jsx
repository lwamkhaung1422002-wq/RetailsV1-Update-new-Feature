import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useNavigate } from "react-router";
import { usePurchasesQuery, useSupplierDeliveriesQuery, useSuppliersQuery } from "../../hooks/usePosQueries";
import { usePosApi } from "../../hooks/useApiResource";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useManagerApproval } from "../../context/approval-context";
import { queryKeys } from "../../lib/queryKeys";
import { SupplierDetailsCards } from "./SupplierDetailsPage";
import SupplierHistoryPage from "./SupplierHistoryPage";
import PaymentCancellationDialog from "../../components/PaymentCancellationDialog";
import SupplierForm from "./SupplierForm";
import RecordSupplierPaymentPage from "./RecordSupplierPaymentPage";

async function refreshSupplierRecords(queryClient, shopId, { includeSuppliers = false } = {}) {
  const critical = [
    queryClient.invalidateQueries({ queryKey: ["shops", shopId, "purchases"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.supplierDeliveries(shopId) }),
    ...(includeSuppliers
      ? [queryClient.invalidateQueries({ queryKey: queryKeys.suppliers(shopId) })]
      : []),
  ];
  await Promise.all(critical);
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.payments(shopId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
    queryClient.invalidateQueries({ queryKey: ["shops", shopId, "reports"] }),
  ]);
}

const supplierRecords = [
  {
    id: "125978",
    name: "Pahtama Group",
    amount: 374000,
    status: "Credit",
    dateLabel: "Due",
    date: "2026-05-20",
  },
  {
    id: "111548",
    name: "Unilever",
    amount: 16000,
    status: "Paid",
    dateLabel: "Paid",
    date: "2026-06-11",
  },
];
const desktopSupplierRecords = [
  {
    id: "125978",
    name: "Pahtama Group",
    amount: 374000,
    status: "Credit",
    receiveDate: "2026-05-10",
    dateLabel: "Due",
    date: "2026-05-20",
  },
  {
    id: "111548",
    name: "Unilever",
    amount: 16000,
    status: "Paid",
    method: "KBZPay",
    settlement: { username: "Unilever Finance", account: "09 765 432 100", transactionId: "KBZ-0611-16000", paidDate: "2026-06-11" },
    receiveDate: "2026-06-11",
    dateLabel: "Paid",
    date: "2026-06-11",
  },
  {
    id: "114220",
    name: "KB Trading",
    amount: 45000,
    status: "Credit",
    receiveDate: "2026-06-13",
    dateLabel: "Due",
    date: "2026-06-25",
  },
  {
    id: "117654",
    name: "Shwe Moe",
    amount: 21000,
    status: "Cancel",
    receiveDate: "2026-06-18",
    dateLabel: "",
    date: "",
  },
  {
    id: "118904",
    name: "Royal Distribution",
    amount: 58000,
    status: "Paid",
    method: "Cash",
    settlement: { receiver: "Ko Aung", signature: "Ko Aung", paidDate: "2026-06-24" },
    receiveDate: "2026-06-24",
    dateLabel: "Paid",
    date: "2026-06-24",
  },
  {
    id: "119105",
    name: "Golden Nest",
    amount: 89000,
    status: "Credit",
    receiveDate: "2026-07-01",
    dateLabel: "Due",
    date: "2026-07-14",
  },
  {
    id: "120312",
    name: "Aung Family Supply",
    amount: 32500,
    status: "Paid",
    method: "Cash",
    settlement: { receiver: "Ko Aung", signature: "Ko Aung", paidDate: "2026-07-05" },
    receiveDate: "2026-07-05",
    dateLabel: "Paid",
    date: "2026-07-05",
  },
  {
    id: "121768",
    name: "Sunrise Wholesale",
    amount: 76000,
    status: "Credit",
    receiveDate: "2026-07-09",
    dateLabel: "Due",
    date: "2026-07-21",
  },
  {
    id: "122001",
    name: "Myanmar Choice",
    amount: 18500,
    status: "Cancel",
    receiveDate: "2026-07-12",
    dateLabel: "",
    date: "",
  },
  {
    id: "123445",
    name: "Evergreen Mart",
    amount: 64200,
    status: "Paid",
    method: "KBZPay",
    settlement: { username: "Evergreen Accounts", account: "09 456 789 234", transactionId: "KBZ-0716-64200", paidDate: "2026-07-16" },
    receiveDate: "2026-07-16",
    dateLabel: "Paid",
    date: "2026-07-16",
  },
];
const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ကျပ်`;
const desktopHistoryRecords = [
  { id: "TRX-20260611-0001", supplier: "Unilever", invoice: "111548", amount: 16000, method: "KPay", kind: "mobile", paymentDate: "11/06/2026", relativeTime: "about an hour ago", timestamp: "11/08/2026 11:20 PM" },
  { id: "PAY-20260520-0001", supplier: "Pahtama Group", invoice: "125978", amount: 100000, method: "Cash", kind: "cash", signature: "Ko Aung", paymentDate: "20/05/2026", relativeTime: "2 days ago", timestamp: "11/08/2026 09:45 AM" },
  { id: "EXP-20260701-0001", supplier: "Expense record", amount: 250000, method: "Cash", kind: "expense", dateLabel: "Expense Date", paymentDate: "01/07/2026", relativeTime: "1 week ago", timestamp: "01/07/2026 08:30 AM" },
];

void supplierRecords;
void desktopSupplierRecords;
const supplierDate = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
function mapSupplierRecords(purchasesResult, deliveriesResult) {
  const purchases = (purchasesResult?.purchases || []).map((purchase) => {
    const totalAmount = Number(purchase.total || 0);
    const paidAmount = Number(purchase.paidAmount || 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const paid = paidAmount >= totalAmount;
    const payment = [...(purchase.payments || [])].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0];
    const date = supplierDate(purchase.status === "cancelled" ? purchase.cancelledAt || purchase.updatedAt : paid ? payment?.paidAt || purchase.updatedAt : purchase.expectedAt || purchase.createdAt);
    return { id: purchase.purchaseNumber || purchase.id, apiId: purchase.id, supplierId: purchase.supplierId, name: purchase.supplier?.name || "Supplier", amount: paid ? paidAmount || totalAmount : remainingAmount, totalAmount, remainingAmount, status: purchase.status === "cancelled" ? "Cancel" : paid ? "Paid" : "Credit", receiveDate: supplierDate(purchase.createdAt), dateLabel: purchase.status === "cancelled" ? "Date" : paid ? "Paid" : "Due", date, method: payment?.method === "KBZ Pay" ? "KBZPay" : payment?.method || "", hasPaymentRecord: (purchase.payments || []).length > 0 };
  });
  const deliveries = (deliveriesResult?.records || []).map((record) => {
    const activePayments = (record.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal);
    const activePaid = Number(record.activePaid ?? activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const amount = Number(record.amount || 0);
    const remaining = Number(record.remaining ?? Math.max(0, amount - activePaid));
    const invoiceStatus = record.invoiceStatus || (record.status === "cancelled" ? "Cancelled" : remaining === 0 ? "Paid" : "Credit");
    return { id: record.invoiceNumber || record.id, apiId: record.id, supplierId: record.supplierId, name: record.supplierName || record.supplier?.name || "Supplier", amount: invoiceStatus === "Paid" ? amount : remaining, totalAmount: amount, remainingAmount: remaining, activePaid, status: invoiceStatus === "Cancelled" ? "Cancel" : invoiceStatus, receiveDate: supplierDate(record.receivedAt), dateLabel: invoiceStatus === "Paid" ? "Paid" : invoiceStatus === "Cancelled" ? "Date" : "Due", date: supplierDate(invoiceStatus === "Paid" ? activePayments.at(-1)?.paidAt : record.cancelledAt || record.dueAt || record.receivedAt), method: activePayments.at(-1)?.method || "", deliveryOnly: true, deliveryRecord: record, hasPaymentRecord: activePaid > 0, activePaymentRecordCount: Number(record.activePaymentCount ?? activePayments.length), allowedActions: record.allowedActions, sortAt: new Date(record.createdAt || record.receivedAt).getTime() };
  });
  return [...purchases, ...deliveries].sort((left, right) => (right.sortAt || new Date(right.date || 0).getTime()) - (left.sortAt || new Date(left.date || 0).getTime()));
}

export default function SuppliersPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRecord, setMenuRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [paymentCancelTarget, setPaymentCancelTarget] = useState(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [paymentCancelReason, setPaymentCancelReason] = useState("");
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const api = usePosApi();
  const { runWithApproval } = useManagerApproval();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { data: purchasesResult } = usePurchasesQuery({ page: 1, pageSize: 100 });
  const { data: deliveriesResult } = useSupplierDeliveriesQuery({ page: 1, pageSize: 100 });
  const apiRecords = useMemo(() => mapSupplierRecords(purchasesResult, deliveriesResult), [deliveriesResult, purchasesResult]);

  useEffect(() => {
    const openFilter = () => setFilterOpen(true);
    window.addEventListener("suppliers-filter", openFilter);
    return () => window.removeEventListener("suppliers-filter", openFilter);
  }, []);

  const visibleRecords = useMemo(
    () =>
      apiRecords.filter((record) => {
        const query = search.trim().toLowerCase();
        return (
          (status === "All" || record.status === status) &&
          (!query ||
            record.name.toLowerCase().includes(query) ||
            record.id.includes(query)) &&
          (!from || record.date >= from) &&
          (!to || record.date <= to)
        );
      }),
    [apiRecords, from, search, status, to],
  );
  const total = visibleRecords.reduce((sum, record) => sum + (record.status === "Cancel" ? 0 : record.amount), 0);
  const clearDateFilter = () => {
    setFrom("");
    setTo("");
  };
  const archiveSupplier = async () => {
    if (!archiveTarget?.apiId) return;
    setArchiving(true);
    setArchiveError("");
    try {
      if (archiveTarget.deliveryOnly) {
        if (!archiveReason.trim()) { setArchiveError("Cancellation reason is required."); return; }
        await api.suppliers.cancelDeliveryRecord(archiveTarget.apiId, { reason: archiveReason.trim() });
      } else await api.suppliers.remove(archiveTarget.supplierId);
      await refreshSupplierRecords(queryClient, shop?.id, { includeSuppliers: true });
      setArchiveTarget(null); setArchiveReason("");
    } catch (error) {
      setArchiveError(error.message || "Unable to delete supplier.");
    } finally {
      setArchiving(false);
    }
  };
  const openPayment = (record) => setPaymentTarget(record);
  const today = () => {
    const value = new Date().toISOString().slice(0, 10);
    setFrom(value);
    setTo(value);
  };
  const openRecord = useCallback((record) => {
    navigate(
      record.deliveryOnly ? `/supplier-delivery/${record.apiId}` : `/suppliers/${record.supplierId}`,
      { state: { purchaseId: record.deliveryOnly ? undefined : record.apiId } },
    );
  }, [navigate]);
  const openRecordMenu = useCallback((event, record) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuRecord(record);
  }, []);

  if (!isMobile)
    return <DesktopSuppliers records={apiRecords} />;

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        pb: "104px",
        bgcolor: "background.default",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
      }}
    >
      <Box
        sx={{
          height: 68,
          px: 1.5,
          bgcolor: "primary.main",
          color: "common.white",
          display: "grid",
          gridTemplateColumns: "48px minmax(0, 1fr) 48px",
          alignItems: "center",
          boxShadow: "0 2px 5px rgba(0,0,0,0.16)",
        }}
      >
        <IconButton
          aria-label="Back to settings"
          onClick={() => navigate("/settings")}
          sx={{ width: 48, height: 48, color: "inherit" }}
        >
          <ArrowBackRoundedIcon sx={{ fontSize: 31 }} />
        </IconButton>
        <Typography align="center" sx={{ fontSize: 21, fontWeight: 600 }}>
          Suppliers
        </Typography>
        <IconButton
          aria-label="Filter suppliers"
          onClick={() => setFilterOpen(true)}
          sx={{ width: 48, height: 48, color: "inherit" }}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: 29 }} />
        </IconButton>
      </Box>
      <Box sx={{ px: 2.5, pt: 1.5 }}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search suppliers by name or invoice number"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
          sx={searchSx}
        />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            mt: 2.25,
          }}
        >
          <StatusButton
            label="All"
            active={status === "All"}
            onClick={() => setStatus("All")}
          />
          <StatusButton
            label="Credit"
            active={status === "Credit"}
            onClick={() => setStatus("Credit")}
            icon={<CreditCardRoundedIcon />}
            color="warning.main"
          />
          <StatusButton
            label="Paid"
            active={status === "Paid"}
            onClick={() => setStatus("Paid")}
            icon={<CheckCircleOutlineRoundedIcon />}
            color="success.main"
          />
          <StatusButton
            label="Cancel"
            active={status === "Cancel"}
            onClick={() => setStatus("Cancel")}
            icon={<CancelOutlinedIcon />}
            color="error.main"
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            mt: 3.25,
            mb: 2,
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
            {visibleRecords.length} Suppliers
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
            {money(total)}
          </Typography>
        </Box>
        <Stack spacing={1.75}>
          {visibleRecords.map((record) => (
            <SupplierCard
              key={record.id}
              record={record}
              onClick={openRecord}
              onMenu={openRecordMenu}
            />
          ))}
        </Stack>
      </Box>

      <Paper
        elevation={5}
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          px: 2.5,
          py: 2,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => navigate("/suppliers/add")}
            sx={footerButtonSx}
          >
            Add Supplier
          </Button>
          <Button
            variant="outlined"
            startIcon={<HistoryRoundedIcon />}
            onClick={() => navigate("/suppliers/history")}
            sx={{
              ...footerButtonSx,
              color: "primary.main",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            History
          </Button>
        </Box>
      </Paper>

      <Dialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fullWidth
        slotProps={{
          paper: { sx: { m: 2.5, borderRadius: 2.5, maxWidth: 420 } },
        }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2.5,
            }}
          >
            <Typography sx={{ fontSize: 20, fontWeight: 600 }}>
              Filter suppliers
            </Typography>
            <IconButton
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}
          >
            <Button
              variant="outlined"
              onClick={clearDateFilter}
              sx={quickFilterSx}
            >
              All
            </Button>
            <Button
              variant="outlined"
              onClick={today}
              startIcon={<CalendarTodayOutlinedIcon />}
              sx={quickFilterSx}
            >
              Today
            </Button>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1.5,
              mt: 2,
            }}
          >
            <TextField
              label="From"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={dateSx}
            />
            <TextField
              label="To"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={dateSx}
            />
          </Box>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setFilterOpen(false)}
            sx={{
              mt: 2,
              minHeight: 54,
              borderRadius: 1.5,
              textTransform: "none",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Apply filters
          </Button>
        </DialogContent>
      </Dialog>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setMenuRecord(null);
        }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 164,
              mt: 0.75,
              borderRadius: 1.5,
              boxShadow: "0 8px 22px rgba(15,23,42,0.24)",
              overflow: "hidden",
            },
          },
        }}
      >
        {menuRecord?.status === "Credit" && (
          <MenuItem
            onClick={() => {
              openPayment(menuRecord);
              setMenuAnchor(null);
              setMenuRecord(null);
            }}
            sx={menuItemSx}
          >
            <PaymentsOutlinedIcon
              sx={{ fontSize: 15, color: "success.main" }}
            />
            Pay
          </MenuItem>
        )}
        {menuRecord?.status === "Paid" ? <MenuItem
          onClick={() => {
            navigate(`/suppliers/${menuRecord?.supplierId}`, { state: { purchaseId: menuRecord?.apiId } });
            setMenuAnchor(null);
            setMenuRecord(null);
          }}
          sx={menuItemSx}
        >
          <VisibilityOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
          Details
        </MenuItem> : menuRecord?.status !== "Cancel" && <MenuItem
          disabled={menuRecord?.deliveryOnly && menuRecord?.allowedActions?.edit === false}
          onClick={() => {
            navigate(`/suppliers/add?edit=${menuRecord?.deliveryOnly ? menuRecord.apiId : menuRecord?.supplierId}`);
            setMenuAnchor(null);
            setMenuRecord(null);
          }}
          sx={menuItemSx}
        >
          <EditOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
          Edit
        </MenuItem>}
        {menuRecord?.status !== "Cancel" && <MenuItem
          onClick={() => { if (menuRecord.deliveryOnly && Number(menuRecord.activePaymentRecordCount || 0) > 0) { const active = (menuRecord.deliveryRecord?.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal); setPaymentCancelTarget(menuRecord); setSelectedPaymentId(active[0]?.id || ""); setPaymentCancelReason(""); } else setArchiveTarget(menuRecord); setMenuAnchor(null); setMenuRecord(null); }}
          sx={{ ...menuItemSx, color: "error.main" }}
        >
          <DeleteOutlineRoundedIcon
            sx={{ fontSize: 15, color: "error.main" }}
          />
          {menuRecord?.deliveryOnly && Number(menuRecord?.activePaymentRecordCount || 0) > 0 ? "Cancel Payment" : "Cancel Invoice"}
        </MenuItem>}
      </Menu>
      <Dialog open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, pt: 1.5 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Record Payment</Typography>
          <IconButton aria-label="Close supplier payment" onClick={() => setPaymentTarget(null)}><CloseRoundedIcon /></IconButton>
        </Box>
        <DialogContent sx={{ p: 0 }}>
          {paymentTarget && <RecordSupplierPaymentPage embeddedRecord={paymentTarget} onSaved={() => setPaymentTarget(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(paymentCancelTarget)} onClose={archiving ? undefined : () => { setPaymentCancelTarget(null); setPaymentCancelReason(""); setArchiveError(""); }} fullWidth slotProps={{ paper: { sx: { m: 2.5, borderRadius: 2.5, maxWidth: 420 } } }}>
        <DialogTitle>Cancel Payment</DialogTitle>
        <DialogContent><Typography color="text.secondary">Choose the supplier payment to cancel.</Typography><TextField select fullWidth label="Payment" value={selectedPaymentId} onChange={(event) => setSelectedPaymentId(event.target.value)} sx={{ mt: 2 }}>{(paymentCancelTarget?.deliveryRecord?.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal).map((payment) => <MenuItem key={payment.id} value={payment.id}>{payment.method} · {money(payment.amount)} · {supplierDate(payment.paidAt)}</MenuItem>)}</TextField><TextField required fullWidth label="Cancel Payment Reason" value={paymentCancelReason} onChange={(event) => setPaymentCancelReason(event.target.value)} sx={{ mt: 1.5 }} />{archiveError && <Typography color="error" sx={{ mt: 1 }}>{archiveError}</Typography>}</DialogContent>
        <DialogActions><Button onClick={() => { setPaymentCancelTarget(null); setPaymentCancelReason(""); setArchiveError(""); }} disabled={archiving}>Back</Button><Button color="error" variant="contained" disabled={archiving || !selectedPaymentId || !paymentCancelReason.trim()} onClick={async () => { setArchiving(true); setArchiveError(""); try { const body = { reason: paymentCancelReason.trim() }; await runWithApproval({ permission: "supplier.pay", action: "supplier.payment.reverse", actionLabel: "Reverse supplier payment", targetId: selectedPaymentId, targetLabel: paymentCancelTarget.name, payload: { deliveryRecordId: paymentCancelTarget.apiId, paymentId: selectedPaymentId, ...body }, initialReason: body.reason }, (approvalToken) => api.suppliers.reverseDeliveryPayment(paymentCancelTarget.apiId, selectedPaymentId, body, approvalToken)); await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.supplierDeliveries(shop?.id) }), queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "purchases"] }), queryClient.invalidateQueries({ queryKey: queryKeys.payments(shop?.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }), queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "reports"] })]); setPaymentCancelTarget(null); } catch (error) { if (!error.approvalCancelled) setArchiveError(error.message || "Payment could not be cancelled."); } finally { setArchiving(false); } }}>{archiving ? "Cancelling…" : "Cancel Payment"}</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(archiveTarget)} onClose={archiving ? undefined : () => { setArchiveTarget(null); setArchiveError(""); }} fullWidth slotProps={{ paper: { sx: { m: 2.5, borderRadius: 2.5, maxWidth: 420 } } }}>
        <DialogTitle>Cancel Invoice</DialogTitle>
        <DialogContent><Typography color="text.secondary">Cancel <strong>{archiveTarget?.name}</strong>? A cancellation reason is required.</Typography><TextField autoFocus fullWidth required label="Cancel Invoice Reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} sx={{ mt: 2 }} />{archiveError && <Typography color="error" sx={{ mt: 1 }}>{archiveError}</Typography>}</DialogContent>
        <DialogActions><Button onClick={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(""); }} disabled={archiving}>Back</Button><Button color="error" variant="contained" onClick={archiveSupplier} disabled={archiving || !archiveReason.trim()}>{archiving ? "Cancelling…" : "Cancel Invoice"}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

export function DesktopSuppliers({ records }) {
  const api = usePosApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [dialog, setDialog] = useState(null);
  const [dateAnchor, setDateAnchor] = useState(null);
  const [dateRange, setDateRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const visibleRecords = useMemo(() => records.filter((record) => {
    const query = search.trim().toLowerCase();
    return (
      (status === "All" || record.status === status) &&
      (!query ||
        record.name.toLowerCase().includes(query) ||
        record.id.includes(query)) &&
      (dateRange !== "today" || record.receiveDate === supplierDate(new Date())) &&
      (!from || record.receiveDate >= from) &&
      (!to || record.receiveDate <= to)
    );
  }), [dateRange, from, records, search, status, to]);
  const total = useMemo(() => visibleRecords.reduce((sum, record) => sum + (record.status === "Cancel" ? 0 : record.amount), 0), [visibleRecords]);
  const open = (mode, record = null) => setDialog({ mode, record });
  const close = () => setDialog(null);
  const handleDelete = async (record, reason) => {
    if (record.deliveryOnly) {
      await api.suppliers.cancelDeliveryRecord(record.apiId, { reason });
    } else {
      if (!record.supplierId) return;
      await api.suppliers.remove(record.supplierId);
    }
    await refreshSupplierRecords(queryClient, shop?.id, { includeSuppliers: true });
    close();
  };
  const openPayment = async (record) => {
    open("pay", record);
  };
  const chooseRange = (range) => {
    setDateRange(range);
    if (range !== "custom") {
      setFrom("");
      setTo("");
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: "none", mx: 0, py: 0.25 }}>
      <Paper
        sx={{
          p: 1.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(15,23,42,.04)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "minmax(320px, 1.25fr) minmax(220px, .64fr) auto",
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <TextField
            fullWidth
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search suppliers by name or invoice number"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            }}
            sx={desktopSupplierSearchSx}
          />
          <Button
            variant="outlined"
            startIcon={<CalendarTodayOutlinedIcon />}
            onClick={(event) => setDateAnchor(event.currentTarget)}
            sx={desktopSupplierDateSx}
          >
            Date and time
          </Button>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => open("add")}
            sx={desktopSupplierAddSx}
          >
            Add Supplier
          </Button>
        </Box>
        <Stack direction="row" spacing={1.25} sx={{ mt: 1.5 }}>
          <DesktopSupplierFilter
            label="All"
            active={status === "All"}
            icon={<FilterAltOutlinedIcon />}
            onClick={() => setStatus("All")}
            tone="blue"
          />
          <DesktopSupplierFilter
            label="Credit"
            active={status === "Credit"}
            icon={<CreditCardRoundedIcon />}
            onClick={() => setStatus("Credit")}
            tone="orange"
          />
          <DesktopSupplierFilter
            label="Paid"
            active={status === "Paid"}
            icon={<CheckCircleOutlineRoundedIcon />}
            onClick={() => setStatus("Paid")}
            tone="green"
          />
          <DesktopSupplierFilter
            label="Cancel"
            active={status === "Cancel"}
            icon={<CancelOutlinedIcon />}
            onClick={() => setStatus("Cancel")}
            tone="red"
          />
          <DesktopSupplierFilter
            label="History"
            icon={<HistoryRoundedIcon />}
            onClick={() => open("history")}
            tone="blue"
          />
        </Stack>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 1.5,
            pt: 1.25,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            {visibleRecords.length} Suppliers
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
            <Typography
              color="text.secondary"
              sx={{ fontSize: 13, fontWeight: 600 }}
            >
              Total Amount
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
              {money(total)}
            </Typography>
          </Box>
        </Box>
      </Paper>
      <Paper
        sx={{
          mt: 1.75,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(15,23,42,.05)",
        }}
      >
        <Box sx={desktopSupplierHeaderSx}>
          <DesktopSupplierHeader>NO.</DesktopSupplierHeader>
          <DesktopSupplierHeader>SUPPLIER NAME</DesktopSupplierHeader>
          <DesktopSupplierHeader>INVOICE NUMBER</DesktopSupplierHeader>
          <DesktopSupplierHeader>STATUS</DesktopSupplierHeader>
          <DesktopSupplierHeader>RECEIVE DATE</DesktopSupplierHeader>
          <DesktopSupplierHeader>DUE/PAID DATE</DesktopSupplierHeader>
          <DesktopSupplierHeader align="right" sx={{ pr: 2 }}>AMOUNT</DesktopSupplierHeader>
          <DesktopSupplierHeader align="right">ACTIONS</DesktopSupplierHeader>
        </Box>
        {visibleRecords.map((record, index) => (
          <Box
            key={record.id}
            onClick={() => open("details", record)}
            sx={{
              ...desktopSupplierRowSx,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Typography
              color="text.secondary"
              sx={{ fontSize: 15, fontWeight: 600 }}
            >
              {index + 1}
            </Typography>
            <Typography noWrap sx={{ fontSize: 15.5, fontWeight: 700 }}>
              {record.name}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 15 }}>
              {record.id}
            </Typography>
            <Chip
              label={record.status}
              size="small"
              sx={desktopStatusSx(record.status)}
            />
            <Typography color="text.secondary" sx={{ fontSize: 15 }}>
              {record.receiveDate.split("-").reverse().join("/")}
            </Typography>
            <Typography
              noWrap
              sx={{
                fontSize: 15,
                fontWeight: record.status === "Cancel" ? 500 : 700,
                color:
                  record.status === "Paid"
                    ? "#278a45"
                    : record.status === "Credit"
                      ? "#e56b09"
                      : "text.secondary",
              }}
            >
              {record.date
                ? `${record.dateLabel}: ${record.date.split("-").reverse().join("/")}`
                : "--"}
            </Typography>
            <Box data-testid="desktop-supplier-amount" sx={{ justifySelf: "end", minWidth: 0, pr: 2, textAlign: "right" }}>
              <Typography noWrap sx={{ fontSize: 15.5, lineHeight: 1.25, fontWeight: 800 }}>
                {money(record.totalAmount ?? record.amount)}
              </Typography>
              {record.status === "Credit" && Number(record.remainingAmount || 0) > 0 && (
                <Typography noWrap sx={{ mt: 0.35, color: "#ef6c00", fontSize: 12, lineHeight: 1.2, fontWeight: 600 }}>
                  Remaining {money(record.remainingAmount)}
                </Typography>
              )}
            </Box>
            <Stack
              data-testid="desktop-supplier-actions"
              direction="row"
              spacing={0.75}
              justifySelf="end"
              width="100%"
              justifyContent="flex-end"
              onClick={(event) => event.stopPropagation()}
            >
              {record.status === "Paid" ? <><IconButton
                aria-label={`Details for ${record.name}`}
                onClick={() => open("details", record)}
                sx={desktopActionIconSx}
              ><VisibilityOutlinedIcon fontSize="small" /></IconButton><IconButton
                aria-label={`Delete ${record.name}`}
                onClick={() => open("delete", record)}
                sx={{ ...desktopActionIconSx, color: "error.main" }}
              ><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></> : (
                <><IconButton
                  aria-label={`Pay ${record.name}`}
                  onClick={() => openPayment(record)}
                  disabled={record.status === "Cancel"}
                  sx={desktopPayIconSx}
                >
                  <PaymentsOutlinedIcon fontSize="small" />
                </IconButton><IconButton
                aria-label={`Edit ${record.name}`}
                disabled={record.status === "Cancel" || (record.deliveryOnly && record.allowedActions?.edit === false)}
                onClick={() => navigate(`/suppliers/add?edit=${record.deliveryOnly ? record.apiId : record.supplierId}`)}
                sx={desktopActionIconSx}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton><IconButton
                aria-label={`Delete ${record.name}`}
                disabled={record.status === "Cancel"}
                onClick={() => open("delete", record)}
                sx={{ ...desktopActionIconSx, color: "error.main" }}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton></>
              )}
            </Stack>
          </Box>
        ))}
        {!visibleRecords.length && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary">
              No suppliers match this filter.
            </Typography>
          </Box>
        )}
      </Paper>
      <Popover
        open={Boolean(dateAnchor)}
        anchorEl={dateAnchor}
        onClose={() => setDateAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 368, p: 2, borderRadius: 2 } } }}
      >
        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Date and time</Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
          }}
        >
          {["all", "today", "custom"].map((range) => (
            <Button
              key={range}
              variant="outlined"
              onClick={() => chooseRange(range)}
              sx={{
                minHeight: 42,
                borderColor: dateRange === range ? "primary.main" : "divider",
                bgcolor: dateRange === range ? "#eaf3ff" : "transparent",
                color: dateRange === range ? "primary.main" : "text.primary",
                textTransform: "uppercase",
                fontSize: 12,
              }}
            >
              {range}
            </Button>
          ))}
        </Box>
        {dateRange === "custom" && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1.25,
              mt: 1.5,
            }}
          >
            <TextField
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        )}
        <Stack
          direction="row"
          justifyContent="flex-end"
          spacing={1}
          sx={{ mt: 1.5 }}
        >
          <Button
            onClick={() => chooseRange("all")}
            sx={{ textTransform: "uppercase" }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={() => setDateAnchor(null)}
            sx={{ textTransform: "uppercase" }}
          >
            Apply
          </Button>
        </Stack>
      </Popover>
      <DesktopSupplierDialog
        dialog={dialog}
        onClose={close}
        onDelete={handleDelete}
        onOpenPayment={(record) => open("pay", record)}
      />
    </Box>
  );
}

function DesktopSupplierDialog({ dialog, onClose, onDelete, onOpenPayment }) {
  const [cancelReason, setCancelReason] = useState("");
  if (!dialog) return null;
  const { mode, record } = dialog;
  if (mode === "delete" && record.deliveryOnly) return <PaymentCancellationDialog key={record.apiId} kind="supplier" recordId={record.apiId} onClose={onClose} />;
  const title =
    mode === "add"
      ? "Add Supplier"
      : mode === "edit"
        ? "Edit Supplier"
        : mode === "pay"
          ? "Record Payment"
          : mode === "history"
            ? "Payment History"
            : mode === "delete"
              ? "Cancel Invoice"
              : "Supplier Details";
  const isHistory = mode === "history";
  const supplierFormId = "desktop-supplier-form";
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth={isHistory || mode === "add" ? "md" : "sm"}
      slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
    >
      {!isHistory && <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, fontWeight: 800, pb: 1 }}>{title}{mode === "pay" && <IconButton aria-label="Close supplier payment" onClick={onClose} size="small"><CloseRoundedIcon /></IconButton>}</DialogTitle>}
      <DialogContent dividers sx={{ p: mode === "history" ? 2 : mode === "add" ? 3 : 2.5 }}>
        {mode === "delete" ? (
          <><Typography color="text.secondary">Cancel <strong>{record.name}</strong>? A cancellation reason is required.</Typography><TextField autoFocus fullWidth required label="Cancel Invoice Reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} sx={{ mt: 2 }} /></>
        ) : mode === "history" ? (
          <SupplierHistoryPage embedded />
        ) : mode === "details" ? (
          <DesktopSupplierDetailsContent record={record} onOpenPayment={onOpenPayment} />
        ) : mode === "pay" ? (
          <DesktopPaymentFields record={record} onSaved={onClose} />
        ) : mode === "add" ? (
          <SupplierForm formId={supplierFormId} desktop onSaved={onClose} />
        ) : (
          <DesktopSupplierFields record={record} />
        )}
      </DialogContent>
      {mode !== "pay" && <DialogActions sx={{ px: 3, py: 1.75, gap: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          {isHistory || mode === "details" ? "Close" : "Cancel"}
        </Button>
        {mode === "delete" ? (
          <Button
            color="error"
            variant="contained"
            onClick={() => onDelete(record, cancelReason.trim())}
            disabled={!cancelReason.trim()}
            sx={{ textTransform: "none" }}
          >
            Cancel Invoice
          </Button>
        ) : (
          !isHistory &&
          mode !== "details" && mode !== "pay" && (
            <Button
              variant="contained"
              type={mode === "add" ? "submit" : "button"}
              form={mode === "add" ? supplierFormId : undefined}
              onClick={mode === "add" ? undefined : onClose}
              sx={{ textTransform: "none" }}
            >
              {mode === "pay"
                ? "Add Payment"
                : mode === "edit"
                  ? "Save Supplier"
                  : "Add Supplier"}
            </Button>
          )
        )}
      </DialogActions>}
    </Dialog>
  );
}

function DesktopSupplierDetailsContent({ record, onOpenPayment }) {
  const { data: supplierResult, error: supplierError } = useSuppliersQuery({ page: 1, pageSize: 100 });
  const { data: purchaseResult, error: purchaseError } = usePurchasesQuery({ page: 1, pageSize: 100 });
  const error = supplierError?.message || purchaseError?.message || "";
  const details = useMemo(() => {
    if (record.deliveryRecord && !record.supplierId) {
      return { supplier: { name: record.deliveryRecord.supplierName, phone: record.deliveryRecord.supplierPhone }, delivery: record.deliveryRecord, payments: (record.deliveryRecord.payments || []).filter((payment) => !payment.reversedAt) };
    }
    const supplier = (supplierResult?.suppliers || []).find((item) => item.id === record.supplierId);
    if (!supplier) return null;
    const purchases = (purchaseResult?.purchases || []).filter((item) => item.supplierId === record.supplierId && item.status !== "cancelled");
    const purchase = purchases.find((item) => item.id === record.apiId) || [...purchases].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0] || null;
    const delivery = record.deliveryRecord || (supplier.deliveryRecords || []).find((item) => item.invoiceNumber === record.id) || supplier.deliveryRecords?.[0] || null;
    return { supplier, delivery, payments: [...(purchase?.payments || [])].filter((payment) => !payment.reversedAt).sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt)) };
  }, [purchaseResult, record.apiId, record.deliveryRecord, record.id, record.supplierId, supplierResult]);
  if (error) return <Typography color="error.main">{error}</Typography>;
  if (!details || !details.delivery) return <Typography color="text.secondary">Loading supplier details…</Typography>;
  const { supplier, delivery, payments } = details;
  const paidAmount = payments.filter((payment) => !payment.reversedAt && !payment.reversal).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return <Box sx={{ maxWidth: 520, mx: "auto" }}><SupplierDetailsCards supplier={supplier} delivery={delivery} payments={payments} />{paidAmount < Number(delivery.amount || 0) && record.deliveryOnly && <Button fullWidth variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => onOpenPayment(record)} sx={{ mt: 2.5, minHeight: 56, borderRadius: 1.5, textTransform: "none", fontSize: 16, fontWeight: 600 }}>Add Payment</Button>}</Box>;
}

function DesktopSupplierFields({ record }) {
  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      minHeight: 50,
      borderRadius: 1.5,
      bgcolor: "action.hover",
      "& fieldset": { border: 0 },
    },
  };
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
      <TextField
        label="Supplier Name *"
        defaultValue={record?.name ?? ""}
        fullWidth
        sx={{ ...fieldSx, gridColumn: "1 / -1" }}
      />
      <TextField
        label="Phone *"
        defaultValue="09123456789"
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Invoice Number *"
        defaultValue={record?.id ?? ""}
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Delivery Name *"
        defaultValue="Ko Aung"
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Delivery Phone *"
        defaultValue="09987654321"
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Receiver Name *"
        defaultValue="Store Manager"
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Receive Date *"
        type="date"
        defaultValue={record?.receiveDate ?? ""}
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Due Date *"
        type="date"
        defaultValue={record?.date ?? ""}
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
        sx={fieldSx}
      />
      <TextField
        label="Amount *"
        type="number"
        defaultValue={record?.amount ?? ""}
        fullWidth
        sx={fieldSx}
      />
    </Box>
  );
}
function DesktopPaymentFields({ record, onSaved }) {
  return <RecordSupplierPaymentPage embeddedRecord={record} onSaved={onSaved} />;
}
export function DesktopSupplierHistory() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const visibleRecords = desktopHistoryRecords.filter((record) => (paymentMethod === "All" || record.method === paymentMethod) && (dateFilter !== "custom" || ((!from || record.paymentDate.split("/").reverse().join("-") >= from) && (!to || record.paymentDate.split("/").reverse().join("-") <= to))));
  const selectDateFilter = (value) => { setDateFilter(value); if (value !== "custom") { setFrom(""); setTo(""); } };
  return <><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}><Typography sx={{ fontSize: 20, fontWeight: 700 }}>Payment History</Typography><IconButton aria-label="Filter payment history" onClick={() => setFilterOpen(true)} sx={{ color: "primary.main" }}><FilterAltOutlinedIcon /></IconButton></Box><Stack spacing={2}>{visibleRecords.map((record) => <DesktopHistoryPaymentCard key={record.id} record={record} />)}{!visibleRecords.length && <Typography align="center" color="text.secondary" sx={{ py: 5 }}>No payment records found.</Typography>}</Stack><Dialog open={filterOpen} onClose={() => setFilterOpen(false)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { m: 2.5, borderRadius: 2.5 } } }}><DialogContent sx={{ p: 2.5 }}><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}><Typography sx={{ fontSize: 20, fontWeight: 700 }}>Filter payments</Typography><IconButton aria-label="Close payment filters" onClick={() => setFilterOpen(false)}><CloseRoundedIcon /></IconButton></Box><Typography sx={desktopHistoryFilterLabelSx}>Date</Typography><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, mt: 1 }}>{[["all", "All"], ["today", "Today"], ["custom", "Custom"]].map(([value, label]) => <DesktopHistoryFilterButton key={value} label={label} active={dateFilter === value} onClick={() => selectDateFilter(value)} />)}</Box>{dateFilter === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1.75 }}><TextField label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={desktopHistoryDateInputSx} /><TextField label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={desktopHistoryDateInputSx} /></Box>}<Typography sx={{ ...desktopHistoryFilterLabelSx, mt: 2.5 }}>Payment Method</Typography><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>{["All", "Cash", "KPay", "WavePay"].map((method) => <DesktopHistoryFilterButton key={method} label={method} active={paymentMethod === method} onClick={() => setPaymentMethod(method)} />)}</Box><Button fullWidth variant="contained" onClick={() => setFilterOpen(false)} sx={{ mt: 2.5, minHeight: 54, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none" }}>Apply filters</Button></DialogContent></Dialog></>;
  /*
  return (
    <Stack spacing={1.25}>
      {items.map((item) => (
        <Paper
          key={item.invoice}
          variant="outlined"
          sx={{ p: 1.75, borderRadius: 1.5 }}
        >
          <Box
            sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
          >
            <Box>
              <Typography fontWeight={700}>{item.supplier}</Typography>
              <Typography
                color="text.secondary"
                sx={{ fontSize: 13, mt: 0.35 }}
              >
                Invoice: {item.invoice} · {item.date}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography color="success.main" fontWeight={700}>
                {item.method}
              </Typography>
              <Typography fontWeight={800}>{money(item.amount)}</Typography>
            </Box>
          </Box>
        </Paper>
      ))}
    </Stack>
  );
  */
}

function DesktopHistoryFilterButton({ label, active, onClick }) { return <Button variant={active ? "contained" : "outlined"} onClick={onClick} sx={{ minHeight: 48, borderRadius: 1.5, borderColor: active ? "primary.main" : "divider", color: active ? "common.white" : "text.primary", fontSize: 14, fontWeight: 600, textTransform: "none" }}>{label}</Button>; }
const desktopHistoryFilterLabelSx = { fontSize: 14, fontWeight: 600, color: "text.secondary" };
const desktopHistoryDateInputSx = { "& .MuiOutlinedInput-root": { borderRadius: 1.5, bgcolor: "action.hover", "& fieldset": { border: 0 } } };

function DesktopHistoryDetailRow({ icon, label, value }) {
  return <Box sx={{ minHeight: 38, display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", gap: 1, alignItems: "center" }}><Box sx={{ color: "primary.main", display: "grid", placeItems: "center", "& .MuiSvgIcon-root": { fontSize: 22 } }}>{icon}</Box><Typography sx={{ color: "text.secondary", fontSize: 13.5 }}>{label}</Typography><Typography noWrap sx={{ maxWidth: 250, color: "text.primary", fontSize: 13.5, fontWeight: 500, textAlign: "right" }}>{value}</Typography></Box>;
}

function DesktopHistoryPaymentCard({ record }) {
  const showSignature = Boolean(record.signature);
  return <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 1.75, border: "1px solid", borderColor: "#e4e8ed", boxShadow: "0 2px 8px rgba(24, 52, 82, 0.11)" }}><Box sx={{ p: 2.25, pb: 1.875, display: "grid", gridTemplateColumns: "76px minmax(0, 1fr) auto", columnGap: 1.25, alignItems: "start" }}><Chip label="Paid" variant="outlined" sx={{ mt: 0.1, height: 40, minWidth: 72, borderRadius: 1.25, color: "#168437", borderColor: "#36a55a", bgcolor: "#f6fff8", "& .MuiChip-label": { px: 1.4, fontSize: 14, fontWeight: 600 } }} /><Box sx={{ minWidth: 0, pt: 0.15 }}><Typography noWrap sx={{ fontSize: 17.5, lineHeight: 1.3, fontWeight: 600 }}>{record.supplier}</Typography>{record.invoice && <Typography sx={{ mt: 0.95, fontSize: 13.5, lineHeight: 1.2, color: "text.secondary" }}>Invoice: {record.invoice}</Typography>}</Box><Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end" sx={{ whiteSpace: "nowrap" }}><Typography sx={{ color: record.method === "Cash" ? "#d87816" : "#238a3a", fontSize: 18, lineHeight: 1.28, fontWeight: 600 }}>{record.method}</Typography><Typography noWrap sx={{ fontSize: 18, lineHeight: 1.28, fontWeight: 600 }}>{money(record.amount)}</Typography></Stack></Box><Divider sx={{ mx: 2.25 }} /><Stack spacing={0.85} sx={{ px: 2.25, py: 1.75 }}>{record.kind === "mobile" && <DesktopHistoryDetailRow icon={<DescriptionOutlinedIcon />} label="Transaction ID" value={record.id} />}<DesktopHistoryDetailRow icon={<CalendarTodayOutlinedIcon />} label={record.dateLabel || "Payment Date"} value={record.paymentDate} /></Stack>{showSignature && <><Divider sx={{ mx: 2.25 }} /><Box sx={{ minHeight: 56, px: 2.25, display: "flex", alignItems: "center", gap: 1.4, color: "primary.main" }}><DrawOutlinedIcon sx={{ fontSize: 23 }} /><Typography sx={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Receiver Signature</Typography><Typography sx={{ color: "text.primary", fontSize: 18, fontFamily: "cursive", fontStyle: "italic" }}>{record.signature}</Typography></Box></>}<Divider /><Box sx={{ minHeight: 58, px: 2.25, display: "flex", alignItems: "center", gap: 1.25, color: "text.secondary" }}><HistoryRoundedIcon sx={{ fontSize: 24, color: "primary.main" }} /><Typography sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{record.relativeTime}</Typography><Typography noWrap sx={{ fontSize: 12.5 }}>{record.timestamp}</Typography></Box></Paper>;
}

function DesktopSupplierHeader({ children, align, sx }) {
  return (
    <Typography
      color="text.secondary"
      sx={{ fontSize: 14, fontWeight: 700, textAlign: align, ...sx }}
    >
      {children}
    </Typography>
  );
}
function DesktopSupplierFilter({ label, active, icon, onClick, tone }) {
  const colors =
    tone === "green"
      ? "#278a45"
      : tone === "orange"
        ? "#e56b09"
        : tone === "red"
          ? "#dc3d3d"
          : "#1d73df";
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      sx={{
        minWidth: 112,
        minHeight: 44,
        border: "1px solid",
        borderColor: active ? "primary.main" : `${colors}66`,
        borderRadius: 1.25,
        bgcolor: active ? "primary.main" : "background.paper",
        color: active ? "common.white" : colors,
        textTransform: "none",
        fontWeight: 700,
        "&:hover": { bgcolor: active ? "primary.main" : "action.hover" },
      }}
    >
      {label}
    </Button>
  );
}

const desktopSupplierGrid =
  "52px minmax(160px, 1.2fr) minmax(120px, .9fr) 92px minmax(120px, .9fr) minmax(145px, 1fr) minmax(140px, 1fr) 152px";
const desktopSupplierSearchSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 46,
    borderRadius: 1.5,
    bgcolor: "background.paper",
  },
};
const desktopSupplierDateSx = {
  minHeight: 46,
  justifyContent: "flex-start",
  borderRadius: 1.5,
  textTransform: "none",
  whiteSpace: "nowrap",
  color: "text.primary",
  borderColor: "divider",
};
const desktopSupplierAddSx = {
  minHeight: 46,
  borderRadius: 1.5,
  textTransform: "none",
  px: 2.25,
  whiteSpace: "nowrap",
};
const desktopSupplierHeaderSx = {
  display: "grid",
  gridTemplateColumns: desktopSupplierGrid,
  columnGap: 1,
  alignItems: "center",
  minHeight: 58,
  px: 2,
  borderBottom: "1px solid",
  borderColor: "divider",
};
const desktopSupplierRowSx = {
  display: "grid",
  gridTemplateColumns: desktopSupplierGrid,
  columnGap: 1,
  alignItems: "center",
  minHeight: 74,
  px: 2,
  borderBottom: "1px solid",
  borderColor: "divider",
  "&:last-of-type": { borderBottom: 0 },
};
const desktopActionIconSx = {
  width: 34,
  height: 34,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1.1,
  color: "primary.main",
};
const desktopPayIconSx = {
  width: 34,
  height: 34,
  border: "1px solid",
  borderColor: "primary.light",
  borderRadius: 1.1,
  color: "primary.main",
};
const desktopStatusSx = (status) => ({
  justifySelf: "start",
  height: 28,
  fontWeight: 700,
  bgcolor:
    status === "Paid" ? "#e8f6ec" : status === "Cancel" ? "#fff0f0" : "#fff1e4",
  color:
    status === "Paid" ? "#278a45" : status === "Cancel" ? "#d94343" : "#e56b09",
});

function StatusButton({ label, active, onClick, icon, color }) {
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      sx={{
        minWidth: 0,
        minHeight: 54,
        px: 0.75,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "primary.main" : "background.paper",
        color: active ? "common.white" : (color ?? "text.primary"),
        fontSize: 13,
        fontWeight: 600,
        textTransform: "none",
        "& .MuiButton-startIcon": {
          mr: 0.5,
          "& .MuiSvgIcon-root": { fontSize: 18 },
        },
        "&:hover": { bgcolor: active ? "primary.main" : "action.hover" },
      }}
    >
      {label}
    </Button>
  );
}

const SupplierCard = memo(function SupplierCard({ record, onMenu, onClick }) {
  const cancelled = record.status === "Cancel";
  const paid = record.status === "Paid";
  const dateColor = cancelled ? "#d14343" : paid ? "success.main" : "#ef6c00";
  const dateLabel = record.status === "Credit" ? "Due" : "Date";
  return (
    <Paper
      elevation={2}
      onClick={() => onClick(record)}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gridTemplateRows: "auto auto auto",
        columnGap: 1,
        rowGap: 1,
        alignItems: "center",
        cursor: "pointer",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
      }}
    >
      <Chip
        label={record.status}
        size="small"
        sx={{
          gridColumn: 1,
          gridRow: 1,
          justifySelf: "start",
          height: 28,
          bgcolor: cancelled ? "#fff1f0" : paid ? "#e3f5e6" : "#fff1e4",
          color: dateColor,
          fontSize: 13,
          fontWeight: 600,
          "& .MuiChip-label": { px: 1.1 },
          borderRadius: 1,
        }}
      />
      <Typography sx={{ gridColumn: 2, gridRow: 1, justifySelf: "end", color: dateColor, fontSize: 13, fontWeight: 500, lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {dateLabel}: {record.date.split("-").reverse().join("/")}
      </Typography>
      <Typography
        noWrap
        sx={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          fontSize: 17,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "text.primary",
        }}
      >
        {record.name}
      </Typography>
      <Typography
        noWrap
        sx={{
          gridColumn: 2,
          gridRow: 2,
          justifySelf: "end",
          textAlign: "right",
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1.2,
          color: "text.primary",
          whiteSpace: "nowrap",
        }}
      >
        {money(record.totalAmount ?? record.amount)}
      </Typography>
      <Typography sx={{ gridColumn: 1, gridRow: 3, minWidth: 0, fontSize: 14, fontWeight: 400, lineHeight: 1.3, color: "text.secondary" }}>
        {record.id}
      </Typography>
      <Box sx={{ gridColumn: 2, gridRow: 3, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: .5, minWidth: 0 }}>
        {record.status === "Credit" && Number(record.remainingAmount || 0) > 0 && <Typography noWrap sx={{ color: "#ef6c00", fontSize: 12, fontWeight: 600 }}>Remaining {money(record.remainingAmount)}</Typography>}
        <IconButton
          aria-label={`More actions for ${record.name}`}
          onClick={(event) => onMenu(event, record)}
          disabled={record.status === "Cancel"}
          size="small"
          sx={{ p: 0.25, flexShrink: 0 }}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
});

const searchSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 58,
    px: 1.5,
    borderRadius: 2,
    bgcolor: "action.hover",
    "& fieldset": { border: 0 },
  },
  "& .MuiInputBase-input": { fontSize: 16 },
};
const dateSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 1.5,
    bgcolor: "action.hover",
    "& fieldset": { border: 0 },
  },
};
const footerButtonSx = {
  minHeight: 54,
  borderRadius: 1.5,
  fontSize: 16,
  fontWeight: 600,
  textTransform: "none",
};
const quickFilterSx = {
  minHeight: 52,
  borderRadius: 1.5,
  textTransform: "none",
  color: "text.primary",
  borderColor: "divider",
  fontSize: 16,
  fontWeight: 600,
};
const menuItemSx = {
  minHeight: 44,
  gap: 1.25,
  px: 1.75,
  py: 0.75,
  fontSize: 15,
  fontWeight: 600,
  color: "text.primary",
};
