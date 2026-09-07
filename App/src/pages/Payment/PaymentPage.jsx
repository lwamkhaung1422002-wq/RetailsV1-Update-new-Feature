import { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SupplierHistoryPage from "../Suppliers/SupplierHistoryPage";
import OrderDetailsPage from "../Sale/OrderDetailsPage";
import SupplierDetailsPage from "../Suppliers/SupplierDetailsPage";
import PaymentCancellationDialog from "../../components/PaymentCancellationDialog";
import { usePosApi } from "../../hooks/useApiResource";
import { usePaymentWorklistQuery, useShopSettingsQuery } from "../../hooks/usePosQueries";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../lib/queryKeys";

const payments = [
  {
    id: "125978",
    supplierId: "125978",
    name: "Pahtama Group",
    amount: 374000,
    status: "Unpaid",
    method: "Pending",
    dateLabel: "Due",
    date: "2026-05-20",
    isoDate: "2026-05-20",
    kind: "supplier",
  },
  {
    id: "111548",
    supplierId: "111548",
    name: "Unilever",
    amount: 16000,
    status: "Paid",
    method: "KBZPay",
    dateLabel: "Paid",
    date: "2026-06-11",
    isoDate: "2026-06-11",
    kind: "supplier",
    settlement: {
      username: "Unilever Finance",
      account: "09 765 432 100",
      transactionId: "KBZ-0611-16000",
      paidDate: "2026-06-11",
    },
  },
  {
    id: "EXP-260701",
    name: "Shop rent",
    amount: 180000,
    status: "Paid",
    method: "Cash",
    dateLabel: "Paid",
    date: "2026-07-01",
    isoDate: "2026-07-01",
    kind: "expense",
    remark: "July shop rental",
    settlement: {
      receiver: "Daw Mya",
      signature: "Daw Mya",
      paidDate: "2026-07-01",
    },
  },
  {
    id: "REC-260715",
    name: "Aye Aye Win",
    amount: 42500,
    status: "Unpaid",
    method: "Pending",
    dateLabel: "Due",
    date: "2026-07-15",
    isoDate: "2026-07-15",
    kind: "receivable",
    qty: 4,
    buyer: "Aye Aye Win",
  },
  {
    id: "EXP-260718",
    name: "Electricity bill",
    amount: 28500,
    status: "Paid",
    method: "KBZPay",
    dateLabel: "Paid",
    date: "2026-07-18",
    isoDate: "2026-07-18",
    kind: "expense",
    remark: "Monthly electricity bill",
    settlement: {
      username: "Moe Moe",
      account: "09 777 123 456",
      transactionId: "KBZ-0718-28450",
      paidDate: "2026-07-18",
    },
  },
];
const desktopPayments = [
  {
    id: "125978",
    name: "Pahtama Group",
    amount: 374000,
    status: "Unpaid",
    method: "",
    dateLabel: "Due",
    date: "2026-05-20",
    kind: "supplier",
  },
  {
    id: "111548",
    name: "Unilever",
    amount: 16000,
    status: "Paid",
    method: "KBZPay",
    dateLabel: "Paid",
    date: "2026-06-11",
    kind: "supplier",
    settlement: {
      username: "Unilever Finance",
      account: "09 765 432 100",
      transactionId: "KBZ-0611-16000",
      paidDate: "2026-06-11",
    },
  },
  {
    id: "EXP-260701",
    name: "Shop rent",
    amount: 180000,
    status: "Paid",
    method: "Cash",
    dateLabel: "Paid",
    date: "2026-07-01",
    kind: "expense",
    remark: "July shop rental",
    settlement: {
      receiver: "Daw Mya",
      signature: "Daw Mya",
      paidDate: "2026-07-01",
    },
  },
  {
    id: "REC-260715",
    name: "Aye Aye Win",
    amount: 42500,
    status: "Unpaid",
    method: "",
    dateLabel: "Due",
    date: "2026-07-15",
    kind: "receivable",
    buyer: "Aye Aye Win",
    qty: 4,
  },
  {
    id: "EXP-260718",
    name: "Electricity bill",
    amount: 28500,
    status: "Paid",
    method: "KBZPay",
    dateLabel: "Paid",
    date: "2026-07-18",
    kind: "expense",
    remark: "Monthly electricity bill",
    settlement: {
      username: "Moe Moe",
      account: "09 777 123 456",
      transactionId: "KBZ-0718-28450",
      paidDate: "2026-07-18",
    },
  },
  {
    id: "119105",
    name: "Golden Nest",
    amount: 89000,
    status: "Unpaid",
    method: "",
    dateLabel: "Due",
    date: "2026-07-14",
    kind: "supplier",
  },
  {
    id: "120312",
    name: "Aung Family Supply",
    amount: 32500,
    status: "Paid",
    method: "Cash",
    dateLabel: "Paid",
    date: "2026-07-05",
    kind: "supplier",
    settlement: {
      receiver: "Ko Aung",
      signature: "Ko Aung",
      paidDate: "2026-07-05",
    },
  },
  {
    id: "EXP-260722",
    name: "Delivery fuel",
    amount: 14500,
    status: "Paid",
    method: "Cash",
    dateLabel: "Paid",
    date: "2026-07-22",
    kind: "expense",
    remark: "Delivery vehicle fuel",
    settlement: {
      receiver: "Ko Lin",
      signature: "Ko Lin",
      paidDate: "2026-07-22",
    },
  },
  {
    id: "REC-260725",
    name: "Ko Min Thu",
    amount: 26700,
    status: "Unpaid",
    method: "",
    dateLabel: "Due",
    date: "2026-07-25",
    kind: "receivable",
    buyer: "Ko Min Thu",
    qty: 3,
  },
];
void payments;
void desktopPayments;

const money = (value) => `${new Intl.NumberFormat("en-US").format(value)} ကျပ်`;

const invalidatePaymentData = async (queryClient, refreshPlan) => {
  // The worklist is the current screen's source of truth, so it remains
  // blocking. Supporting dashboards and source lists stay fresh without
  // delaying the completed payment/cancellation UI.
  await Promise.all(
    refreshPlan.critical.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
  void Promise.all(
    refreshPlan.background.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
};

const paymentRefreshKeys = {
  expense: (shopId) => ({
    critical: [queryKeys.payments(shopId)],
    background: [queryKeys.dashboard(shopId), ["shops", shopId, "reports"]],
  }),
  order: (shopId) => ({
    critical: [queryKeys.payments(shopId)],
    background: [
      queryKeys.orders(shopId), queryKeys.inventory(shopId), queryKeys.movements(shopId),
      queryKeys.dashboard(shopId), ["shops", shopId, "reports"],
    ],
  }),
  supplier: (shopId) => ({
    critical: [queryKeys.payments(shopId)],
    background: [
      ["shops", shopId, "purchases"], queryKeys.supplierDeliveries(shopId),
      queryKeys.dashboard(shopId), ["shops", shopId, "reports"],
    ],
  }),
};

export default function PaymentPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { data: paymentRecords = [] } = usePaymentWorklistQuery();
  const { data: settingsResult } = useShopSettingsQuery();
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [method, setMethod] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuPayment, setMenuPayment] = useState(null);
  const [mobileDialog, setMobileDialog] = useState(null);
  const [detailPayment, setDetailPayment] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const paymentMethods = useMemo(() => {
    const configured = (settingsResult?.settings?.paymentMethods || [])
      .filter((item) => item.active !== false)
      .map((item) => item.name)
      .filter(Boolean);
    return ["Cash", ...configured.filter((item) => item !== "Cash")];
  }, [settingsResult]);
  const saveExpense = async (entry) => {
    await api.expenses.create({
      title: entry.name,
      amount: Number(entry.amount),
      category: entry.type,
      method: entry.method === "KBZPay" ? "KBZ Pay" : entry.method,
      note: entry.remark || undefined,
    });
    await invalidatePaymentData(queryClient, paymentRefreshKeys.expense(shop?.id));
  };
  const openMobilePayment = useCallback((payment) => {
    if (!isMobile && ["sale", "supplier", "supplier-delivery"].includes(payment.kind)) {
      setDetailPayment(payment);
      return;
    }
    if (payment.kind === "sale") {
      navigate(`/sale/${payment.apiId}`, { state: { from: "/payment" } });
      return;
    }
    if (["supplier", "supplier-delivery"].includes(payment.kind)) {
      navigate(
        payment.kind === "supplier-delivery"
          ? `/supplier-delivery/${payment.apiId}`
          : `/suppliers/${payment.supplierId}`,
        { state: { from: "/payment" } },
      );
      return;
    }
    setMobileDialog({ mode: "details", record: payment });
  }, [navigate, isMobile]);
  const openMobilePaymentMenu = useCallback((event, payment) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuPayment(payment);
  }, []);

  const visiblePayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\//g, "-");
    return paymentRecords.filter(
      (payment) =>
        (status === "All" ||
          (status === "Unpaid"
            ? ["Unpaid", "Partial", "Credit"].includes(payment.status)
            : status === "Expense"
              ? payment.kind === "expense"
              : status === "Cancel"
                ? ["Cancel", "Cancelled"].includes(payment.status)
                : payment.status === status)) &&
        (!query ||
          payment.name.toLowerCase().includes(query) ||
          payment.id.includes(query)) &&
        (method === "All" || payment.method === method) &&
        (dateFilter !== "today" || payment.isoDate === today) &&
        (dateFilter !== "custom" ||
          ((!from || payment.isoDate >= from) &&
            (!to || payment.isoDate <= to))),
    );
  }, [dateFilter, from, method, paymentRecords, search, status, to]);

  const total = visiblePayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const selectDateFilter = (value) => {
    setDateFilter(value);
    if (value !== "custom") {
      setFrom("");
      setTo("");
    }
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuPayment(null);
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        pb: isMobile ? "104px" : 3,
        bgcolor: "#fff",
        fontFamily: "Inter, Roboto, 'Noto Sans Myanmar', sans-serif",
      }}
    >
      {!isMobile ? (
        <DesktopPaymentsPage
          onAddPayment={() => setMobileDialog({ mode: "entry" })}
          onDetails={openMobilePayment}
          onMenu={openMobilePaymentMenu}
        />
      ) : <>
      <Box sx={topBarSx}>
        <IconButton
          aria-label="Back to settings"
          onClick={() => navigate("/settings")}
          sx={topIconSx}
        >
          <ArrowBackRoundedIcon sx={{ fontSize: 32 }} />
        </IconButton>
        <Typography align="center" sx={{ fontSize: 22, fontWeight: 700 }}>
          Payment
        </Typography>
        <IconButton
          aria-label="Filter payments"
          onClick={() => setFilterOpen(true)}
          sx={topIconSx}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: 30 }} />
        </IconButton>
      </Box>

      <Box sx={{ px: 2.5, pt: 2 }}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search payments by name or invoice number"
          inputProps={{ "aria-label": "Search payments" }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon
                    sx={{ color: "text.secondary", fontSize: 29 }}
                  />
                </InputAdornment>
              ),
            },
          }}
          sx={searchSx}
        />
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            mt: 1.5,
          }}
        >
          <StatusButton
            label="All"
            active={status === "All"}
            onClick={() => setStatus("All")}
          />
          <StatusButton
            label="Expense"
            active={status === "Expense"}
            onClick={() => setStatus("Expense")}
            color="#b45309"
          />
          <StatusButton
            label="Paid"
            active={status === "Paid"}
            onClick={() => setStatus("Paid")}
            color="success.main"
          />
          <StatusButton
            label="Unpaid"
            active={status === "Unpaid"}
            onClick={() => setStatus("Unpaid")}
            color="#ef6c00"
          />
          <StatusButton label="Cancel" active={status === "Cancel"} onClick={() => setStatus("Cancel")} color="error.main" />
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 2.25,
            mb: 1.75,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 500 }}>
            {visiblePayments.length} Payments
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {money(total)}
          </Typography>
        </Box>
        <Stack spacing={1.75}>
          {visiblePayments.map((payment) => (
            <PaymentCard
              key={payment.recordKey || payment.id}
              payment={payment}
              onClick={openMobilePayment}
              onMenu={openMobilePaymentMenu}
            />
          ))}
          {!visiblePayments.length && (
            <Typography align="center" color="text.secondary" sx={{ py: 6 }}>
              No payments found.
            </Typography>
          )}
        </Stack>
      </Box>

      <Paper
        elevation={5}
        sx={{
          position: isMobile ? "fixed" : "sticky",
          left: 0,
          right: 0,
          bottom: 0,
          px: 2.5,
          py: 2,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          zIndex: 10,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1.65fr 0.9fr",
            gap: 1.5,
          }}
        >
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setMobileDialog({ mode: "entry" })}
            sx={footerPrimarySx}
          >
            Add Payment
          </Button>
          <Button
            variant="outlined"
            startIcon={<HistoryRoundedIcon />}
            onClick={() => navigate("/payment/history")}
            sx={footerSecondarySx}
          >
            History
          </Button>
        </Box>
      </Paper>
      </>}

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
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2.5,
            }}
          >
            <Typography sx={{ fontSize: 20, fontWeight: 600 }}>
              Filter payments
            </Typography>
            <IconButton
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Typography sx={filterLabelSx}>Date</Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              mt: 1,
            }}
          >
            <FilterButton
              label="All"
              active={dateFilter === "all"}
              onClick={() => selectDateFilter("all")}
            />
            <FilterButton
              label="Today"
              active={dateFilter === "today"}
              onClick={() => selectDateFilter("today")}
            />
            <FilterButton
              label="Custom"
              active={dateFilter === "custom"}
              onClick={() => selectDateFilter("custom")}
            />
          </Box>
          {dateFilter === "custom" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.5,
                mt: 1.75,
              }}
            >
              <TextField
                label="From"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={dateInputSx}
              />
              <TextField
                label="To"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={dateInputSx}
              />
            </Box>
          )}
          <Typography sx={{ ...filterLabelSx, mt: 2.5 }}>
            Payment Method
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              mt: 1,
            }}
          >
            {["All", ...paymentMethods]
              .filter((value, index, values) => values.indexOf(value) === index)
              .map((value) => (
                <FilterButton
                  key={value}
                  label={value}
                  active={method === value}
                  onClick={() => setMethod(value)}
                />
              ))}
          </Box>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setFilterOpen(false)}
            sx={{
              mt: 2.5,
              minHeight: 54,
              borderRadius: 1.5,
              fontSize: 16,
              fontWeight: 600,
              textTransform: "none",
            }}
          >
            Apply filters
          </Button>
        </DialogContent>
      </Dialog>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
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
        {((menuPayment?.kind === "supplier-delivery" && menuPayment?.allowedActions?.pay) || ["Unpaid", "Partial"].includes(menuPayment?.status)) && (
          <MenuItem
            onClick={() => {
              if (menuPayment.kind === "supplier-delivery")
                navigate(`/suppliers/delivery/${menuPayment.apiId}/pay`, {
                  state: { from: "/payment" },
                });
              else if (menuPayment.kind === "supplier")
                navigate(`/suppliers/${menuPayment.supplierId}/pay`, {
                  state: { from: "/payment" },
                });
              else if (menuPayment.kind === "sale")
                setMobileDialog({ mode: "order-pay", record: menuPayment });
              closeMenu();
            }}
            sx={menuItemSx}
          >
            <PaymentsOutlinedIcon
              sx={{ fontSize: 15, color: "success.main" }}
            />
            Pay
          </MenuItem>
        )}
        {["supplier", "supplier-delivery"].includes(menuPayment?.kind) && menuPayment?.allowedActions?.edit && (
          <MenuItem
            onClick={() => {
              navigate(
                menuPayment.kind === "supplier-delivery"
                  ? `/suppliers/add?edit=${menuPayment.apiId}`
                  : `/suppliers/add?edit=${menuPayment?.supplierId}`,
              );
              closeMenu();
            }}
            sx={menuItemSx}
          >
            <EditOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
            Edit
          </MenuItem>
        )}
        {menuPayment?.kind === "supplier-delivery" && menuPayment?.allowedActions?.cancelPayment && (
          <MenuItem onClick={() => { setMobileDialog({ mode: "select-supplier-payment", record: menuPayment }); closeMenu(); }} sx={{ ...menuItemSx, color: "error.main" }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 15, color: "error.main" }} />
            Cancel Payment
          </MenuItem>
        )}
        {menuPayment?.kind === "supplier-delivery" && menuPayment?.allowedActions?.cancelInvoice && (
          <MenuItem onClick={async () => { const reason = window.prompt("Cancel invoice reason (required):")?.trim(); if (!reason) return; try { await api.suppliers.cancelDeliveryRecord(menuPayment.apiId, { reason }); await invalidatePaymentData(queryClient, paymentRefreshKeys.supplier(shop?.id)); } catch (error) { setPaymentError(error.message || "Invoice could not be cancelled."); } finally { closeMenu(); } }} sx={{ ...menuItemSx, color: "error.main" }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 15, color: "error.main" }} />
            Cancel Invoice
          </MenuItem>
        )}
        {["expense", "income"].includes(menuPayment?.kind) && (
          <MenuItem
            onClick={() => {
              setMobileDialog({ mode: "delete", record: menuPayment });
              closeMenu();
            }}
            sx={{ ...menuItemSx, color: "error.main" }}
          >
            <DeleteOutlineRoundedIcon
              sx={{ fontSize: 15, color: "error.main" }}
            />
            Delete
          </MenuItem>
        )}
        {menuPayment?.kind === "sale" &&
          Number(menuPayment.activePaymentRecordCount || 0) >= 1 && (
            <MenuItem
              onClick={() => {
                setMobileDialog({
                  mode: "select-sale-payment",
                  record: menuPayment,
                });
                closeMenu();
              }}
              sx={{ ...menuItemSx, color: "error.main" }}
            >
              <DeleteOutlineRoundedIcon
                sx={{ fontSize: 15, color: "error.main" }}
              />
              Cancel Payment
            </MenuItem>
          )}
        {menuPayment?.kind === "sale" &&
          Number(menuPayment.activePaymentRecordCount || 0) === 0 &&
          menuPayment.status !== "Cancel" && (
            <MenuItem
              onClick={() => {
                setMobileDialog({ mode: "delete-sale", record: menuPayment });
                closeMenu();
              }}
              sx={{ ...menuItemSx, color: "error.main" }}
            >
              <DeleteOutlineRoundedIcon
                sx={{ fontSize: 15, color: "error.main" }}
              />
              Cancel Order
            </MenuItem>
          )}
      </Menu>
      {!isMobile && detailPayment && <Dialog open onClose={() => setDetailPayment(null)} fullWidth maxWidth="sm">
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}><IconButton aria-label="Close details" onClick={() => setDetailPayment(null)}><CloseRoundedIcon /></IconButton></Box>
        <DialogContent sx={{ p: 0 }}>
          {detailPayment.kind === "sale" ? <OrderDetailsPage embeddedOrderId={detailPayment.apiId} embeddedOnClose={() => setDetailPayment(null)} forceMobileLayout hideBackButton /> : <SupplierDetailsPage embeddedSupplierId={detailPayment.supplierId} embeddedRecordId={detailPayment.kind === "supplier-delivery" ? detailPayment.apiId : undefined} hideBackButton />}
        </DialogContent>
      </Dialog>}
      <MobilePaymentDialog
        dialog={mobileDialog}
        saving={savingPayment}
        error={paymentError}
        onClose={() => {
          if (!savingPayment) {
            setMobileDialog(null);
            setPaymentError("");
          }
        }}
        onSave={async (entry) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            await saveExpense(entry);
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(error.message || "Payment could not be saved.");
          } finally {
            setSavingPayment(false);
          }
        }}
        onDelete={async (record) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            await api.expenses.remove(record.apiId);
            await invalidatePaymentData(queryClient, paymentRefreshKeys.expense(shop?.id));
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(error.message || "Payment could not be deleted.");
          } finally {
            setSavingPayment(false);
          }
        }}
        paymentMethods={paymentMethods}
        onOrderPay={async (record, payment) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            await api.payments.addToOrder(record.apiId, payment);
            await invalidatePaymentData(queryClient, paymentRefreshKeys.order(shop?.id));
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(
              error.message || "Order payment could not be saved.",
            );
          } finally {
            setSavingPayment(false);
          }
        }}
        onDeleteSale={async (record) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            const reason = String(
              window.prompt("Cancel order reason (required):") || "",
            ).trim();
            if (!reason) {
              setSavingPayment(false);
              return;
            }
            const { order } = await api.orders.get(record.apiId);
            const activePayments = (order.payments || []).filter(
              (payment) =>
                Number(payment.amount || 0) > 0 &&
                !(order.payments || []).some(
                  (reversal) =>
                    Number(reversal.amount || 0) < 0 &&
                    reversal.originalPaymentId === payment.id,
                ),
            );
            if (activePayments.length > 0)
              throw new Error(
                "Cancel later payment records from Payment before cancelling this order.",
              );
            if (order.fulfillmentStatus !== "cancelled")
              await api.orders.cancel(order.id, { reason });
            await invalidatePaymentData(queryClient, paymentRefreshKeys.order(shop?.id));
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(error.message || "Order could not be deleted.");
          } finally {
            setSavingPayment(false);
          }
        }}
        onCancelSalePayment={async (
          record,
          selectedPaymentId,
          suppliedReason,
        ) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            const reason = String(
              suppliedReason ||
                window.prompt("Cancel payment reason (required):") ||
                "",
            ).trim();
            if (!reason) {
              setSavingPayment(false);
              return;
            }
            const { order } = await api.orders.get(record.apiId);
            const activePayments = (order.payments || []).filter(
              (payment) =>
                Number(payment.amount || 0) > 0 &&
                !(order.payments || []).some(
                  (reversal) =>
                    Number(reversal.amount || 0) < 0 &&
                    reversal.originalPaymentId === payment.id,
                ),
            );
            const selectedPayment = selectedPaymentId
              ? activePayments.find(
                  (payment) => payment.id === selectedPaymentId,
                )
              : activePayments.at(-1);
            if (!selectedPayment)
              throw new Error("This payment has already been cancelled.");
            await api.payments.refundOrder(order.id, {
              method: selectedPayment.method || "Cash",
              amount: Number(selectedPayment.amount || 0),
              originalPaymentId: selectedPayment.id,
              note: reason,
            });
            await invalidatePaymentData(queryClient, paymentRefreshKeys.order(shop?.id));
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(error.message || "Payment could not be cancelled.");
          } finally {
            setSavingPayment(false);
          }
        }}
        onCancelSupplierPayment={async (record, paymentId, reason) => {
          setSavingPayment(true);
          setPaymentError("");
          try {
            await api.suppliers.reverseDeliveryPayment(record.apiId, paymentId, { reason });
            await invalidatePaymentData(queryClient, paymentRefreshKeys.supplier(shop?.id));
            setMobileDialog(null);
          } catch (error) {
            setPaymentError(error.message || "Payment could not be cancelled.");
          } finally {
            setSavingPayment(false);
          }
        }}
      />
    </Box>
  );
}

