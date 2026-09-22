import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { usePosApi } from "../../hooks/useApiResource";
import { useOrderCancelMutation, useOrderQuery, useOrdersQuery } from "../../hooks/usePosQueries";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../lib/queryKeys";
import OrderDetailsPage from "./OrderDetailsPage";
import PaymentCancellationDialog from "../../components/PaymentCancellationDialog";
import { refundableSalePayments } from "../../lib/refundablePayments";
import { salePaymentDisplay, sumActiveSaleAmounts } from "../../lib/salePaymentDisplay";

const initialFilters = {
  range: "all",
  from: "",
  to: "",
  orderStatus: "all",
  paymentStatus: "all",
};
const ordersSearchStorageKey = "pos.orders.search";

const formatKyat = (amount) =>
  `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;

function matchesDateRange(orderDate, range, latestOrderDate) {
  if (range === "all" || range === "custom") return true;
  return range === "today" ? orderDate === latestOrderDate : true;
}

function FilterChoiceButton({ active, children, onClick }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      sx={{
        minHeight: 42,
        borderRadius: 2,
        borderColor: active ? "#1976d2" : "#d8dee9",
        bgcolor: active ? "#eaf3ff" : "#fff",
        color: active ? "#1976d2" : "text.primary",
        fontWeight: 400,
        fontSize: 12,
        "&:hover": {
          borderColor: "#1976d2",
          bgcolor: active ? "#eaf3ff" : "#f8fbff",
        },
      }}
    >
      {children}
    </Button>
  );
}

function FilterSection({ icon, title, children }) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.2 }}>
        {icon}
        <Typography color="text.primary" fontWeight={400}>{title}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

export default function SalePage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { data: orderResponse } = useOrdersQuery({ pageSize: 100, view: "summary" });
  const cancelOrderMutation = useOrderCancelMutation();
  const [search, setSearch] = useState(() => window.sessionStorage.getItem(ordersSearchStorageKey) || "");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuOrder, setMenuOrder] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const openOrder = (id) => {
    queryClient.prefetchQuery({ queryKey: queryKeys.order(shop?.id, id), queryFn: () => api.orders.get(id), staleTime: 30_000 });
    navigate(`/sale/${id}`);
  };

  useEffect(() => {
    const openFilters = () => {
      setDraftFilters(filters);
      setFilterOpen(true);
    };
    window.addEventListener("orders-filter", openFilters);
    return () => window.removeEventListener("orders-filter", openFilters);
  }, [filters]);

  useEffect(() => {
    if (search.trim()) window.sessionStorage.setItem(ordersSearchStorageKey, search);
    else window.sessionStorage.removeItem(ordersSearchStorageKey);
  }, [search]);

  const orders = useMemo(() => (orderResponse?.orders || []).map((order) => {
        const createdAt = new Date(order.createdAt);
        const effectiveTotal = Number(order.effectiveTotal ?? order.total ?? 0);
        const paymentDisplay = salePaymentDisplay(order.payments, effectiveTotal);
        return {
          id: order.id,
          displayId: order.orderNumber || order.id,
          amount: effectiveTotal,
          quantity: (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0),
          time: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          date: createdAt.toISOString().slice(0, 10),
          status: order.fulfillmentStatus === "cancelled" ? "Cancel" : "Done",
          paymentStatus: paymentDisplay.status,
          paymentMethod: paymentDisplay.label,
          subtotal: Number(order.subtotal || order.total || 0),
          discount: Number(order.discount || 0),
          deliveryFee: Number(order.deliveryFee || 0),
          customerName: order.customer?.name || "Walk-in",
          items: order.items || [],
          hasPaymentRecord: (order.payments || []).length > 0,
          activePaymentRecordCount: refundableSalePayments(order.payments || []).length,
        };
      }), [orderResponse]);

  const filteredOrders = useMemo(() => {
    const latestOrderDate = orders.reduce(
      (latest, order) => (order.date > latest ? order.date : latest),
      "",
    );

    return orders.filter((order) => {
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch = !normalizedSearch || [order.displayId, order.id, order.customerName, order.paymentMethod, ...(order.items || []).map((item) => item.productName)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesOrderStatus = filters.orderStatus === "all" ||
        (filters.orderStatus === "cancelled" ? order.status === "Cancel" : order.status.toLowerCase() === filters.orderStatus);
      const matchesPaymentStatus =
        filters.paymentStatus === "all" ||
        (order.status !== "Cancel" && order.paymentStatus.toLowerCase() === filters.paymentStatus);
      const matchesFrom = !filters.from || order.date >= filters.from;
      const matchesTo = !filters.to || order.date <= filters.to;
      const matchesRange = matchesDateRange(
        order.date,
        filters.range,
        latestOrderDate,
      );
      return (
        matchesSearch &&
        matchesOrderStatus &&
        matchesPaymentStatus &&
        matchesFrom &&
        matchesTo &&
        matchesRange
      );
    });
  }, [filters, orders, search]);

  const totalAmount = sumActiveSaleAmounts(filteredOrders);

  const updateDraft = (field, value) =>
    setDraftFilters((current) => ({ ...current, [field]: value }));

  const applyFilters = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
  };

  const deleteOrder = async (id) => {
    if (cancelOrderMutation.isPending) return;
    try {
      const { order } = await api.orders.get(id);
      if (order.fulfillmentStatus !== "cancelled") setCancelTarget(id);
    } catch (error) {
      window.alert(error.message || "This order cannot be deleted.");
      throw error;
    }
  };
  const removeOrder = () => {
    deleteOrder(menuOrder?.id).catch(() => {});
    setMenuAnchor(null);
    setMenuOrder(null);
  };

  const cancellationDialog = cancelTarget && <PaymentCancellationDialog key={cancelTarget} kind="sale" recordId={cancelTarget} onClose={() => setCancelTarget(null)} />;

  if (!isMobile) return <>{cancellationDialog}<DesktopOrdersPage orders={filteredOrders} search={search} setSearch={setSearch} totalAmount={totalAmount} filters={filters} setFilters={setFilters} onDelete={(id) => deleteOrder(id).catch(() => {})} deleting={cancelOrderMutation.isPending} onCreateOrder={() => navigate("/sale/create")} /></>;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", px: 3, py: 3 }}>
      {cancellationDialog}
      <TextField
        fullWidth
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by order number, customer, product, or payment method"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon />
            </InputAdornment>
          ),
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: "#fff",
            borderRadius: 2.5,
            "& fieldset": { borderColor: "#1976d2", borderWidth: 2 },
          },
        }}
      />

      <Box sx={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", mt: 3, mb: 2 }}>
        <Typography color="#878787" fontSize={14} fontWeight={700}>
          {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"}
        </Typography>
        <Typography color="#1976d2" fontSize={14} fontWeight={700} sx={{ textAlign: "right" }}>
          {formatKyat(totalAmount)}
        </Typography>
      </Box>

      <Stack spacing={1.5}>
        {filteredOrders.map((order) => (
          <Card
            key={order.id}
            onClick={() => openOrder(order.id)}
            sx={{ borderRadius: 2.5, boxShadow: "0 3px 9px rgba(15, 23, 42, 0.16)" }}
          >
            <CardContent sx={{ position: "relative", px: 2, py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack spacing={1.1}>
                <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", columnGap: 1.5, width: "100%" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap fontWeight={800} sx={{ minWidth: 0 }}>{order.displayId || order.id}</Typography>
                    <Typography noWrap color="text.secondary" sx={{ minWidth: 0, fontSize: 13 }}>{order.customerName}</Typography>
                  </Box>
                  <Typography noWrap fontWeight={800} sx={{ color: "#1976d2" }}>
                    {formatKyat(order.amount)}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ pr: 4 }}>
                  <Chip
                    label={order.status}
                    size="small"
                    sx={{
                      height: 25,
                      bgcolor: order.status === "Cancel" ? "#fff1f0" : "#e8f6ec",
                      color: order.status === "Cancel" ? "#d14343" : "#38924e",
                      fontSize: 13,
                      fontWeight: 600,
                      "& .MuiChip-label": { px: 1.1 },
                    }}
                  />
                  <Chip
                    label={order.paymentStatus === "Paid" ? order.paymentMethod : order.paymentStatus}
                    size="small"
                    icon={<CreditCardRoundedIcon />}
                    variant="outlined"
                    sx={{
                      height: 25,
                      borderColor: order.paymentStatus === "Paid" ? "#38924e" : order.paymentStatus === "Partial" ? "#e47616" : "#d14343",
                      bgcolor: order.paymentStatus === "Paid" ? "#e8f6ec" : order.paymentStatus === "Partial" ? "#fff5e6" : "#fff1f0",
                      color: order.paymentStatus === "Paid" ? "#38924e" : order.paymentStatus === "Partial" ? "#e47616" : "#d14343",
                      fontSize: 13,
                      fontWeight: 500,
                      "& .MuiChip-icon": { color: order.paymentStatus === "Paid" ? "#38924e" : order.paymentStatus === "Partial" ? "#e47616" : "#d14343", fontSize: 16 },
                      "& .MuiChip-label": { px: 1 },
                    }}
                  />
                  <IconButton
                    aria-label={`Order actions for ${order.displayId || order.id}`}
                    size="small"
                    sx={{ position: "absolute", right: 10, bottom: 10 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuAnchor(event.currentTarget);
                      setMenuOrder(order);
                    }}
                  >
                    <MoreVertRoundedIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Fab
        aria-label="Create order"
        color="primary"
        onClick={() => navigate("/sale/create")}
        sx={{ position: "fixed", right: 26, bottom: 96, bgcolor: "#ff5a36", "&:hover": { bgcolor: "#e94c2b" } }}
      >
        <AddRoundedIcon />
      </Fab>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { openOrder(menuOrder?.id); setMenuAnchor(null); }}>
          <VisibilityRoundedIcon sx={{ mr: 1.5 }} />View Details
        </MenuItem>
        <MenuItem onClick={removeOrder} disabled={cancelOrderMutation.isPending || menuOrder?.status === "Cancel"} sx={{ color: "error.main" }}>
          <DeleteOutlineRoundedIcon sx={{ mr: 1.5 }} />{cancelOrderMutation.isPending ? "Deleting…" : "Delete"}
        </MenuItem>
      </Menu>

      <Dialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, m: 2, overflow: "hidden" } }}
      >
        <DialogTitle sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Box sx={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", bgcolor: "#eaf3ff", color: "#1976d2" }}>
              <FilterAltRoundedIcon />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" color="text.primary" fontWeight={400}>Filter Orders</Typography>
              <Typography variant="body2" color="text.secondary">Date, order, and payment status.</Typography>
            </Box>
            <IconButton aria-label="Close filters" onClick={() => setFilterOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 2.5, py: 2 }}>
          <Stack spacing={2.5}>
            <FilterSection icon={<CalendarMonthRoundedIcon sx={{ color: "#1976d2" }} />} title="Date">
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                {["all", "today", "custom"].map((value) => (
                  <FilterChoiceButton key={value} active={draftFilters.range === value} onClick={() => updateDraft("range", value)}>
                    {value}
                  </FilterChoiceButton>
                ))}
              </Box>
              {draftFilters.range === "custom" && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField fullWidth label="From" type="date" size="small" value={draftFilters.from} onChange={(event) => updateDraft("from", event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField fullWidth label="To" type="date" size="small" value={draftFilters.to} onChange={(event) => updateDraft("to", event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                </Stack>
              )}
            </FilterSection>

            <FilterSection icon={<ReceiptLongRoundedIcon sx={{ color: "#1976d2" }} />} title="Order Status">
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                {["all", "done", "cancelled"].map((value) => (
                  <FilterChoiceButton key={value} active={draftFilters.orderStatus === value} onClick={() => updateDraft("orderStatus", value)}>
                    {value}
                  </FilterChoiceButton>
                ))}
              </Box>
            </FilterSection>

            <FilterSection icon={<CreditCardRoundedIcon sx={{ color: "#1976d2" }} />} title="Payment Status">
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
                {["all", "unpaid", "partial", "paid"].map((value) => (
                  <FilterChoiceButton key={value} active={draftFilters.paymentStatus === value} onClick={() => updateDraft("paymentStatus", value)}>
                    {value}
                  </FilterChoiceButton>
                ))}
              </Box>
            </FilterSection>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 2.25, gap: 1, borderTop: "1px solid #e5e7eb" }}>
          <Button fullWidth onClick={clearFilters} sx={{ minHeight: 44, borderRadius: 2, color: "#1976d2", fontWeight: 400 }}>
            Clear
          </Button>
          <Button fullWidth variant="contained" onClick={applyFilters} startIcon={<CheckRoundedIcon />} sx={{ minHeight: 44, borderRadius: 2, bgcolor: "#1976d2", color: "#fff", fontWeight: 400, "&:hover": { bgcolor: "#1565c0" } }}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function DesktopOrdersPage({ orders, search, setSearch, totalAmount, filters, setFilters, onDelete, deleting, onCreateOrder }) {
  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const [dateFilterAnchor, setDateFilterAnchor] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const clearDesktopFilters = () => {
    setSearch("");
    setFilters(initialFilters);
  };
  const setDesktopDateRange = (range) => {
    setFilters((current) => ({
      ...current,
      range,
      ...(range === "custom" ? {} : { from: "", to: "" }),
    }));
  };
  const orderStatusTone = (status) => status === "Done" ? { bgcolor: "#e8f6ec", color: "#278a45" } : { bgcolor: "#fff1f0", color: "#d14343" };
  const paymentTone = (status) => status === "Paid" ? { bgcolor: "#e8f6ec", color: "#278a45" } : status === "Partial" ? { bgcolor: "#fff5e6", color: "#e47616" } : { bgcolor: "#fff1f0", color: "#d14343" };
  return <Box sx={{ width: "100%" }}>
    <Card sx={desktopOrdersPanelSx}><CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(250px, 1fr) 145px 166px 190px auto auto", gap: 1, alignItems: "center" }}>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by order number, customer, product, or payment method" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 1.5 } }} />
        <TextField select value={filters.orderStatus} onChange={(event) => updateFilter("orderStatus", event.target.value)} size="small" sx={desktopFilterSx}><MenuItem value="all">All status</MenuItem><MenuItem value="done">Done</MenuItem><MenuItem value="cancelled">Cancel</MenuItem></TextField>
        <TextField select value={filters.paymentStatus} onChange={(event) => updateFilter("paymentStatus", event.target.value)} size="small" sx={desktopFilterSx}><MenuItem value="all">All payment</MenuItem><MenuItem value="paid">Paid</MenuItem><MenuItem value="unpaid">Unpaid</MenuItem><MenuItem value="partial">Partial</MenuItem></TextField>
        <Button onClick={(event) => setDateFilterAnchor(event.currentTarget)} startIcon={<CalendarMonthRoundedIcon />} variant="outlined" sx={{ ...desktopDateFilterSx, justifyContent: "flex-start" }}>Date and time</Button>
        <Button onClick={clearDesktopFilters} variant="contained" sx={{ minHeight: 42, textTransform: "none", whiteSpace: "nowrap", px: 2 }}>Clear</Button>
        <Button onClick={onCreateOrder} variant="contained" startIcon={<AddRoundedIcon />} sx={{ minHeight: 42, textTransform: "none", whiteSpace: "nowrap", px: 2 }}>Create Order</Button>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2.25, mb: 1.75, px: 1, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}><Typography sx={{ fontSize: 16, fontWeight: 700 }}>{orders.length}</Typography><Typography sx={{ fontSize: 16, fontWeight: 800 }}>{new Intl.NumberFormat("en-US").format(totalAmount)}</Typography></Box>
      <Box sx={desktopTableHeaderSx}><TableHeader>NO.</TableHeader><TableHeader>ORDER</TableHeader><TableHeader>DATE & TIME</TableHeader><TableHeader>STATUS</TableHeader><TableHeader>PAYMENT</TableHeader><TableHeader align="right" sx={desktopAmountSx}>AMOUNT</TableHeader><TableHeader align="right">ACTIONS</TableHeader></Box>
      <Divider />
      <Box>{orders.map((order, index) => <Box key={order.id} sx={desktopTableRowSx}><Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 600 }}>{index + 1}</Typography><Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }}>{order.displayId || order.id}</Typography><Typography noWrap color="text.secondary" sx={{ fontSize: 12.5 }}>{order.customerName}</Typography></Box><Box sx={{ display: "flex", alignItems: "center", gap: 1.25, whiteSpace: "nowrap" }}><Stack direction="row" alignItems="center" spacing={0.65} color="text.secondary"><CalendarMonthRoundedIcon sx={{ fontSize: 17 }} /><Typography sx={{ fontSize: 13 }}>{order.date.split("-").reverse().join("/")}</Typography></Stack><Stack direction="row" alignItems="center" spacing={0.65} color="text.secondary"><AccessTimeRoundedIcon sx={{ fontSize: 17 }} /><Typography sx={{ fontSize: 13 }}>{order.time}</Typography></Stack></Box><Chip label={order.status} size="small" sx={{ justifySelf: "start", height: 28, fontWeight: 700, ...orderStatusTone(order.status) }} /><Chip label={order.paymentMethod} size="small" sx={{ justifySelf: "start", height: 28, fontWeight: 700, ...paymentTone(order.paymentStatus) }} /><Typography noWrap sx={{ ...desktopAmountSx, fontSize: 14, fontWeight: 700, textAlign: "right", justifySelf: "end", whiteSpace: "nowrap" }}>{formatKyat(order.amount)}</Typography><Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}><IconButton aria-label={`View ${order.displayId || order.id} details`} onClick={() => setDetailOrder(order)} color="primary" size="small" sx={desktopOrderActionSx}><VisibilityRoundedIcon fontSize="small" /></IconButton><IconButton aria-label={`Delete ${order.displayId || order.id}`} onClick={() => onDelete(order.id)} disabled={deleting || order.status === "Cancel"} color="error" size="small" sx={desktopOrderActionSx}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Box></Box>)}</Box>
    </CardContent></Card>
    <Popover open={Boolean(dateFilterAnchor)} anchorEl={dateFilterAnchor} onClose={() => setDateFilterAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }} slotProps={{ paper: { sx: { width: 360, p: 2, borderRadius: 2 } } }}>
      <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Date and time</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}><FilterChoiceButton active={filters.range === "all"} onClick={() => setDesktopDateRange("all")}>All</FilterChoiceButton><FilterChoiceButton active={filters.range === "today"} onClick={() => setDesktopDateRange("today")}>Today</FilterChoiceButton><FilterChoiceButton active={filters.range === "custom"} onClick={() => setDesktopDateRange("custom")}>Custom</FilterChoiceButton></Box>
      {filters.range === "custom" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: 1.5 }}><Box><Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: .5 }}>From</Typography><TextField fullWidth type="date" size="small" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} slotProps={{ htmlInput: { "aria-label": "From date" } }} /></Box><Box><Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: .5 }}>To</Typography><TextField fullWidth type="date" size="small" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} slotProps={{ htmlInput: { "aria-label": "To date" } }} /></Box></Box>}
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1.75 }}><Button size="small" onClick={() => setDesktopDateRange("all")}>Reset</Button><Button variant="contained" size="small" onClick={() => setDateFilterAnchor(null)}>Apply</Button></Stack>
    </Popover>
    <DesktopOrderDetailsModalExact order={detailOrder} onClose={() => setDetailOrder(null)} />
  </Box>;
}

const desktopOrdersPanelSx = { borderRadius: 2.5, border: "1px solid", borderColor: "divider", boxShadow: "0 3px 12px rgba(15,23,42,0.07)" };
const desktopFilterSx = { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 1.5, bgcolor: "background.paper" } };
const desktopDateFilterSx = { minHeight: 44, borderRadius: 1.5, borderColor: "divider", color: "text.primary", textTransform: "none", fontWeight: 500, whiteSpace: "nowrap", "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } };
const desktopTableGrid = { display: "grid", gridTemplateColumns: "56px minmax(230px, 1.15fr) minmax(275px, 1.2fr) 96px 112px minmax(145px, .6fr) 132px", columnGap: "20px", alignItems: "center", px: "20px" };
const desktopTableHeaderSx = { ...desktopTableGrid, py: "16px" };
const desktopTableRowSx = { ...desktopTableGrid, py: "14px", minHeight: "68px", borderBottom: "1px solid", borderColor: "divider" };
const desktopAmountSx = { pr: 8 };
const desktopOrderActionSx = { width: 44, height: 44, border: "1px solid", borderColor: "divider", borderRadius: 1.5 };

function TableHeader({ children, align, sx }) { return <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 700, textAlign: align, ...sx }}>{children}</Typography>; }

function DesktopOrderDetailsModalExact({ order, onClose }) {
  if (!order) return null;
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3, maxHeight: "calc(100vh - 48px)" } }}>
    <DialogContent sx={{ p: 0, overflowX: "hidden" }}>
      <OrderDetailsPage embeddedOrderId={order.id} embeddedOnClose={onClose} forceMobileLayout hideBackButton />
    </DialogContent>
  </Dialog>;
}

function DesktopOrderDetailsModalV2({ order, onClose, onDelete, deleting }) {
  const { shop } = useAuth();
  const { data, isLoading } = useOrderQuery(order?.id);
  const record = data?.order || order;
  if (!order) return null;
  if (isLoading || !record) return <Dialog open onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, maxWidth: 940 } }}><DialogContent sx={{ p: 4 }}><Typography>Loading order details…</Typography></DialogContent></Dialog>;

  const items = record.items || [];
  const status = record.fulfillmentStatus === "cancelled" ? "Cancel" : "Done";
  const paymentStatus = String(record.paymentStatus || "unpaid").replace(/^./, (letter) => letter.toUpperCase());
  const paymentActivity = [...(record.payments || [])].sort((left, right) => new Date(left.paidAt || left.createdAt) - new Date(right.paidAt || right.createdAt));
  const activePaymentRecordCount = paymentActivity.filter((payment) => Number(payment.amount || 0) > 0 && !paymentActivity.some((reversal) => Number(reversal.amount || 0) < 0 && reversal.originalPaymentId === payment.id)).length;
  const paidAmount = paymentActivity.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const total = Number(record.total || order.amount || 0);
  const paymentMethod = [...paymentActivity].filter((payment) => Number(payment.amount || 0) > 0).at(-1)?.method || (paymentStatus === "Unpaid" ? "Unpaid" : "Cash");
  const remainingAmount = Math.max(0, total - paidAmount);
  const subtotal = Number(record.subtotal || total);
  const discount = Number(record.discount || 0);
  const showPaymentSummary = paymentActivity.length > 0 || ["unpaid", "partial"].includes(String(record.paymentStatus || "unpaid").toLowerCase());
  const canCancel = !deleting && record.fulfillmentStatus !== "cancelled" && activePaymentRecordCount <= 1;
  const printInvoice = () => {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) return;
    const rows = items.map((item) => `<tr><td><strong>${escapeReceiptHtml(item.productName || item.product?.name || "Item")}</strong><br><span>${Number(item.quantity || 0)} × ${formatKyat(Number(item.unitPrice || 0))}</span></td><td>${formatKyat(Number(item.lineTotal || 0))}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html><head><title>Invoice ${escapeReceiptHtml(record.orderNumber || record.id)}</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:80mm;margin:0;color:#000;background:#fff;font:12px Arial,sans-serif}.receipt{width:72mm;margin:0 auto;padding:4mm 0}.brand{text-align:center;border-bottom:2px solid #000;padding:0 0 3mm}.brand h1{margin:0;font-size:17px}.brand p{margin:1.5mm 0 0;font-size:10px}.invoice{display:flex;justify-content:space-between;margin:3mm 0;font-weight:700}.meta{border:1px solid #000;padding:2.5mm;line-height:1.65;font-size:10px}.meta strong{display:inline-block;min-width:31mm}table{width:100%;border-collapse:collapse;margin-top:3mm}th{border-bottom:1.5px solid #000;padding:1.5mm 0;text-align:left;font-size:10px}th:last-child,td:last-child{text-align:right}td{vertical-align:top;border-bottom:1px dashed #777;padding:2mm 0}td span{font-size:10px}.summary{margin-top:3mm;border-top:1.5px solid #000;padding-top:2mm}.summary div{display:flex;justify-content:space-between;padding:.7mm 0}.summary .total{border-top:1.5px solid #000;margin-top:1mm;padding-top:2mm;font-size:15px;font-weight:700}.foot{border-top:1px solid #000;margin-top:4mm;padding-top:3mm;text-align:center;font-size:10px}</style></head><body><main class="receipt"><header class="brand"><h1>${escapeReceiptHtml(shop?.name || "POS INVOICE")}</h1><p>${escapeReceiptHtml(shop?.address || "Thank you for shopping with us.")}</p></header><section class="invoice"><span>INVOICE</span><b>${escapeReceiptHtml(record.orderNumber || record.id)}</b></section><section class="meta"><div><strong>Date</strong>${escapeReceiptHtml(new Date(record.createdAt).toLocaleString())}</div><div><strong>Payment status</strong>${escapeReceiptHtml(paymentStatus)}</div><div><strong>Payment method</strong>${escapeReceiptHtml(paymentMethod)}</div><div><strong>Total quantity</strong>${items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item(s)</div></section><table><thead><tr><th>ITEM</th><th>AMOUNT</th></tr></thead><tbody>${rows}</tbody></table><section class="summary"><div><span>Subtotal</span><span>${formatKyat(subtotal)}</span></div><div><span>Discount</span><span>${discount > 0 ? `- ${formatKyat(discount)}` : formatKyat(0)}</span></div><div class="total"><span>TOTAL</span><span>${formatKyat(total)}</span></div></section><footer class="foot"><strong>Thank you for shopping.</strong><br>We appreciate your business.</footer></main><script>window.onload=()=>window.print();window.onafterprint=()=>window.close();</script></body></html>`);
    popup.document.close();
  };

  return <Dialog open onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, maxWidth: 940 } }}>
    <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid", borderColor: "divider" }}><Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography sx={{ fontSize: 21, fontWeight: 800 }}>Order Details</Typography><Typography color="text.secondary" sx={{ mt: .25, fontSize: 14 }}>{record.orderNumber || record.id}</Typography></Box><Chip label={status} icon={<CheckRoundedIcon />} sx={{ bgcolor: status === "Cancel" ? "#fff1f0" : "#e8f6ec", color: status === "Cancel" ? "#d14343" : "#278a45", fontWeight: 700 }} /></Stack></DialogTitle>
    <DialogContent sx={{ p: 3 }}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(290px, .8fr)", gap: 2.5 }}>
      <Card variant="outlined" sx={{ borderRadius: 2, alignSelf: "start" }}><CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}><Typography sx={{ fontWeight: 800, fontSize: 17 }}>Order items ({items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)})</Typography><Divider sx={{ my: 1.75 }} /><Stack spacing={1.25}>{items.map((item) => <Box key={item.id} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: 2 }}><Typography noWrap sx={{ minWidth: 0, fontWeight: 700 }}>{item.productName || item.product?.name || "Item"}</Typography><Typography color="text.secondary" sx={{ whiteSpace: "nowrap", fontSize: 14 }}>{Number(item.quantity || 0)} × {formatKyat(Number(item.regularUnitPrice ?? item.unitPrice ?? 0))}</Typography><Typography sx={{ whiteSpace: "nowrap", fontWeight: 800, fontSize: 18 }}>{formatKyat(Number(item.lineTotal || 0))}</Typography></Box>)}</Stack></CardContent></Card>
      <Stack spacing={2}><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order information</Typography><Stack spacing={1.1}><DesktopDetailRow label="Order date" value={new Date(record.createdAt).toLocaleString()} /><DesktopDetailRow label="Order status" value={status} tone={status === "Cancel" ? "#d14343" : "#278a45"} /><DesktopDetailRow label="Payment status" value={paymentStatus} tone={paymentStatus === "Paid" ? "#278a45" : paymentStatus === "Partial" ? "#e47616" : "#d14343"} /></Stack></CardContent></Card><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order summary</Typography><Stack spacing={1.1}><DesktopDetailRow label="Subtotal" value={formatKyat(subtotal)} /><DesktopDetailRow label="Discount" value={discount > 0 ? `- ${formatKyat(discount)}` : formatKyat(0)} /><Divider /><DesktopDetailRow label="Total" value={formatKyat(total)} tone="primary.main" strong /></Stack></CardContent></Card>{showPaymentSummary && <Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Payment Summary</Typography><Stack spacing={1.1}><DesktopDetailRow label="Buyer Name" value={record.customer?.name || "—"} /><DesktopDetailRow label="Paid Amount" value={formatKyat(paidAmount)} tone="#278a45" /><DesktopDetailRow label="Remaining Amount" value={formatKyat(remainingAmount)} tone="#d14343" /></Stack></CardContent></Card>}</Stack>
    </Box></DialogContent>
    <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between" }}><Button color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={!canCancel} onClick={() => { onDelete(record.id); onClose(); }} sx={{ textTransform: "none", fontWeight: 700 }}>Cancel Order</Button><Stack direction="row" spacing={1}><Button onClick={onClose} sx={{ textTransform: "none" }}>Close</Button><Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={printInvoice} sx={{ textTransform: "none" }}>Print Invoice</Button></Stack></DialogActions>
  </Dialog>;
}

