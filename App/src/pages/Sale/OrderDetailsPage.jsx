import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import { useLocation, useNavigate, useParams } from "react-router";
import { useTheme } from "@mui/material/styles";
import { usePosApi } from "../../hooks/useApiResource";
import { useOrderQuery } from "../../hooks/usePosQueries";
import { buildExchangeReceiptHtml, buildInvoiceReceiptHtml } from "../../lib/receipt";
import PaymentCancellationDialog from "../../components/PaymentCancellationDialog";
import ReturnRefundDialog from "../../components/ReturnRefundDialog";
import { refundableSalePayments } from "../../lib/refundablePayments";
import { buildPaymentActivity, buildReturnActivity } from "../../lib/orderActivity";
import { getOrderReturnSummary } from "./orderSummary";

const formatKyat = (amount) =>
  `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;

export default function OrderDetailsPage({ embeddedOrderId, embeddedOnClose, forceMobileLayout = false, hideBackButton = false }) {
  const { orderId: routeOrderId } = useParams();
  const orderId = embeddedOrderId || routeOrderId;
  const navigate = useNavigate();
  const location = useLocation();
  const api = usePosApi();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const {
    data: orderResult,
    error: orderError,
    isLoading: orderLoading,
    refetch: refetchOrder,
  } = useOrderQuery(orderId);
  const record = orderResult?.order || null;
  const receipt = orderResult?.receipt || null;
  const [shop, setShop] = useState(null);
  const [loadError, setLoadError] = useState("");
  const viewportIsMobile = useMediaQuery("(max-width:768px)");
  const isMobile = forceMobileLayout || viewportIsMobile;
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const colors = isDark
    ? {
        page: "#101010",
        card: "#1e1e1e",
        text: "#fff",
        muted: "#a7a7a7",
        divider: "rgba(255,255,255,.55)",
        doneBg: "#153c27",
        doneBorder: "#317c4a",
        doneText: "#7be29f",
      }
    : {
        page: theme.palette.background.default,
        card: theme.palette.background.paper,
        text: theme.palette.text.primary,
        muted: theme.palette.text.secondary,
        divider: theme.palette.divider,
        doneBg: "#e8f6ec",
        doneBorder: "#b8e3c4",
        doneText: "#278a45",
      };
  const cardSx = {
    bgcolor: colors.card,
    color: colors.text,
    borderRadius: 3,
    border: "1px solid",
    borderColor: colors.divider,
    boxShadow: "0 5px 16px rgba(0,0,0,.12)",
  };
  useEffect(() => {
    let active = true;
    api.shop
      .get()
      .then(({ shop: shopRecord }) => {
        if (active) setShop(shopRecord);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);
  const order = useMemo(() => {
    if (!record) return null;
    const createdAt = new Date(record.createdAt);
    return {
      id: record.orderNumber || record.id,
      amount: Number(record.effectiveTotal ?? receipt?.effectiveTotal ?? record.total ?? 0),
      subtotal: Number(record.subtotal || record.total || 0),
      discount: Number(record.discount || 0),
      quantity: (record.items || []).reduce(
        (total, item) => total + Number(item.quantity || 0),
        0,
      ),
      date: createdAt.toLocaleDateString(),
      time: createdAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      paymentStatus: String(record.paymentStatus || "unpaid").replace(
        /^./,
        (letter) => letter.toUpperCase(),
      ),
      status: record.fulfillmentStatus === "cancelled" ? "Cancel" : "Done",
      paymentMethod: (() => {
        const payment = [...(receipt?.payments || [])]
          .filter((entry) => Number(entry.amount || 0) > 0)
          .sort(
            (left, right) =>
              new Date(right.paidAt || right.createdAt) -
              new Date(left.paidAt || left.createdAt),
          )[0];
        return payment?.method === "KBZ Pay"
          ? "KPay"
          : payment?.method || (record.paymentStatus === "unpaid" ? "Unpaid" : "—");
      })(),
    };
  }, [record, receipt]);
  if (!order)
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: colors.page, p: 3 }}>
        <Alert
          severity={loadError || orderError ? "error" : "info"}
          action={
            !orderLoading && (loadError || orderError) ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => void refetchOrder()}
              >
                Retry
              </Button>
            ) : undefined
          }
        >
          {loadError || orderError?.message || "Loading order details"}
        </Alert>
      </Box>
    );

  const orderItems = (record.items || []).map((item) => {
    return {
      ...item,
      sellUnitPrice: Number(item.unitPrice || 0),
      sellLineTotal: Number(item.lineTotal || 0),
    };
  });
  const subtotal = Number(receipt?.totals?.subtotal ?? record.subtotal ?? 0);
  const discount = Number(receipt?.totals?.orderDiscount ?? record.discount ?? 0);
  const paymentRecords = refundableSalePayments(record.payments || [])
    .sort(
      (left, right) =>
        new Date(left.paidAt || left.createdAt) -
        new Date(right.paidAt || right.createdAt),
    );
  const paymentActivity = buildPaymentActivity(receipt);
  const paidAmount = paymentActivity.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activePaymentRecordCount = paymentRecords.length;
  const { effectiveTotal, originalTotal, returnedSaleValue } = getOrderReturnSummary(record, receipt);
  const remainingAmount = Math.max(0, effectiveTotal - paidAmount);
  const returnActivity = buildReturnActivity(receipt);
  const showPaymentSummary =
    paymentActivity.length > 0 ||
    ["unpaid", "partial"].includes(
      String(record.paymentStatus || "unpaid").toLowerCase(),
    );
  const legacyPrintOrder = () => {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) {
      setLoadError("Allow pop-ups to print this receipt.");
      return;
    }
    const rows = (record.items || [])
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.productName || item.product?.name || "Item")}<br><small>${Number(item.quantity)} × ${formatKyat(Number(item.unitPrice || 0))}</small></td><td>${formatKyat(Number(item.lineTotal || 0))}</td></tr>`,
      )
      .join("");
    popup.document.write(
      `<!doctype html><html><head><title>Invoice ${escapeHtml(order.id)}</title><style>@page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:4mm;font:12px Arial,sans-serif;color:#111}.center{text-align:center}.shop{font-size:17px;font-weight:700}.muted,small{font-size:10px;color:#555}.line{border-top:1px dashed #222;margin:3mm 0}table{width:100%;border-collapse:collapse}td{padding:1.5mm 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total{font-size:14px;font-weight:700;display:flex;justify-content:space-between}.foot{font-size:10px;text-align:center}</style></head><body><div class="center"><div class="shop">${escapeHtml(shop?.name || "POS INVOICE")}</div><div class="muted">${escapeHtml(shop?.address || "")}<br>Invoice ${escapeHtml(order.id)}</div></div><div class="line"></div><div class="muted">Date: ${escapeHtml(`${order.date} ${order.time}`)}<br>Payment status: ${escapeHtml(order.paymentStatus)}<br>Payment method: ${escapeHtml(order.paymentMethod)}<br>Total quantity: ${order.quantity}</div><div class="line"></div><table>${rows}</table><div class="line"></div><div class="muted">Subtotal: ${formatKyat(subtotal)}<br>Discount: ${discount > 0 ? `- ${formatKyat(discount)}` : formatKyat(0)}</div><div class="total"><span>Total</span><span>${formatKyat(order.amount)}</span></div><div class="line"></div><div class="foot">Thank you for shopping.</div><script>window.onload=()=>window.print();window.onafterprint=()=>window.close();</script></body></html>`,
    );
    popup.document.close();
  };
  const shareOrder = async () => {
    const text = `${order.id} · ${formatKyat(order.amount)}`;
    if (navigator.share)
      await navigator.share({ title: "Order receipt", text });
    else await navigator.clipboard?.writeText(text);
  };
  const legacyShareInvoice = async () => {
    const { jsPDF } = await import("jspdf");
    const invoice = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = invoice.internal.pageSize.getWidth();
    let y = 18;
    invoice.setFontSize(18);
    invoice.text(shop?.name || "POS Invoice", pageWidth / 2, y, {
      align: "center",
    });
    y += 8;
    invoice.setFontSize(10);
    invoice.text(`Invoice: ${order.id}`, 18, y);
    invoice.text(`Date: ${order.date} ${order.time}`, pageWidth - 18, y, {
      align: "right",
    });
    y += 10;
    invoice.line(18, y, pageWidth - 18, y);
    y += 7;
    invoice.setFontSize(11);
    invoice.text("Item", 18, y);
    invoice.text("Qty", 120, y, { align: "right" });
    invoice.text("Amount", pageWidth - 18, y, { align: "right" });
    y += 5;
    (record.items || []).forEach((item) => {
      invoice.setFontSize(10);
      invoice.text(
        String(item.productName || item.product?.name || "Item").slice(0, 48),
        18,
        y,
      );
      invoice.text(String(Number(item.quantity)), 120, y, { align: "right" });
      invoice.text(formatKyat(Number(item.lineTotal || 0)), pageWidth - 18, y, {
        align: "right",
      });
      y += 7;
    });
    invoice.line(18, y, pageWidth - 18, y);
    y += 7;
    invoice.setFontSize(10);
    invoice.text(`Total quantity: ${order.quantity}`, 18, y);
    y += 6;
    invoice.text("Subtotal", 18, y);
    invoice.text(formatKyat(subtotal), pageWidth - 18, y, { align: "right" });
    y += 6;
    invoice.text("Discount", 18, y);
    invoice.text(
      discount > 0 ? `- ${formatKyat(discount)}` : formatKyat(0),
      pageWidth - 18,
      y,
      { align: "right" },
    );
    y += 7;
    invoice.setFontSize(12);
    invoice.text("Total", 18, y);
    invoice.text(formatKyat(order.amount), pageWidth - 18, y, {
      align: "right",
    });
    y += 10;
    invoice.setFontSize(10);
    invoice.text(`Payment status: ${order.paymentStatus}`, 18, y);
    y += 5;
    invoice.text(`Payment method: ${order.paymentMethod}`, 18, y);
    invoice.text("Thank you for shopping.", pageWidth / 2, y + 14, {
      align: "center",
    });
    const file = new File([invoice.output("blob")], `Invoice-${order.id}.pdf`, {
      type: "application/pdf",
    });
    if (navigator.share && navigator.canShare?.({ files: [file] }))
      await navigator.share({ title: `Invoice ${order.id}`, files: [file] });
    else invoice.save(`Invoice-${order.id}.pdf`);
  };
  const printOrder = () => {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) {
      setLoadError("Allow pop-ups to print this receipt.");
      return;
    }
    if (!receipt) {
      popup.close();
      setLoadError("Receipt data is unavailable. Refresh and try again.");
      return;
    }
    popup.document.write(buildInvoiceReceiptHtml(receipt, { reprint: true }));
    popup.document.close();
  };
  const printExchange = (exchange) => {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup || !receipt) {
      popup?.close();
      setLoadError("Receipt data is unavailable. Refresh and try again.");
      return;
    }
    popup.document.write(buildExchangeReceiptHtml(receipt, exchange, { reprint: true }));
    popup.document.close();
  };
  const shareInvoice = async () => {
    const { jsPDF } = await import("jspdf");
    const invoice = new jsPDF({
      unit: "mm",
      format: "a5",
      orientation: "portrait",
    });
    const pageWidth = invoice.internal.pageSize.getWidth();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const money = (value) =>
      `MMK ${new Intl.NumberFormat("en-US").format(Number(value || 0))}`;
    const itemRows = record.items || [];
    let y = 12;
    invoice.setFillColor(24, 87, 190);
    invoice.roundedRect(margin, y, contentWidth, 31, 4, 4, "F");
    invoice.setTextColor(255, 255, 255);
    invoice.setFont("helvetica", "bold");
    invoice.setFontSize(17);
    invoice.text(
      String(shop?.name || "POS INVOICE").slice(0, 30),
      margin + 6,
      y + 12,
    );
    invoice.setFont("helvetica", "normal");
    invoice.setFontSize(8.5);
    invoice.text("Thank you for shopping with us!", margin + 6, y + 19);
    invoice.setFillColor(255, 255, 255);
    invoice.roundedRect(pageWidth - margin - 43, y + 5, 37, 20, 2, 2, "F");
    invoice.setTextColor(24, 87, 190);
    invoice.setFont("helvetica", "bold");
    invoice.setFontSize(7);
    invoice.text("INVOICE", pageWidth - margin - 24.5, y + 12, {
      align: "center",
    });
    invoice.setFontSize(15);
    invoice.text(
      String(order.id).slice(0, 14),
      pageWidth - margin - 24.5,
      y + 20,
      { align: "center" },
    );
    y += 38;
    invoice.setDrawColor(212, 224, 247);
    invoice.setFillColor(250, 252, 255);
    invoice.roundedRect(margin, y, contentWidth, 26, 3, 3, "FD");
    invoice.setTextColor(17, 38, 82);
    invoice.setFont("helvetica", "bold");
    invoice.setFontSize(8.5);
    invoice.text("Date", margin + 5, y + 7);
    invoice.text("Payment Status", margin + 5, y + 13);
    invoice.text("Payment Method", margin + 5, y + 19);
    invoice.setFont("helvetica", "normal");
    invoice.text(`${order.date} ${order.time}`, margin + 39, y + 7);
    invoice.text(order.paymentStatus, margin + 39, y + 13);
    invoice.text(order.paymentMethod, margin + 39, y + 19);
    invoice.setFont("helvetica", "bold");
    invoice.setTextColor(24, 87, 190);
    invoice.setFontSize(9);
    invoice.text("TOTAL QUANTITY", pageWidth - margin - 5, y + 8, {
      align: "right",
    });
    invoice.setFontSize(16);
    invoice.text(`${order.quantity} items`, pageWidth - margin - 5, y + 18, {
      align: "right",
    });
    y += 33;
    invoice.setFillColor(24, 87, 190);
    invoice.roundedRect(margin, y, contentWidth, 9, 2, 2, "F");
    invoice.setTextColor(255, 255, 255);
    invoice.setFontSize(8);
    invoice.text("#", margin + 4, y + 5.8);
    invoice.text("ITEM", margin + 12, y + 5.8);
    invoice.text("QTY", pageWidth - margin - 45, y + 5.8, { align: "right" });
    invoice.text("UNIT PRICE", pageWidth - margin - 24, y + 5.8, {
      align: "right",
    });
    invoice.text("AMOUNT", pageWidth - margin - 4, y + 5.8, { align: "right" });
    y += 14;
    invoice.setTextColor(17, 38, 82);
    itemRows.forEach((item, index) => {
      const name = String(
        item.productName || item.product?.name || "Item",
      ).slice(0, 35);
      invoice.setFont("helvetica", "normal");
      invoice.setFontSize(8);
      invoice.text(String(index + 1), margin + 4, y);
      invoice.setFont("helvetica", "bold");
      invoice.text(name, margin + 12, y);
      invoice.setFont("helvetica", "normal");
      invoice.text(
        String(Number(item.quantity || 0)),
        pageWidth - margin - 45,
        y,
        { align: "right" },
      );
      invoice.text(money(item.unitPrice), pageWidth - margin - 24, y, {
        align: "right",
      });
      invoice.setFont("helvetica", "bold");
      invoice.text(money(item.lineTotal), pageWidth - margin - 4, y, {
        align: "right",
      });
      invoice.setDrawColor(220, 226, 238);
      invoice.line(margin, y + 4, pageWidth - margin, y + 4);
      y += 9;
    });
    invoice.setFillColor(246, 249, 255);
    invoice.setDrawColor(212, 224, 247);
    invoice.roundedRect(margin, y + 1, contentWidth, 29, 3, 3, "FD");
    y += 8;
    invoice.setTextColor(17, 38, 82);
    invoice.setFont("helvetica", "normal");
    invoice.setFontSize(9);
    invoice.text("Subtotal", margin + 5, y);
    invoice.text(money(subtotal), pageWidth - margin - 5, y, {
      align: "right",
    });
    y += 6;
    invoice.text("Discount", margin + 5, y);
    invoice.text(
      discount > 0 ? `- ${money(discount)}` : money(0),
      pageWidth - margin - 5,
      y,
      { align: "right" },
    );
    invoice.setDrawColor(185, 202, 234);
    invoice.line(margin + 4, y + 4, pageWidth - margin - 4, y + 4);
    y += 12;
    invoice.setTextColor(24, 87, 190);
    invoice.setFont("helvetica", "bold");
    invoice.setFontSize(14);
    invoice.text("TOTAL", margin + 5, y);
    invoice.text(money(order.amount), pageWidth - margin - 5, y, {
      align: "right",
    });
    y += 12;
    invoice.setDrawColor(203, 211, 225);
    invoice.line(margin, y, pageWidth - margin, y);
    y += 8;
    invoice.setTextColor(17, 38, 82);
    invoice.setFontSize(10);
    invoice.text("Thank you for shopping.", pageWidth / 2, y, {
      align: "center",
    });
    invoice.setFont("helvetica", "normal");
    invoice.setFontSize(8);
    invoice.setTextColor(104, 119, 145);
    invoice.text("We appreciate your business!", pageWidth / 2, y + 5, {
      align: "center",
    });
    const file = new File([invoice.output("blob")], `Invoice-${order.id}.pdf`, {
      type: "application/pdf",
    });
    if (navigator.share && navigator.canShare?.({ files: [file] }))
      await navigator.share({ title: `Invoice ${order.id}`, files: [file] });
    else invoice.save(`Invoice-${order.id}.pdf`);
  };
  void legacyPrintOrder;
  void legacyShareInvoice;
  void shareOrder;
  const deleteOrder = () => {
    if (record && record.fulfillmentStatus !== "cancelled") setCancelOpen(true);
  };

  return (
    <Box
      sx={{
        minHeight: isMobile ? "100vh" : "calc(100vh - 120px)",
        bgcolor: colors.page,
        color: colors.text,
        py: isMobile ? 0 : 3,
        px: isMobile ? 0 : 3,
      }}
    >
      {cancelOpen && <PaymentCancellationDialog kind="sale" recordId={record.id} onClose={() => setCancelOpen(false)} onSaved={() => void refetchOrder()} />}
      {returnOpen && <ReturnRefundDialog open order={record} onClose={() => setReturnOpen(false)} onSaved={async () => { setReturnOpen(false); await refetchOrder(); }} />}
      <Box sx={{ maxWidth: isMobile ? "none" : 880, mx: "auto" }}>
        <Box
          sx={{
            minHeight: isMobile ? 64 : 72,
            px: isMobile ? 1.5 : 0,
            mx: isMobile ? 2.5 : 0,
            mt: isMobile ? 1.25 : 0,
            borderRadius: isMobile ? 2.5 : 0,
            display: "grid",
            gridTemplateColumns: "42px minmax(0,1fr) 42px",
            alignItems: "center",
            bgcolor: isMobile ? "primary.main" : "transparent",
            color: isMobile ? "common.white" : colors.text,
          }}
        >
          {hideBackButton ? <Box /> : <IconButton
            aria-label="Back to orders"
            onClick={() => embeddedOnClose ? embeddedOnClose() : navigate(location.state?.from || "/sale")}
            sx={{
              color: isMobile ? "common.white" : colors.text,
              justifySelf: "start",
            }}
          >
            <ArrowBackRoundedIcon sx={{ fontSize: 31 }} />
          </IconButton>}
          <Typography
            noWrap
            sx={{
              textAlign: "center",
              fontSize: isMobile ? 20 : 24,
              fontWeight: 700,
            }}
          >
            {order.id}
          </Typography>
          {hideBackButton && embeddedOnClose ? <IconButton aria-label="Close order details" onClick={embeddedOnClose} sx={{ color: isMobile ? "common.white" : colors.text, justifySelf: "end" }}><CloseRoundedIcon sx={{ fontSize: 29 }} /></IconButton> : <Box />}
        </Box>
        <Box sx={{ px: isMobile ? 2.5 : 0, pt: isMobile ? 1.5 : 0, pb: 4 }}>
          <Card sx={cardSx}>
            <CardContent
              sx={{
                p: isMobile ? 2.5 : 3,
                "&:last-child": { pb: isMobile ? 2.5 : 3 },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Typography
                  sx={{ fontSize: isMobile ? 24 : 25, fontWeight: 700 }}
                >
                  Order Details
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.25,
                    py: 0.7,
                    borderRadius: 99,
                    bgcolor:
                      order.status === "Cancel" ? "#fff1f0" : colors.doneBg,
                    color:
                      order.status === "Cancel" ? "#d14343" : colors.doneText,
                    border: "1px solid",
                    borderColor:
                      order.status === "Cancel" ? "#f0b8b8" : colors.doneBorder,
                  }}
                >
                  <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
                  <Typography sx={{ fontWeight: 700 }}>
                    {order.status}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ my: 2.25, borderColor: colors.divider }} />
              <Stack spacing={1.25}>
                <DetailRow label="Order Number" value={order.id} />
                <DetailRow
                  label="Order Date"
                  value={`${order.date} ${order.time}`}
                />
                <DetailRow
                  label="Order Status"
                  value={order.status}
                  tone={order.status === "Cancel" ? "#d14343" : "#278a45"}
                />
                {order.status === "Cancel" && (
                  <>
                    <DetailRow
                      label="Cancel Reason"
                      value={record.cancelReason || "—"}
                      tone="#d14343"
                    />
                    <DetailRow
                      label="Cancelled At"
                      value={
                        record.cancelledAt
                          ? new Date(record.cancelledAt).toLocaleString()
                          : "—"
                      }
                    />
                  </>
                )}
                <DetailRow
                  label="Payment Status"
                  value={order.paymentStatus}
                  tone={order.paymentStatus === "Paid" ? "#278a45" : "#d14343"}
                />
                <DetailRow label="Payment Method" value={order.paymentMethod} />
                <DetailRow
                  label="Total Amount"
                  value={formatKyat(order.amount)}
                  tone="#1976d2"
                />
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1.5,
                  mt: 3,
                }}
              >
                <Button
                  variant="contained"
                  startIcon={<PrintRoundedIcon />}
                  onClick={printOrder}
                  sx={detailPrimaryButtonSx}
                >
                  Print Invoice
                </Button>
                <Button
                  variant="contained"
                  startIcon={<ShareRoundedIcon />}
                  onClick={() => void shareInvoice()}
                  sx={detailPrimaryButtonSx}
                >
                  Share Invoice
                </Button>
              </Box>
              <Button
                fullWidth
                variant="outlined"
                disabled={record.fulfillmentStatus !== "completed"}
                onClick={() => setReturnOpen(true)}
                sx={{ mt: 2.25, minHeight: 46, textTransform: "none", fontSize: 16, fontWeight: 700 }}
              >
                Return / Refund
              </Button>
              <Button
                fullWidth
                startIcon={<DeleteOutlineRoundedIcon />}
                disabled={
                  record.fulfillmentStatus === "cancelled"
                }
                onClick={() => void deleteOrder()}
                color="error"
                sx={{
                  mt: 2.25,
                  minHeight: 46,
                  textTransform: "none",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {record.paymentTracking && activePaymentRecordCount > 0 ? "Refund Payment" : "Cancel Order"}
              </Button>
            </CardContent>
          </Card>
          <Typography
            sx={{ fontSize: isMobile ? 21 : 22, fontWeight: 700, mt: 2, mb: 1 }}
          >
            Order Items ({order.quantity})
          </Typography>
          <Card sx={cardSx}>
            <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
              <Stack spacing={1.5}>
                {orderItems.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: isMobile ? "flex" : "grid",
                      gridTemplateColumns: isMobile
                        ? undefined
                        : "minmax(0, 1fr) auto auto",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    {isMobile ? (
                    <Box>
                      <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
                        {item.productName || item.product?.name}
                      </Typography>
                      <Typography sx={{ color: colors.muted, mt: 0.6 }}>
                        {Number(item.quantity)} ×{" "}
                        {formatKyat(item.sellUnitPrice)}
                      </Typography>
                    </Box>
                    ) : (
                      <>
                        <Typography noWrap sx={{ minWidth: 0, fontSize: 18, fontWeight: 700 }}>
                          {item.productName || item.product?.name}
                        </Typography>
                        <Typography sx={{ color: colors.muted, whiteSpace: "nowrap" }}>
                          {Number(item.quantity)} × {formatKyat(item.sellUnitPrice)}
                        </Typography>
                      </>
                    )}
                    <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
                      {formatKyat(item.sellLineTotal)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
          <Card sx={{ ...cardSx, mt: 2 }}>
            <CardContent
              sx={{
                p: isMobile ? 2.5 : 3,
                "&:last-child": { pb: isMobile ? 2.5 : 3 },
              }}
            >
              <Typography
                sx={{ fontSize: isMobile ? 24 : 25, fontWeight: 700 }}
              >
                Order Summary
              </Typography>
              <Divider sx={{ my: 2.25, borderColor: colors.divider }} />
              <Stack spacing={1.25}>
                <DetailRow label="Subtotal" value={formatKyat(subtotal)} />
                <DetailRow
                  label="Order Discount"
                  value={
                    discount > 0 ? `- ${formatKyat(discount)}` : formatKyat(0)
                  }
                  tone={discount > 0 ? "#d14343" : "inherit"}
                />
                {returnedSaleValue > 0 && (
                  <>
                    <DetailRow label="Original Total" value={formatKyat(originalTotal)} />
                    <DetailRow label="Returned Value" value={`- ${formatKyat(returnedSaleValue)}`} tone="#d14343" />
                  </>
                )}
              </Stack>
              <Divider sx={{ my: 2.25, borderColor: colors.divider }} />
              <DetailRow
                label="Total"
                value={formatKyat(order.amount)}
                tone="#1976d2"
                strong
              />
            </CardContent>
          </Card>
          {showPaymentSummary && (
            <Card sx={{ ...cardSx, mt: 2 }}>
              <CardContent
                sx={{
                  p: isMobile ? 2.5 : 3,
                  "&:last-child": { pb: isMobile ? 2.5 : 3 },
                }}
              >
                <Typography
                  sx={{ fontSize: isMobile ? 22 : 23, fontWeight: 700 }}
                >
                  Payment Summary
                </Typography>
                <Divider sx={{ my: 2, borderColor: colors.divider }} />
                <Stack spacing={1.25}>
                  <DetailRow
                    label="Buyer Name"
                    value={record.customer?.name || "—"}
                  />
                  <DetailRow
                    label="Payment Status"
                    value={order.paymentStatus}
                    tone={
                      order.paymentStatus === "Paid"
                        ? "#278a45"
                        : order.paymentStatus === "Partial"
                          ? "#e47616"
                          : "#d14343"
                    }
                  />
                  <DetailRow
                    label="Paid Amount"
                    value={formatKyat(paidAmount)}
                    tone="#278a45"
                  />
                  <DetailRow
                    label="Remaining Amount"
                    value={formatKyat(remainingAmount)}
                    tone="#d14343"
                  />
                </Stack>
                {paymentActivity.length > 0 && (
                  <>
                    <Divider sx={{ my: 2, borderColor: colors.divider }} />
                    <Typography sx={{ fontWeight: 700, mb: 1.25 }}>
                      Payment Activity
                    </Typography>
                    <Stack spacing={1.25}>
                      {paymentActivity.map((payment) => {
                        const isRefund = Number(payment.amount || 0) < 0;
                        const timestamp = new Date(payment.paidAt || payment.createdAt);
                        return (
                        <Box
                          key={payment.id}
                          sx={{
                            p: 1.25,
                            borderRadius: 1.5,
                            bgcolor: isRefund
                              ? isDark ? "rgba(209,67,67,.14)" : "#fff1f0"
                              : isDark ? "rgba(255,255,255,.05)" : "#f7f9fc",
                          }}
                        >
                          <DetailRow
                            label={`${payment.method || "Cash"} ${isRefund ? "refund" : "payment"}`}
                            value={`${isRefund ? "-" : "+"}${formatKyat(Math.abs(Number(payment.amount || 0)))}`}
                            tone={isRefund ? "#d14343" : "#278a45"}
                          />
                          {isRefund && <Typography sx={{ mt: 0.5, color: "#d14343", fontSize: 13 }}>
                            Reason: {payment.reason || payment.note || "-"}
                          </Typography>}
                          <Typography
                            sx={{
                              mt: 0.5,
                              color: colors.muted,
                              fontSize: 13,
                              textAlign: "right",
                            }}
                          >
                            {timestamp.toLocaleString()}
                          </Typography>
                        </Box>
                        );
                      })}
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {returnActivity.length > 0 && (
            <Card sx={{ ...cardSx, mt: 2 }}>
              <CardContent sx={{ p: isMobile ? 2.5 : 3, "&:last-child": { pb: isMobile ? 2.5 : 3 } }}>
                <Typography sx={{ fontSize: isMobile ? 22 : 23, fontWeight: 700 }}>Return Activity</Typography>
                <Divider sx={{ my: 2, borderColor: colors.divider }} />
                <Stack spacing={1.5}>
                  {returnActivity.map((entry) => entry.activityType === "return" ? (
                    <Box key={`return-${entry.id}`} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? "rgba(255,255,255,.05)" : "#f7f9fc" }}>
                      <DetailRow label="Returned Item" value={entry.itemName || entry.orderItemId} />
                      <DetailRow label="Quantity" value={entry.quantity} />
                      <DetailRow label="Reason" value={entry.reason || "-"} />
                      {entry.createdAt && <DetailRow label="Returned At" value={new Date(entry.createdAt).toLocaleString()} />}
                    </Box>
                  ) : (
                    <Box key={`exchange-${entry.id}`} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? "rgba(255,255,255,.05)" : "#f7f9fc" }}>
                      <DetailRow label="Exchange Reference" value={entry.id} />
                      <DetailRow label="Original Invoice" value={entry.originalInvoice.invoiceNumber} />
                      <DetailRow label="Replacement Invoice" value={entry.replacementInvoice.invoiceNumber} />
                      <DetailRow label="Returned Value" value={formatKyat(entry.returnedValue)} />
                      <DetailRow label="Replacement Value" value={formatKyat(entry.replacementValue)} />
                      <Button fullWidth variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => printExchange(entry)} sx={{ mt: 1.5, textTransform: "none", fontWeight: 700 }}>
                        Print Exchange
                      </Button>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function DetailRow({ label, value, tone = "inherit", strong = false }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: 2,
        alignItems: "center",
      }}
    >
      <Typography
        sx={{ fontSize: strong ? 22 : 17, fontWeight: strong ? 700 : 400 }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color: tone,
          fontSize: strong ? 23 : 17,
          fontWeight: strong ? 800 : 600,
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

const detailPrimaryButtonSx = {
  minHeight: 58,
  borderRadius: 1.75,
  bgcolor: "#5b9af2",
  color: "#fff",
  textTransform: "none",
  fontSize: 16,
  fontWeight: 700,
  "&:hover": { bgcolor: "#4385e2" },
};

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}