function DesktopPaymentsPage({ onAddPayment, onDetails, onMenu }) {
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { data: records = [] } = usePaymentWorklistQuery();
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const visible = useMemo(() => records.filter((record) => {
    const date = record.date;
    return (
      (status === "All" ||
        (status === "Expense"
          ? record.kind === "expense"
          : status === "Unpaid"
            ? ["Unpaid", "Partial", "Credit"].includes(record.status)
            : status === "Cancel"
              ? ["Cancel", "Cancelled"].includes(record.status)
            : record.status === status)) &&
      (!search ||
        [record.name, record.id].some((value) =>
          value.toLowerCase().includes(search.toLowerCase()),
        )) &&
      (dateMode !== "today" || date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\//g, "-")) &&
      (dateMode !== "custom" ||
        ((!from || date >= from) && (!to || date <= to)))
    );
  }), [dateMode, from, records, search, status, to]);
  const total = useMemo(() => visible.reduce((sum, record) => sum + record.amount, 0), [visible]);
  const close = () => setDialog(null);
  const deleteRecord = async (record) => {
    if (record.kind !== "expense")
      throw new Error("Only expense records can be deleted.");
    await api.expenses.remove(record.apiId);
    await invalidatePaymentData(queryClient, paymentRefreshKeys.expense(shop?.id));
    close();
  };
  return (
    <Paper sx={desktopPaymentPageSx}>
      <Box sx={desktopPaymentToolbarSx}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search payments by name or invoice number"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            },
          }}
          sx={desktopPaymentSearchSx}
        />
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={onAddPayment}
          sx={desktopPaymentPrimarySx}
        >
          Add Payment
        </Button>
        <Button
          variant="outlined"
          startIcon={<CalendarTodayOutlinedIcon />}
          onClick={() => setDialog({ mode: "date" })}
          sx={desktopPaymentDateSx}
        >
          Date and time
        </Button>
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
        <DesktopPaymentFilter
          label="All"
          active={status === "All"}
          onClick={() => setStatus("All")}
        />
        <DesktopPaymentFilter
          label="Expense"
          active={status === "Expense"}
          onClick={() => setStatus("Expense")}
          tone="#b45309"
        />
        <DesktopPaymentFilter
          label="Paid"
          active={status === "Paid"}
          onClick={() => setStatus("Paid")}
          tone="success.main"
          icon={<CheckCircleOutlineRoundedIcon />}
        />
        <DesktopPaymentFilter
          label="Unpaid"
          active={status === "Unpaid"}
          onClick={() => setStatus("Unpaid")}
          tone="#ef6c00"
          icon={<CreditCardOutlinedIcon />}
        />
        <DesktopPaymentFilter label="Cancel" active={status === "Cancel"} onClick={() => setStatus("Cancel")} tone="error.main" icon={<CancelOutlinedIcon />} />
        <Button
          variant="outlined"
          startIcon={<HistoryRoundedIcon />}
          onClick={() => setDialog({ mode: "supplier-history" })}
          sx={desktopPaymentHistorySx}
        >
          History
        </Button>
      </Stack>
      <Box sx={desktopPaymentSummarySx}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
          {visible.length} Payments
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            Total Amount
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
            {money(total)}
          </Typography>
        </Box>
      </Box>
      <Box sx={desktopPaymentGridSx}>
        {visible.map((record) => (
          <DesktopPaymentCard
            key={record.recordKey || record.id}
            payment={record}
            onClick={onDetails}
            onMenu={onMenu}
          />
        ))}
      </Box>
      {!visible.length && (
        <Typography align="center" color="text.secondary" sx={{ py: 7 }}>
          No payments found.
        </Typography>
      )}
      <Menu
        anchorEl={menu?.anchor}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 142, borderRadius: 1.5 } } }}
      >
        {menu?.record.kind === "expense" && (
          <>
            <MenuItem
              onClick={() => {
                setDialog({ mode: "edit", record: menu.record });
                setMenu(null);
              }}
              sx={desktopPaymentMenuItemSx}
            >
              <EditOutlinedIcon fontSize="small" />
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                setDialog({ mode: "delete", record: menu.record });
                setMenu(null);
              }}
              sx={{ ...desktopPaymentMenuItemSx, color: "error.main" }}
            >
              <DeleteOutlineRoundedIcon fontSize="small" />
              Delete
            </MenuItem>
          </>
        )}
      </Menu>
      <DesktopPaymentDialog
        dialog={dialog}
        onClose={close}
        onDelete={deleteRecord}
        dateMode={dateMode}
        setDateMode={setDateMode}
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
      />
    </Paper>
  );
}