function escapeReceiptHtml(value) { return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }

function LegacyDesktopOrderDetailsModal({ order, onClose, onDelete }) {
  if (!order) return null;
  const orderItems = order.items || [];
  return <Dialog open={Boolean(order)} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, maxWidth: 860 } }}>
    <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid", borderColor: "divider" }}><Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography sx={{ fontSize: 21, fontWeight: 800 }}>Order Details</Typography><Typography color="text.secondary" sx={{ mt: .25, fontSize: 14 }}>{order.displayId || order.id}</Typography></Box><Chip label="Done" icon={<CheckRoundedIcon />} sx={{ bgcolor: "#e8f6ec", color: "#278a45", fontWeight: 700 }} /></Stack></DialogTitle>
    <DialogContent sx={{ p: 3 }}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(270px, .78fr)", gap: 2.5 }}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}><Typography sx={{ fontWeight: 800, fontSize: 17 }}>Order items ({order.quantity})</Typography><Divider sx={{ my: 1.75 }} /><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}><Box><Typography sx={{ fontWeight: 700 }}>{orderItems.map((item) => item.productName || item.product?.name || "Item").join(", ")}</Typography><Typography color="text.secondary" sx={{ mt: .5, fontSize: 14 }}>{formatKyat(order.amount)} × {order.quantity}</Typography></Box><Typography sx={{ fontWeight: 800, fontSize: 18 }}>{formatKyat(order.amount)}</Typography></Box></CardContent></Card>
      <Stack spacing={2}><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order information</Typography><Stack spacing={1.1}><DesktopDetailRow label="Order date" value={`${order.date.split("-").reverse().join("/")} · ${order.time}`} /><DesktopDetailRow label="Payment status" value={order.paymentStatus} tone="#278a45" /><DesktopDetailRow label="Payment method" value={order.paymentMethod} /></Stack></CardContent></Card><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order summary</Typography><Stack spacing={1.1}><DesktopDetailRow label="Subtotal" value={formatKyat(order.amount)} /><DesktopDetailRow label="Discount" value={formatKyat(0)} /><Divider /><DesktopDetailRow label="Total" value={formatKyat(order.amount)} tone="primary.main" strong /></Stack></CardContent></Card></Stack>
    </Box></DialogContent>
    <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between" }}><Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={onDelete} sx={{ textTransform: "none", fontWeight: 700 }}>Delete order</Button><Stack direction="row" spacing={1}><Button onClick={onClose} sx={{ textTransform: "none" }}>Close</Button><Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={() => window.print()} sx={{ textTransform: "none" }}>Print receipt</Button></Stack></DialogActions>
  </Dialog>;
}

