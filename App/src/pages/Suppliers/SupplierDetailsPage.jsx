import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { usePosApi } from "../../hooks/useApiResource";

const money = (value) =>
  `${new Intl.NumberFormat("en-US").format(Number(value || 0))} ကျပ်`;
const date = (value) => (value ? new Date(value).toLocaleDateString() : "—");

function supplierPaymentActivity(payments) {
  return payments
    .flatMap((payment) => {
      const cancelledAt = payment.reversal?.reversedAt || payment.reversedAt;
      return [
        { type: "payment", payment, occurredAt: payment.paidAt || payment.createdAt, order: 0 },
        ...(cancelledAt
          ? [{ type: "cancelled", payment, occurredAt: cancelledAt, order: 1 }]
          : []),
      ];
    })
    .sort((left, right) => {
      const byTime = new Date(left.occurredAt || 0) - new Date(right.occurredAt || 0);
      return byTime || left.order - right.order;
    });
}

export default function SupplierDetailsPage({ embeddedSupplierId, embeddedRecordId, hideBackButton = false }) {
  const routeParams = useParams();
  const supplierId = embeddedSupplierId || routeParams.supplierId;
  const recordId = embeddedRecordId || routeParams.recordId;
  const navigate = useNavigate();
  const location = useLocation();
  const api = usePosApi();
  const [supplier, setSupplier] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [outstandingPurchase, setOutstandingPurchase] = useState(null);
  const [error, setError] = useState("");
  const backTo = location.state?.from || "/suppliers";
  useEffect(() => {
    if (recordId) {
      let active = true;
      api.suppliers.deliveryRecord(recordId).then(({ record }) => {
        if (!active) return;
        const payments = record.payments || [];
        const activePaid = payments.filter((payment) => !payment.reversedAt && !payment.reversal).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const remaining = Number(record.remaining ?? Math.max(0, Number(record.amount || 0) - activePaid));
        setSupplier({ name: record.supplierName || record.supplier?.name || "Supplier", phone: record.supplierPhone || record.supplier?.phone || "", deliveryRecords: [record] });
        setPurchase({ payments });
        setOutstandingPurchase(remaining > 0 ? { id: record.id } : null);
      }).catch((nextError) => { if (active) setError(nextError.message || "Supplier details could not be loaded."); });
      return () => { active = false; };
    }
    let active = true;
    Promise.all([
      api.suppliers.list({ page: 1, pageSize: 100 }),
      api.purchases.list({ page: 1, pageSize: 100 }),
    ])
      .then(([supplierResult, purchaseResult]) => {
        if (!active) return;
        const found = (supplierResult.suppliers || []).find(
          (item) => item.id === supplierId,
        );
        if (!found) throw new Error("Supplier not found.");
        const purchases = (purchaseResult.purchases || []).filter(
          (item) =>
            item.supplierId === supplierId && item.status !== "cancelled",
        );
        setSupplier(found);
        setPurchase(
          purchases.find((item) => item.id === location.state?.purchaseId) ||
            [...purchases].sort(
              (a, b) =>
                new Date(b.updatedAt || b.createdAt) -
                new Date(a.updatedAt || a.createdAt),
            )[0] ||
            null,
        );
        setOutstandingPurchase(
          purchases.find(
            (item) => Number(item.paidAmount || 0) < Number(item.total || 0),
          ) || null,
        );
      })
      .catch((nextError) => {
        if (active)
          setError(
            nextError.message || "Supplier details could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, location.state?.purchaseId, recordId, supplierId]);
  const delivery = supplier?.deliveryRecords?.[0];
  if (error)
    return (
      <Box sx={{ p: 2.5 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  if (!supplier || !delivery)
    return (
      <Box sx={{ p: 2.5 }}>
        <Alert severity="info">Loading supplier details…</Alert>
      </Box>
    );
  const paymentActivity = supplierPaymentActivity(purchase?.payments || []);
  const invoiceStatus = delivery.invoiceStatus || (delivery.status === "cancelled" ? "Cancelled" : "Credit");
  return (
    <Box
      sx={{
        minHeight: embeddedSupplierId || embeddedRecordId ? "auto" : "100vh",
        bgcolor: "background.default",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
      }}
    >
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}>
        <Toolbar
          sx={{
            minHeight: 64,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          <IconButton
            aria-label="Back to suppliers"
            onClick={() => navigate(backTo)}
            sx={{ color: "common.white", justifySelf: "start", visibility: hideBackButton ? "hidden" : "visible" }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography sx={{ fontSize: 20, fontWeight: 600 }}>
            Supplier Details
          </Typography>
          {invoiceStatus === "Cancelled" ? <Chip label="Cancelled" size="small" sx={{ justifySelf: "end", bgcolor: "#fff1f0", color: "#d14343", fontWeight: 700 }} /> : <Box />}
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 2.5, maxWidth: 520, mx: "auto" }}>
        <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
          <Detail
            icon={<StorefrontOutlinedIcon />}
            label="Supplier Name"
            value={supplier.name}
          />
          <Detail
            icon={<PhoneOutlinedIcon />}
            label="Phone"
            value={supplier.phone || "—"}
          />
          <Detail
            icon={<ReceiptLongOutlinedIcon />}
            label="Invoice Number"
            value={delivery.invoiceNumber}
          />
          <Detail icon={<ReceiptLongOutlinedIcon />} label="Status" value={invoiceStatus} accent={invoiceStatus === "Cancelled"} />
          <Detail
            icon={<LocalShippingOutlinedIcon />}
            label="Delivery Name"
            value={delivery.deliveryName}
          />
          <Detail
            icon={<PhoneOutlinedIcon />}
            label="Delivery Phone"
            value={delivery.deliveryPhone}
          />
          <Detail
            icon={<PersonOutlineRoundedIcon />}
            label="Receiver Name"
            value={delivery.receiverName}
          />
          <Detail
            icon={<CalendarTodayOutlinedIcon />}
            label="Receive Date"
            value={date(delivery.receivedAt)}
          />
          <Detail
            icon={<PaymentsOutlinedIcon />}
            label="Total Amount"
            value={money(delivery.amount)}
            accent
          />
          <Detail
            icon={<CalendarTodayOutlinedIcon />}
            label="Due Date"
            value={date(delivery.dueAt)}
          />
          {invoiceStatus === "Cancelled" && <><Detail icon={<ReceiptLongOutlinedIcon />} label="Cancel Reason" value={delivery.cancelReason || "—"} /><Detail icon={<CalendarTodayOutlinedIcon />} label="Cancelled At" value={date(delivery.cancelledAt)} /></>}
        </Paper>
        {paymentActivity.map((event) =>
          event.type === "payment" ? (
            <PaymentSummary key={`payment-${event.payment.id}`} payment={event.payment} />
          ) : (
            <CancelledPaymentSummary key={`cancel-${event.payment.id}`} payment={event.payment} />
          ),
        )}
        {outstandingPurchase && invoiceStatus !== "Cancelled" && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<PaymentsOutlinedIcon />}
            onClick={() =>
              navigate(recordId ? `/suppliers/delivery/${recordId}/pay` : `/suppliers/${supplierId}/pay`, {
                state: { from: backTo, purchaseId: outstandingPurchase.id },
              })
            }
            sx={{
              mt: 2.5,
              minHeight: 56,
              borderRadius: 1.5,
              textTransform: "none",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Add Payment
          </Button>
        )}
      </Box>
    </Box>
  );
}

function CancelledPaymentSummary({ payment }) { const reversal = payment.reversal || {}; return <Paper elevation={1} sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: "#fff8f8", border: "1px solid #f2c3c3" }}><Typography sx={{ color: "#d14343", fontSize: 16, fontWeight: 700 }}>Cancelled Payment / Refund Record</Typography><Detail icon={<PaymentsOutlinedIcon />} label="Amount" value={money(payment.amount)} accent /><Detail icon={<PaymentsOutlinedIcon />} label="Payment Method" value={payment.method} /><Detail icon={<ReceiptLongOutlinedIcon />} label="Cancel Reason" value={reversal.reason || payment.reversalReason || "—"} /><Detail icon={<CalendarTodayOutlinedIcon />} label="Cancelled At" value={date(reversal.reversedAt || payment.reversedAt)} /></Paper>; }
function PaymentSummary({ payment }) {
  const isCash = payment.method === "Cash";
  return (
    <Paper elevation={2} sx={{ mt: 2, p: 2, borderRadius: 2 }}>
      <Typography sx={{ mb: 0.5, fontSize: 17, fontWeight: 700 }}>
        Payment Summary
      </Typography>
      <Detail
        icon={<CalendarTodayOutlinedIcon />}
        label="Paid Date"
        value={date(payment.paidAt)}
      />
      <Detail
        icon={<PaymentsOutlinedIcon />}
        label="Payment Method"
        value={payment.method}
      />
      <Detail
        icon={<PaymentsOutlinedIcon />}
        label="Amount"
        value={money(payment.amount)}
        accent
      />
      {isCash ? (
        <>
          <Detail
            icon={<AccountCircleOutlinedIcon />}
            label="Receiver Name"
            value={payment.payerName || "—"}
          />
          <Detail
            icon={<PhoneOutlinedIcon />}
            label="Receiver Phone"
            value={payment.payerPhone || "—"}
          />
          {payment.signatureDataUrl && (
            <Box sx={{ pt: 1.5 }}>
              <Typography sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
                Receiver Signature
              </Typography>
              <Box
                component="img"
                src={payment.signatureDataUrl}
                alt="Receiver signature"
                sx={{
                  display: "block",
                  width: "100%",
                  maxHeight: 120,
                  objectFit: "contain",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  bgcolor: "#fafcff",
                }}
              />
            </Box>
          )}
        </>
      ) : (
        <>
          <Detail
            icon={<AccountCircleOutlinedIcon />}
            label="Receiver User Name"
            value={payment.mobileAccountName || payment.payerName || "—"}
          />
          <Detail
            icon={<PhoneOutlinedIcon />}
            label="Receiver Number"
            value={payment.payerPhone || "—"}
          />
          <Detail
            icon={<ReceiptLongOutlinedIcon />}
            label="Transaction ID"
            value={payment.reference || "—"}
          />
        </>
      )}
    </Paper>
  );
}
export function SupplierDetailsCards({ supplier, delivery, payments = [] }) {
  const activePaid = Number(delivery.activePaid ?? payments.filter((payment) => !payment.reversedAt && !payment.reversal).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const remaining = Number(delivery.remaining ?? Math.max(0, Number(delivery.amount || 0) - activePaid));
  const status = delivery.invoiceStatus || (delivery.status === "cancelled" ? "Cancelled" : remaining === 0 ? "Paid" : "Credit");
  return <>
    <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
      <Detail icon={<StorefrontOutlinedIcon />} label="Supplier Name" value={supplier.name} />
      <Detail icon={<PhoneOutlinedIcon />} label="Phone" value={supplier.phone || "—"} />
      <Detail icon={<ReceiptLongOutlinedIcon />} label="Invoice Number" value={delivery.invoiceNumber} />
      <Detail icon={<ReceiptLongOutlinedIcon />} label="Status" value={status} accent={status === "Cancelled"} />
      <Detail icon={<LocalShippingOutlinedIcon />} label="Delivery Name" value={delivery.deliveryName} />
      <Detail icon={<PhoneOutlinedIcon />} label="Delivery Phone" value={delivery.deliveryPhone} />
      <Detail icon={<PersonOutlineRoundedIcon />} label="Receiver Name" value={delivery.receiverName} />
      <Detail icon={<CalendarTodayOutlinedIcon />} label="Receive Date" value={date(delivery.receivedAt)} />
      <Detail icon={<PaymentsOutlinedIcon />} label="Total Amount" value={money(delivery.amount)} accent />
      {status === "Credit" && <Detail icon={<PaymentsOutlinedIcon />} label="Remaining Amount" value={money(remaining)} accent />}
      <Detail icon={<CalendarTodayOutlinedIcon />} label="Due Date" value={date(delivery.dueAt)} />
      {status === "Cancelled" && <><Detail icon={<ReceiptLongOutlinedIcon />} label="Cancel Reason" value={delivery.cancelReason || "—"} /><Detail icon={<CalendarTodayOutlinedIcon />} label="Cancelled At" value={delivery.cancelledAt ? date(delivery.cancelledAt) : "—"} /></>}
    </Paper>
    {supplierPaymentActivity(payments).map((event) => event.type === "payment" ? <PaymentSummary key={`payment-${event.payment.id}`} payment={event.payment} /> : <CancelledPaymentSummary key={`cancel-${event.payment.id}`} payment={event.payment} />)}
  </>;
}
function Detail({ icon, label, value, accent = false }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 1.25,
        py: 1.75,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          display: "grid",
          placeItems: "center",
          borderRadius: 1.25,
          bgcolor: "#eaf3ff",
          color: "primary.main",
        }}
      >
        {icon}
      </Box>
      <Typography color="text.secondary" sx={{ fontSize: 14 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          maxWidth: 190,
          color: accent ? "primary.main" : "text.primary",
          fontWeight: accent ? 700 : 600,
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