function DesktopPaymentFilter({
  label,
  active,
  onClick,
  icon,
  tone = "primary.main",
}) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      startIcon={icon}
      sx={{
        minWidth: 128,
        minHeight: 42,
        borderRadius: 1.25,
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "primary.main" : "background.paper",
        color: active ? "common.white" : tone,
        textTransform: "none",
        fontWeight: 700,
      }}
    >
      {label}
    </Button>
  );
}


function DesktopPaymentDialog({
  dialog,
  onClose,
  onDelete,
  dateMode,
  setDateMode,
  from,
  setFrom,
  to,
  setTo,
}) {
  if (!dialog) return null;
  const { mode, record } = dialog;
  const title =
    mode === "entry" || mode === "add"
      ? "Add Payment"
      : mode === "pay"
        ? "Record Payment"
        : mode === "edit"
          ? "Edit Payment"
          : mode === "details"
            ? "Payment Details"
            : mode === "delete"
              ? "Delete Payment"
              : "";
  if (mode === "supplier-history")
    return (
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
      >
        <DialogContent sx={desktopPaymentDialogContentSx}>
          <SupplierHistoryPage embedded />
        </DialogContent>
        <Divider />
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", px: 2.5, py: 1.5 }}
        >
          <Button onClick={onClose} sx={desktopPaymentTextButtonSx}>
            Close
          </Button>
        </Box>
      </Dialog>
    );
  if (mode === "date")
    return (
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
      >
        <DialogContent sx={desktopPaymentDialogContentSx}>
          <Box sx={desktopPaymentDialogTitleSx}>
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
              Date and time
            </Typography>
            <IconButton aria-label="Close date filter" onClick={onClose}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
            }}
          >
            <FilterButton
              label="All"
              active={dateMode === "all"}
              onClick={() => setDateMode("all")}
            />
            <FilterButton
              label="Today"
              active={dateMode === "today"}
              onClick={() => setDateMode("today")}
            />
            <FilterButton
              label="Custom"
              active={dateMode === "custom"}
              onClick={() => setDateMode("custom")}
            />
          </Box>
          {dateMode === "custom" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.5,
                mt: 1.75,
              }}
            >
              <TextField
                label="From"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          )}
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              mt: 2.5,
            }}
          >
            <Button
              onClick={() => {
                setDateMode("all");
                setFrom("");
                setTo("");
              }}
              sx={desktopPaymentTextButtonSx}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              onClick={onClose}
              sx={desktopPaymentActionSx}
            >
              Apply
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    );
  if (mode === "history") return <DesktopPaymentHistory onClose={onClose} />;
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
    >
      <DialogContent sx={desktopPaymentDialogContentSx}>
        <Box sx={desktopPaymentDialogTitleSx}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
            {title}
          </Typography>
          <IconButton aria-label="Close payment dialog" onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        {mode === "delete" ? (
          <Typography color="text.secondary">
            Delete <strong>{record.name}</strong>? This permanently removes this
            expense record.
          </Typography>
        ) : mode === "details" ? (
          <DesktopPaymentDetails record={record} />
        ) : mode === "pay" ? (
          <DesktopSupplierPaymentForm record={record} />
        ) : (
          <DesktopPaymentForm record={record} />
        )}
      </DialogContent>
      <Divider />
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 1,
          px: 2.5,
          py: 1.5,
        }}
      >
        <Button onClick={onClose} sx={desktopPaymentTextButtonSx}>
          {mode === "details" ? "Close" : "Cancel"}
        </Button>
        {mode === "delete" ? (
          <Button
            variant="contained"
            color="error"
            onClick={() => onDelete(record).catch(() => {})}
            sx={desktopPaymentActionSx}
          >
            Delete
          </Button>
        ) : (
          mode !== "details" && (
            <Button
              variant="contained"
              onClick={onClose}
              sx={desktopPaymentActionSx}
            >
              {mode === "edit"
                ? "Save Payment"
                : mode === "pay"
                  ? "Record Payment"
                  : "Add Payment"}
            </Button>
          )
        )}
      </Box>
    </Dialog>
  );
}