function DesktopDetailRow({ label, value, tone = "text.primary", strong = false }) { return <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}><Typography color="text.secondary" sx={{ fontSize: 14 }}>{label}</Typography><Typography color={tone} sx={{ fontSize: 14, textAlign: "right", fontWeight: strong ? 800 : 700 }}>{value}</Typography></Box>; }

void LegacyDesktopOrderDetailsModal;
void DesktopOrderDetailsModal;
void DesktopOrderDetailsModalV2;

function DesktopOrderDetailsModal({ order, onClose, onDelete }) {
  if (!order) return null;
  const items = order.items || [];
  return <Dialog open={Boolean(order)} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, maxWidth: 860 } }}>
    <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid", borderColor: "divider" }}><Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography sx={{ fontSize: 21, fontWeight: 800 }}>Order Details</Typography><Typography color="text.secondary" sx={{ mt: .25, fontSize: 14 }}>{order.displayId || order.id}</Typography></Box><Chip label={order.status} icon={<CheckRoundedIcon />} sx={{ bgcolor: order.status === "Cancel" ? "#fff1f0" : "#e8f6ec", color: order.status === "Cancel" ? "#d14343" : "#278a45", fontWeight: 700 }} /></Stack></DialogTitle>
    <DialogContent sx={{ p: 3 }}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(270px, .78fr)", gap: 2.5 }}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}><Typography sx={{ fontWeight: 800, fontSize: 17 }}>Order items ({order.quantity})</Typography><Divider sx={{ my: 1.75 }} /><Stack spacing={1.25}>{items.map((item) => <Box key={item.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}><Box><Typography sx={{ fontWeight: 700 }}>{item.productName || item.product?.name || "Item"}</Typography><Typography color="text.secondary" sx={{ mt: .5, fontSize: 14 }}>{Number(item.quantity || 0)} x {formatKyat(Number(item.unitPrice || 0))}</Typography></Box><Typography sx={{ fontWeight: 800, fontSize: 18 }}>{formatKyat(Number(item.lineTotal || 0))}</Typography></Box>)}</Stack></CardContent></Card>
      <Stack spacing={2}><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order information</Typography><Stack spacing={1.1}><DesktopDetailRow label="Order date" value={`${order.date.split("-").reverse().join("/")} · ${order.time}`} /><DesktopDetailRow label="Order status" value={order.status} tone={order.status === "Cancel" ? "#d14343" : "#278a45"} /><DesktopDetailRow label="Payment status" value={order.paymentStatus} tone="#278a45" /><DesktopDetailRow label="Payment method" value={order.paymentMethod} /></Stack></CardContent></Card><Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}><Typography sx={{ fontWeight: 800, mb: 1.25 }}>Order summary</Typography><Stack spacing={1.1}><DesktopDetailRow label="Subtotal" value={formatKyat(order.subtotal)} /><DesktopDetailRow label="Discount" value={order.discount > 0 ? `- ${formatKyat(order.discount)}` : formatKyat(0)} /><Divider /><DesktopDetailRow label="Total" value={formatKyat(order.amount)} tone="primary.main" strong /></Stack></CardContent></Card></Stack>
    </Box></DialogContent>
    <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between" }}><Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={onDelete} sx={{ textTransform: "none", fontWeight: 700 }}>Delete order</Button><Stack direction="row" spacing={1}><Button onClick={onClose} sx={{ textTransform: "none" }}>Close</Button><Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={() => window.print()} sx={{ textTransform: "none" }}>Print receipt</Button></Stack></DialogActions>
  </Dialog>;
}