function DesktopPaymentForm({ record }) {
  const [method, setMethod] = useState(record?.method || "Cash");
  const [type, setType] = useState(
    record?.kind === "income" ? "income" : "expense",
  );
  return (
    <Stack spacing={1.5}>
      <TextField label="Name" defaultValue={record?.name ?? ""} fullWidth />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField
          select
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <MenuItem value="expense">Expense</MenuItem>
          <MenuItem value="income">Income</MenuItem>
        </TextField>
        <TextField
          label="Amount"
          type="number"
          defaultValue={record?.amount ?? ""}
        />
      </Box>
      <TextField
        select
        label="Payment method"
        value={method}
        onChange={(event) => setMethod(event.target.value)}
      >
        <MenuItem value="Cash">Cash</MenuItem>
        <MenuItem value="KBZPay">KBZPay</MenuItem>
        <MenuItem value="Wave">Wave</MenuItem>
      </TextField>
      <TextField
        label="Date"
        type="date"
        defaultValue={record?.date ?? ""}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Remark"
        defaultValue={record?.remark ?? ""}
        multiline
        minRows={2}
      />
    </Stack>
  );
}

function DesktopSupplierPaymentForm({ record }) {
  const [method, setMethod] = useState("Cash");
  return (
    <Stack spacing={1.5}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          bgcolor: "#f4f8ff",
          border: "1px solid",
          borderColor: "primary.light",
          borderRadius: 1.5,
        }}
      >
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>
          {record.name} · Outstanding balance
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 800 }}>
          {money(record.amount)}
        </Typography>
      </Paper>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField
          select
          label="Payment method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <MenuItem value="Cash">Cash</MenuItem>
          <MenuItem value="KBZPay">KBZPay</MenuItem>
          <MenuItem value="Wave">Wave</MenuItem>
        </TextField>
        <TextField label="Amount" type="number" defaultValue={record.amount} />
      </Box>
      <TextField label="Receiver name" placeholder="Enter receiver name" />
      {method === "Cash" ? (
        <Box
          sx={{
            p: 1.5,
            minHeight: 100,
            border: "1px dashed",
            borderColor: "primary.light",
            borderRadius: 1.5,
            bgcolor: "#fafcff",
          }}
        >
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            Receiver Signature
          </Typography>
        </Box>
      ) : (
        <TextField label="Transaction ID" placeholder="Enter transaction ID" />
      )}
    </Stack>
  );
}

function DesktopPaymentDetails({ record }) {
  const details =
    record.kind === "supplier"
      ? [
          ["Supplier Name", record.name],
          ["Phone", "09 123 456 789"],
          ["Invoice Number", record.id],
          ["Delivery Name", "Ko Aung"],
          ["Delivery Phone", "09 987 654 321"],
          ["Receiver Name", "Store Manager"],
          ["Receive Date", record.date.split("-").reverse().join("/")],
          ["Payment Status", record.status],
          ["Total Amount", money(record.amount)],
        ]
      : record.kind === "receivable"
        ? [
            ["Buyer Name", record.buyer || record.name],
            ["Invoice Number", record.id],
            ["Qty", `${record.qty || 1} pcs`],
            ["Amount", money(record.amount)],
            ["Status", record.status],
            [
              record.status === "Paid" ? "Paid Date" : "Due Date",
              record.date.split("-").reverse().join("/"),
            ],
          ]
        : [
            ["Name", record.name],
            ["Type", "Expense"],
            ["Status", record.status],
            ["Amount", money(record.amount)],
            ["Payment Method", record.method],
            ["Date", record.date.split("-").reverse().join("/")],
            ["Remark", record.remark || "—"],
          ];
  const settlement = record.settlement;
  return (
    <Stack spacing={1.25}>
      {details.map(([label, value]) => (
        <Box
          key={label}
          sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
        >
          <Typography color="text.secondary">{label}</Typography>
          <Typography fontWeight={700}>{value}</Typography>
        </Box>
      ))}
      {settlement && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Typography sx={{ fontWeight: 700 }}>Payment record</Typography>
          <Box sx={{ display: "grid", gap: 0.8 }}>
            {[
              [
                "Paid date",
                settlement.paidDate?.split("-").reverse().join("/"),
              ],
              ["Payment method", record.method],
              ...(record.method === "Cash"
                ? [
                    ["Receiver name", settlement.receiver],
                    ["Receiver signature", settlement.signature],
                  ]
                : [
                    ["User name", settlement.username],
                    ["Account number", settlement.account],
                    ["Transaction ID", settlement.transactionId],
                  ]),
            ].map(([label, value]) => (
              <Box
                key={label}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Typography color="text.secondary">{label}</Typography>
                <Typography fontWeight={700}>{value}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Stack>
  );
}

function DesktopPaymentHistory({ onClose }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [method, setMethod] = useState("All");
  const [dateMode, setDateMode] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const records = desktopPayments.filter(
    (item) =>
      item.status === "Paid" &&
      (method === "All" || item.method === method) &&
      (dateMode !== "custom" ||
        ((!from || item.date >= from) && (!to || item.date <= to))),
  );
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
    >
      <DialogContent sx={desktopPaymentDialogContentSx}>
        <Box sx={desktopPaymentDialogTitleSx}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
            Payment History
          </Typography>
          <Box>
            <IconButton
              aria-label="Filter payment history"
              onClick={() => setFilterOpen(true)}
              sx={{ color: "primary.main" }}
            >
              <FilterAltOutlinedIcon />
            </IconButton>
            <IconButton aria-label="Close payment history" onClick={onClose}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>
        </Box>
        <Stack spacing={1.25}>
          {records.map((item) => (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 1.5 }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <Box>
                  <Chip
                    label="Paid"
                    size="small"
                    sx={{
                      height: 24,
                      color: "#278a45",
                      bgcolor: "#e5f5e8",
                      fontWeight: 700,
                      mb: 0.75,
                    }}
                  />
                  <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                  <Typography
                    color="text.secondary"
                    sx={{ mt: 0.4, fontSize: 13 }}
                  >
                    Invoice: {item.id} · Paid:{" "}
                    {item.date.split("-").reverse().join("/")}
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
      </DialogContent>
      <Dialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
      >
        <DialogContent sx={desktopPaymentDialogContentSx}>
          <Box sx={desktopPaymentDialogTitleSx}>
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
              Filter payments
            </Typography>
            <IconButton
              aria-label="Close payment filters"
              onClick={() => setFilterOpen(false)}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Typography sx={filterLabelSx}>Date</Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              mt: 1,
            }}
          >
            <FilterButton
              label="All"
              active={dateMode === "all"}
              onClick={() => setDateMode("all")}
            />
            <FilterButton
              label="Today"
              active={dateMode === "today"}
              onClick={() => setDateMode("today")}
            />
            <FilterButton
              label="Custom"
              active={dateMode === "custom"}
              onClick={() => setDateMode("custom")}
            />
          </Box>
          {dateMode === "custom" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.5,
                mt: 1.5,
              }}
            >
              <TextField
                label="From"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          )}
          <Typography sx={{ ...filterLabelSx, mt: 2.5 }}>
            Payment Method
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              mt: 1,
            }}
          >
            {["All", "Cash", "KBZPay", "Wave"].map((value) => (
              <FilterButton
                key={value}
                label={value}
                active={method === value}
                onClick={() => setMethod(value)}
              />
            ))}
          </Box>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setFilterOpen(false)}
            sx={{
              mt: 2.5,
              minHeight: 50,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Apply filters
          </Button>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function StatusButton({ label, active, onClick, icon, color }) {
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      sx={{
        minWidth: "max-content",
        flex: "1 0 auto",
        minHeight: 54,
        px: 1,
        borderRadius: 1.25,
        border: "1px solid",
        borderColor: active ? "primary.main" : "#dfe3e8",
        bgcolor: active ? "primary.main" : "background.paper",
        color: active ? "common.white" : (color ?? "text.primary"),
        fontSize: 15,
        fontWeight: 700,
        textTransform: "none",
        "& .MuiButton-startIcon": {
          mr: 0.65,
          "& .MuiSvgIcon-root": { fontSize: 22 },
        },
      }}
    >
      {label}
    </Button>
  );
}

const PaymentCard = memo(function PaymentCard({ payment, onClick, onMenu }) {
  const cancelled = ["Cancel", "Cancelled"].includes(payment.status);
  const paid = payment.status === "Paid";
  const showRemaining =
    !cancelled &&
    ["sale", "supplier", "supplier-delivery"].includes(payment.kind) &&
    Number(payment.remainingAmount || 0) > 0;
  const detailLabel =
    payment.kind === "expense"
      ? "Expense"
      : payment.kind === "income"
        ? "Income"
        : payment.id;
  const tone =
    cancelled
      ? "#d14343"
      : paid || payment.kind === "income" || payment.kind === "expense"
        ? "#168437"
        : payment.kind === "receivable"
          ? "#7b4cc2"
          : "#ef6c00";
  return (
    <Paper
      elevation={2}
      onClick={() => onClick(payment)}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gridTemplateRows: "auto auto auto",
        columnGap: 1.5,
        rowGap: 1.15,
        alignItems: "center",
        cursor: "pointer",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
      }}
    >
      <Chip
        label={cancelled ? "Cancel" : payment.status}
        size="small"
        sx={{
          gridColumn: 1,
          gridRow: 1,
          justifySelf: "start",
          height: 28,
          bgcolor:
            cancelled
              ? "#fff1f0"
              : paid
                ? "#e3f5e6"
                : payment.kind === "receivable"
                  ? "#f1eaff"
                  : "#fff1e4",
          color: tone,
          fontSize: 13,
          fontWeight: 600,
          "& .MuiChip-label": { px: 1.1 },
          borderRadius: 1,
        }}
      />
      <Typography
        noWrap
        sx={{
          gridColumn: "1 / 3",
          gridRow: 2,
          minWidth: 0,
          fontSize: 17,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "text.primary",
        }}
      >
        {payment.name}
      </Typography>
      <Stack
        direction="row"
        spacing={0.65}
        alignItems="baseline"
        sx={{
          gridColumn: 3,
          gridRow: 2,
          justifySelf: "end",
          whiteSpace: "nowrap",
        }}
      >
        {payment.method && (
          <Typography noWrap sx={{ color: tone, fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
            {payment.method}
          </Typography>
        )}
        <Typography noWrap sx={{ color: "text.primary", fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
          {money(payment.amount)}
        </Typography>
      </Stack>
      <Typography
        noWrap
        sx={{
          gridColumn: 1,
          gridRow: 3,
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.3,
          color:
            payment.kind === "expense"
              ? "#d14343"
              : payment.kind === "income"
                ? "#168437"
                : "text.secondary",
        }}
      >
        {detailLabel}
      </Typography>
      <Box
        sx={{
          gridColumn: "2 / 4",
          gridRow: 1,
          display: "flex",
          minWidth: 0,
          alignItems: "center",
          gap: 0.55,
          color: tone,
          justifySelf: "end",
        }}
      >
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            px: 0.55,
            minHeight: 18,
            borderRadius: 0.65,
            display: "inline-flex",
            alignItems: "center",
            bgcolor: cancelled ? "#fff1f0" : paid ? "#e3f5e6" : "#fff1e4",
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          Date
        </Box>
        <Typography
          noWrap
          component="span"
          sx={{
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.3,
            color: "inherit",
          }}
        >
          {payment.date.split("-").reverse().join("/")}
        </Typography>
      </Box>
      <Stack
        direction="row"
        spacing={0.65}
        alignItems="center"
        sx={{ gridColumn: "2 / 4", gridRow: 3, justifySelf: "end", minWidth: 0, minHeight: 28 }}
      >
        {showRemaining && (
          <Typography
            noWrap
            sx={{
              color: "#ef6c00",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            Remaining {money(payment.remainingAmount)}
          </Typography>
        )}
        <IconButton
          aria-label={`More actions for ${payment.name}`}
          onClick={(event) => onMenu(event, payment)}
          disabled={cancelled}
          size="small"
          sx={{ width: 28, height: 28, p: 0, flexShrink: 0 }}
        >
          <MoreVertRoundedIcon sx={{ fontSize: 21 }} />
        </IconButton>
      </Stack>
    </Paper>
  );
});

const DesktopPaymentCard = memo(function DesktopPaymentCard({ payment, onClick, onMenu }) {
  const cancelled = ["Cancel", "Cancelled"].includes(payment.status);
  const paid = payment.status === "Paid";
  const showRemaining = !cancelled && Number(payment.remainingAmount || 0) > 0;
  const detailLabel =
    payment.kind === "expense"
      ? "Expense"
      : payment.kind === "income"
        ? "Income"
        : payment.id;
  const dateLabel =
    cancelled ||
    (payment.kind === "sale" && ["Unpaid", "Partial"].includes(payment.status))
      ? "Date"
      : payment.dateLabel;
  const tone =
    cancelled
      ? "#d14343"
      : paid || payment.kind === "income" || payment.kind === "expense"
        ? "#168437"
        : payment.kind === "receivable"
          ? "#7b4cc2"
          : "#ef6c00";
  return (
    <Box sx={{ minWidth: 0 }}><Paper
      elevation={2}
      onClick={() => onClick(payment)}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gridTemplateRows: "auto auto auto auto",
        height: "100%",
        boxSizing: "border-box",
        columnGap: 1.5,
        rowGap: 1.25,
        alignItems: "center",
        cursor: "pointer",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
        minWidth: 0,
        "& > *": { minWidth: 0 },
      }}
    >
      <Chip
        label={cancelled ? "Cancel" : payment.status}
        size="small"
        sx={{
          gridColumn: 1,
          gridRow: 1,
          justifySelf: "start",
          height: 28,
          bgcolor:
            cancelled
              ? "#fff1f0"
              : paid
                ? "#e3f5e6"
                : payment.kind === "receivable"
                  ? "#f1eaff"
                  : "#fff1e4",
          color: tone,
          fontSize: 13,
          fontWeight: 600,
          "& .MuiChip-label": { px: 1.1 },
          borderRadius: 1,
        }}
      />
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
        {payment.name}
      </Typography>
      <Typography
        noWrap
        sx={{
          gridColumn: 2,
          gridRow: 2,
          justifySelf: "end",
          textAlign: "right",
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.2,
          color: "text.primary",
          whiteSpace: "nowrap",
        }}
      >
        {money(payment.amount)}
      </Typography>
      <Typography
        noWrap
        sx={{
          gridColumn: 1,
          gridRow: 3,
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.3,
          color:
            payment.kind === "expense"
              ? "#d14343"
              : payment.kind === "income"
                ? "#168437"
                : "text.secondary",
        }}
      >
        {detailLabel}
      </Typography>
      {(showRemaining || (paid && payment.method)) && (
        <Typography
          noWrap
          sx={{
            gridColumn: 2,
            gridRow: 3,
            justifySelf: "end",
            textAlign: "right",
            fontSize: showRemaining ? 12.5 : 13.5,
            fontWeight: 700,
            lineHeight: 1.3,
            color: showRemaining ? "#ef6c00" : tone,
          }}
        >
          {showRemaining
            ? `Remaining ${money(payment.remainingAmount)}`
            : payment.method}
        </Typography>
      )}
      <Box
        sx={{
          gridColumn: "1 / -1",
          gridRow: 4,
          display: "flex",
          minWidth: 0,
          alignItems: "center",
          gap: 0.65,
          color: tone,
        }}
      >
        <CalendarTodayOutlinedIcon sx={{ fontSize: 17, flexShrink: 0 }} />
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.3,
            color: "inherit",
          }}
        >
          {dateLabel}:{" "}
          <Box
            component="span"
            sx={{ color: "inherit", fontSize: 13, fontWeight: 500 }}
          >
            {payment.date.split("-").reverse().join("/")}
          </Box>
        </Typography>
      </Box>
      <IconButton
        aria-label={`More actions for ${payment.name}`}
        onClick={(event) => onMenu(event, payment)}
        disabled={cancelled}
        size="small"
        sx={{ gridColumn: 2, gridRow: 1, justifySelf: "end", p: 0.25 }}
      >
        <MoreVertRoundedIcon />
      </IconButton>
    </Paper></Box>
  );
});

function MobilePaymentDialog({
  dialog,
  onClose,
  onSave,
  onDelete,
  onOrderPay,
  onDeleteSale,
  onCancelSalePayment,
  onCancelSupplierPayment,
  paymentMethods,
  saving,
  error,
}) {
  const isMobile = useMediaQuery("(max-width:768px)");
  const [form, setForm] = useState({
    name: "",
    type: "expense",
    amount: "",
    method: "Cash",
    date: "",
    remark: "",
  });
  if (!dialog) return null;
  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const record = dialog.record;
  if (!isMobile && dialog.mode === "select-supplier-payment") return <PaymentCancellationDialog key={record.apiId} kind="supplier" recordId={record.apiId} onClose={onClose} />;
  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      slotProps={{
        paper: { sx: { m: 2.5, borderRadius: 2.5, maxWidth: 420 } },
      }}
    >
      <DialogContent sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2.25,
          }}
        >
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
            {dialog.mode === "entry"
              ? "Add Payment"
              : dialog.mode === "delete" || dialog.mode === "delete-sale"
                ? "Delete Payment"
                : dialog.mode === "cancel-sale-payment" || dialog.mode === "select-sale-payment"
                  ? "Cancel Sale Payment"
                  : dialog.mode === "select-supplier-payment"
                    ? "Cancel Supplier Payment"
                  : dialog.mode === "order-pay"
                    ? "Record Sale Payment"
                    : record.kind === "expense"
                      ? "Expense Details"
                      : "Payment Details"}
          </Typography>
          <IconButton
            aria-label="Close payment dialog"
            disabled={saving}
            onClick={onClose}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {dialog.mode === "select-sale-payment" || dialog.mode === "select-supplier-payment" ? (
          <PaymentCancellationForm
            key={`${dialog.mode}:${record.apiId || record.id}:${(record.paymentOptions || []).map((payment) => payment.id).join("|")}`}
            mode={dialog.mode}
            record={record}
            saving={saving}
            onCancelSalePayment={onCancelSalePayment}
            onCancelSupplierPayment={onCancelSupplierPayment}
          />
        ) : dialog.mode === "delete" ||
          dialog.mode === "delete-sale" ||
          dialog.mode === "cancel-sale-payment" ? (
          <Stack spacing={1.5}>
            <Typography color="text.secondary">
              {dialog.mode === "cancel-sale-payment" ? (
                <>
                  Cancel this payment for <strong>{record.name}</strong>?
                </>
              ) : (
                <>
                  Cancel <strong>{record.name}</strong>? This keeps the
                  cancelled record for history.
                </>
              )}
            </Typography>
            <Button
              color="error"
              variant="contained"
              disabled={saving}
              onClick={() =>
                dialog.mode === "delete-sale"
                  ? onDeleteSale(record)
                  : dialog.mode === "cancel-sale-payment"
                    ? onCancelSalePayment(record)
                    : onDelete(record)
              }
              sx={{ minHeight: 50, fontWeight: 700, textTransform: "none" }}
            >
              {saving
                ? "Saving…"
                : dialog.mode === "cancel-sale-payment"
                  ? "Cancel Payment"
                  : "Cancel"}
            </Button>
          </Stack>
        ) : dialog.mode === "order-pay" ? (
          <OrderPaymentForm
            key={`order-pay:${record.apiId || record.id}:${(paymentMethods || []).join("|")}`}
            record={record}
            paymentMethods={paymentMethods}
            saving={saving}
            onOrderPay={onOrderPay}
          />
        ) : dialog.mode === "entry" ? (
          <Stack spacing={1.5}>
            <TextField
              label="Name"
              value={form.name}
              onChange={update("name")}
              fullWidth
            />
            <TextField
              select
              label="Type"
              value={form.type}
              onChange={update("type")}
              fullWidth
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
            </TextField>
            <TextField
              label="Amount"
              type="number"
              value={form.amount}
              onChange={update("amount")}
              fullWidth
            />
            <TextField
              select
              label="Payment method"
              value={form.method}
              onChange={update("method")}
              fullWidth
            >
              {(paymentMethods?.length ? paymentMethods : ["Cash"]).map(
                (method) => (
                  <MenuItem key={method} value={method}>
                    {method}
                  </MenuItem>
                ),
              )}
            </TextField>
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={update("date")}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Remark"
              value={form.remark}
              onChange={update("remark")}
              multiline
              minRows={2}
              fullWidth
            />
            <Button
              variant="contained"
              disabled={saving}
              onClick={() => onSave(form)}
              sx={{ minHeight: 50, fontWeight: 700, textTransform: "none" }}
            >
              {saving ? "Saving…" : "Save Payment"}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.2}>
            {record.kind === "sale" ? (
              <>
                <MobileDetail label="Name" value="Sale" />
                <MobileDetail label="Type" value="Sale" />
                <MobileDetail label="Invoice number" value={record.id} />
                <MobileDetail label="Amount" value={money(record.amount)} />
                <MobileDetail label="Status" value={record.status} />
              </>
            ) : (
              <>
                <MobileDetail label="Name" value={record.name} />
                <MobileDetail
                  label="Type"
                  value={
                    record.kind === "income"
                      ? "Income"
                      : record.kind === "expense"
                        ? "Expense"
                        : "Supplier payment"
                  }
                />
                <MobileDetail label="Amount" value={money(record.amount)} />
                <MobileDetail label="Payment method" value={record.method} />
                <MobileDetail
                  label="Date"
                  value={record.date.split("-").reverse().join("/")}
                />
                <MobileDetail label="Remark" value={record.remark || "—"} />
              </>
            )}
            <Button
              variant="contained"
              disabled={saving}
              onClick={onClose}
              sx={{
                mt: 1,
                minHeight: 46,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Close
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentCancellationForm({
  mode,
  record,
  saving,
  onCancelSalePayment,
  onCancelSupplierPayment,
}) {
  const [selectedPaymentId, setSelectedPaymentId] = useState(
    () => record.paymentOptions?.[0]?.id || "",
  );
  const [reason, setReason] = useState("");
  const isSupplierPayment = mode === "select-supplier-payment";
  return (
    <Stack spacing={1.5}>
      <Typography color="text.secondary">
        Choose the payment to cancel and enter a cancellation reason.
      </Typography>
      <TextField
        select
        label="Payment"
        value={selectedPaymentId}
        onChange={(event) => setSelectedPaymentId(event.target.value)}
        fullWidth
      >
        {(record.paymentOptions || []).map((payment) => (
          <MenuItem key={payment.id} value={payment.id}>
            {payment.method} · {money(payment.amount)} ·{" "}
            {new Date(payment.paidAt).toLocaleDateString()}
          </MenuItem>
        ))}
      </TextField>
      {isSupplierPayment && (
        <TextField
          label="Cancel Payment Reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          fullWidth
        />
      )}
      <Button
        color="error"
        variant="contained"
        disabled={saving || !selectedPaymentId || (isSupplierPayment && !reason.trim())}
        onClick={() =>
          isSupplierPayment
            ? onCancelSupplierPayment(record, selectedPaymentId, reason)
            : onCancelSalePayment(record, selectedPaymentId)
        }
        sx={{ minHeight: 50, fontWeight: 700, textTransform: "none" }}
      >
        {saving ? "Saving…" : "Cancel Payment"}
      </Button>
    </Stack>
  );
}

function OrderPaymentForm({ record, paymentMethods, saving, onOrderPay }) {
  const [orderPayment, setOrderPayment] = useState(() => ({
    amount: String(record.remainingAmount || record.amount || ""),
    method: paymentMethods?.[0] || "Cash",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  }));
  const methods = paymentMethods?.length ? paymentMethods : ["Cash"];
  return (
    <Stack spacing={1.5}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          bgcolor: "#f4f8ff",
          border: "1px solid",
          borderColor: "primary.light",
          borderRadius: 1.5,
        }}
      >
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>
          Invoice {record.id} · Remaining balance
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 800 }}>
          {money(record.remainingAmount ?? record.amount)}
        </Typography>
      </Paper>
      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
        The full remaining balance will be settled automatically.
      </Typography>
      <TextField
        select
        label="Payment method"
        value={orderPayment.method}
        onChange={(event) =>
          setOrderPayment((current) => ({
            ...current,
            method: event.target.value,
          }))
        }
        fullWidth
      >
        {methods.map((method) => (
          <MenuItem key={method} value={method}>
            {method}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Date"
        type="date"
        value={orderPayment.date}
        onChange={(event) =>
          setOrderPayment((current) => ({ ...current, date: event.target.value }))
        }
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
      />
      <TextField
        label="Remark"
        value={orderPayment.note}
        onChange={(event) =>
          setOrderPayment((current) => ({ ...current, note: event.target.value }))
        }
        multiline
        minRows={2}
        fullWidth
      />
      <Button
        variant="contained"
        disabled={saving || !Number(orderPayment.amount)}
        onClick={() =>
          onOrderPay(record, {
            amount: Number(orderPayment.amount),
            method: orderPayment.method,
            ...(orderPayment.note.trim() ? { note: orderPayment.note.trim() } : {}),
          })
        }
        sx={{ minHeight: 50, fontWeight: 700, textTransform: "none" }}
      >
        {saving ? "Saving…" : "Record Payment"}
      </Button>
    </Stack>
  );
}

function MobileDetail({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={700}>{value}</Typography>
    </Box>
  );
}

function FilterButton({ label, active, onClick }) {
  return (
    <Button
      variant={active ? "contained" : "outlined"}
      onClick={onClick}
      sx={{
        minHeight: 48,
        borderRadius: 1.5,
        borderColor: active ? "primary.main" : "divider",
        color: active ? "common.white" : "text.primary",
        fontSize: 14,
        fontWeight: 600,
        textTransform: "none",
      }}
    >
      {label}
    </Button>
  );
}

const topBarSx = {
  height: 68,
  px: 1.5,
  bgcolor: "primary.main",
  color: "common.white",
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) 48px",
  alignItems: "center",
  boxShadow: "0 2px 5px rgba(0,0,0,0.16)",
};
const topIconSx = { width: 48, height: 48, color: "inherit" };
const searchSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 56,
    px: 1.5,
    borderRadius: 1.5,
    bgcolor: "#f7f8fa",
    fontSize: 16,
    "& fieldset": { borderColor: "#e3e6ea" },
  },
};
const footerPrimarySx = {
  minHeight: 58,
  borderRadius: 1.5,
  fontSize: 17,
  fontWeight: 700,
  textTransform: "none",
};
const footerSecondarySx = {
  minHeight: 58,
  borderRadius: 1.5,
  borderColor: "divider",
  color: "primary.main",
  fontSize: 17,
  fontWeight: 700,
  textTransform: "none",
};
const filterLabelSx = {
  fontSize: 14,
  fontWeight: 600,
  color: "text.secondary",
};
const dateInputSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 1.5,
    bgcolor: "action.hover",
    "& fieldset": { border: 0 },
  },
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
const desktopPaymentPageSx = {
  maxWidth: 1600,
  mx: "auto",
  p: 2.25,
  borderRadius: 2.25,
  border: "1px solid",
  borderColor: "divider",
  boxShadow: "0 2px 10px rgba(15,23,42,.05)",
  bgcolor: "background.paper",
};
const desktopPaymentToolbarSx = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: 1.5,
  alignItems: "center",
};
const desktopPaymentSearchSx = {
  "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 1.25 },
};
const desktopPaymentPrimarySx = {
  minHeight: 44,
  px: 2.25,
  borderRadius: 1.25,
  textTransform: "none",
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const desktopPaymentDateSx = {
  minHeight: 44,
  px: 1.75,
  borderRadius: 1.25,
  borderColor: "divider",
  color: "text.primary",
  textTransform: "none",
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const desktopPaymentHistorySx = {
  minHeight: 42,
  minWidth: 124,
  borderRadius: 1.25,
  borderColor: "divider",
  color: "text.primary",
  textTransform: "none",
  fontWeight: 700,
};
const desktopPaymentSummarySx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  mt: 2.25,
  pb: 1.75,
  borderBottom: "1px solid",
  borderColor: "divider",
};
const desktopPaymentGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 1.75,
  pt: 1.75,
};
const desktopPaymentMenuItemSx = {
  minHeight: 42,
  gap: 1,
  fontWeight: 600,
  fontSize: 14,
};
const desktopPaymentDialogContentSx = { p: 2.5, "&:last-child": { pb: 2.5 } };
const desktopPaymentDialogTitleSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 2,
  mb: 2.25,
};
const desktopPaymentTextButtonSx = {
  minHeight: 40,
  textTransform: "none",
  fontWeight: 700,
};
const desktopPaymentActionSx = {
  minHeight: 40,
  px: 2.25,
  borderRadius: 1.25,
  textTransform: "none",
  fontWeight: 700,
};
