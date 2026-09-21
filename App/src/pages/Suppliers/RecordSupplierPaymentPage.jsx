import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  AppBar,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import WalletOutlinedIcon from "@mui/icons-material/WalletOutlined";
import { usePosApi } from "../../hooks/useApiResource";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";

const money = (amount) =>
  `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;
const inputSx = {
  mb: 2,
  "& .MuiOutlinedInput-root": {
    minHeight: 56,
    borderRadius: 1.5,
    bgcolor: "action.hover",
    "& fieldset": { border: 0 },
  },
  "& .MuiInputBase-input": { fontSize: 16 },
  "& .MuiInputLabel-root": { fontSize: 14, fontWeight: 500 },
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
    { WebkitAppearance: "none", margin: 0 },
};

export default function RecordSupplierPaymentPage({ embeddedRecord = null, onSaved }) {
  const navigate = useNavigate();
  const routeParams = useParams();
  const supplierId = embeddedRecord?.supplierId || routeParams.supplierId;
  const recordId = embeddedRecord?.deliveryOnly ? embeddedRecord.apiId : routeParams.recordId;
  const location = useLocation();
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const preloadedPurchase = useMemo(() => recordId
    ? null
    : embeddedRecord
      ? {
          id: embeddedRecord.apiId,
          total: Number(embeddedRecord.amount || 0),
          paidAmount: 0,
          supplier: { name: embeddedRecord.name || "Supplier" },
        }
      : location.state?.purchase || null,
  [embeddedRecord, location.state?.purchase, recordId]);
  const preloadedSupplier = preloadedPurchase
    ? {
        name: preloadedPurchase.supplier?.name || "Supplier",
        outstanding: Math.max(
          0,
          Number(preloadedPurchase.total || 0) -
            Number(preloadedPurchase.paidAmount || 0),
        ),
      }
    : null;
  const [supplier, setSupplier] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [cashName, setCashName] = useState("");
  const [cashPhone, setCashPhone] = useState("");
  const signatureRef = useRef(null);
  const [signature, setSignature] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([{ id: "cash", name: "Cash" }]);
  const [mobileName, setMobileName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (recordId) {
      let active = true;
      api.suppliers.deliveryRecord(recordId).then(({ record }) => {
        if (!active) return;
        const activePaid = (record.payments || []).filter((payment) => !payment.reversedAt && !payment.reversal).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const outstanding = Number(record.remaining ?? Math.max(0, Number(record.amount || 0) - activePaid));
        setSupplier({ name: record.supplierName || record.supplier?.name || "Supplier", outstanding });
        setPurchase({ id: record.id });
      }).catch((nextError) => { if (active) setError(nextError.message || "Supplier payment could not be loaded."); }).finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    if (preloadedPurchase) return undefined;
    let active = true;
    Promise.all([
      api.suppliers.list({ page: 1, pageSize: 100 }),
      api.purchases.list({ page: 1, pageSize: 100 }),
    ])
      .then(([supplierResult, purchaseResult]) => {
        if (!active) return;
        const nextSupplier = (supplierResult.suppliers || []).find(
          (item) => item.id === supplierId,
        );
        const nextPurchase =
          (purchaseResult.purchases || []).find(
            (item) => item.id === location.state?.purchaseId,
          ) ||
          (purchaseResult.purchases || []).find(
            (item) =>
              item.supplierId === supplierId &&
              Number(item.paidAmount || 0) < Number(item.total || 0),
          );
        if (!nextSupplier || !nextPurchase)
          throw new Error(
            "No outstanding purchase was found for this supplier.",
          );
        setSupplier({
          name: nextSupplier.name,
          outstanding: Math.max(
            0,
            Number(nextPurchase.total || 0) -
              Number(nextPurchase.paidAmount || 0),
          ),
        });
        setPurchase(nextPurchase);
      })
      .catch((nextError) => {
        if (active)
          setError(
            nextError.message || "Supplier payment could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, location.state?.purchaseId, preloadedPurchase, recordId, supplierId]);
  useEffect(() => {
    let active = true;
    api.shop
      .getSettings()
      .then(({ settings }) => {
        const configured = (settings.paymentMethods || []).filter((item) => item.active !== false);
        if (!active) return;
        setPaymentMethods([
          { id: "cash", name: "Cash" },
          ...configured.filter((item) => item.id !== "cash" && item.name?.trim().toLowerCase() !== "cash"),
        ]);
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      active = false;
    };
  }, [api]);
  const activeSupplier = preloadedSupplier || supplier;
  const activePurchase = preloadedPurchase || purchase;
  const isLoading = preloadedPurchase ? false : loading;
  if (isLoading)
    return (
      <Box sx={{ p: 2.5 }}>
        <Typography>Loading payment…</Typography>
      </Box>
    );
  if (!activeSupplier || !activePurchase)
    return (
      <Box sx={{ p: 2.5 }}>
        <Typography color="error">
          {error || "Supplier payment could not be loaded."}
        </Typography>
      </Box>
    );
  const numericAmount = Number(amount) || 0;
  const remaining = Math.max(0, activeSupplier.outstanding - numericAmount);
  const dueRequired = numericAmount > 0 && numericAmount < activeSupplier.outstanding;
  const isCash = method === "cash";
  const valid = numericAmount > 0 && numericAmount <= activeSupplier.outstanding && (!dueRequired || dueDate) && (isCash ? cashName && cashPhone && signature : mobileName && mobileNumber && transactionId.trim());
  const save = async () => {
    if (saving) return;
    const nextFieldErrors = {};
    if (numericAmount <= 0) nextFieldErrors.amount = "Enter a payment amount.";
    if (numericAmount > activeSupplier.outstanding) nextFieldErrors.amount = "Payment amount cannot exceed outstanding balance.";
    if (isCash && !signature) nextFieldErrors.signature = "Receiver signature is required.";
    if (!isCash && !transactionId.trim()) nextFieldErrors.transactionId = "Transaction ID is required for non-cash payments.";
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError("");
      return;
    }
    if (!valid) {
      setError(
        "Please complete the required payment details.",
      );
      return;
    }
    setError("");
    setFieldErrors({});
    setSaving(true);
    try {
      const configuredMethod = paymentMethods.find((item) => item.id === method);
      const paymentBody = {
        amount: numericAmount,
        method: configuredMethod?.name || "Cash",
        payerName: isCash ? cashName : mobileName,
        payerPhone: isCash ? cashPhone : mobileNumber,
        mobileAccountName: isCash ? undefined : mobileName,
        reference: isCash ? undefined : transactionId.trim(),
        signatureDataUrl:
          isCash && signature && signatureRef.current
            ? signatureRef.current.toDataURL()
            : undefined,
        notes: dueDate ? `Due date: ${dueDate}` : undefined,
      };
      if (recordId) await api.suppliers.payDeliveryRecord(recordId, paymentBody); else await api.purchases.pay(activePurchase.id, paymentBody);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["shops", shop?.id, "purchases"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["shops", shop?.id, "supplier-deliveries"],
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: ["shops", shop?.id, "payments"],
        }),
      ]);
      if (onSaved) onSaved();
      else navigate(location.state?.from || "/suppliers");
    } catch (nextError) {
      const message = nextError.message || "Unable to record payment.";
      if (/transaction id/i.test(message)) setFieldErrors({ transactionId: message });
      else setError(message);
    } finally {
      setSaving(false);
    }
  };
  const adornment = (icon) => (
    <InputAdornment position="start" sx={{ color: "text.secondary" }}>
      {icon}
    </InputAdornment>
  );

  const startSignature = (event) => {
    const canvas = signatureRef.current;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    canvas.setPointerCapture(event.pointerId);
  };
  const drawSignature = (event) => {
    const canvas = signatureRef.current;
    if (!canvas?.hasPointerCapture(event.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#1f2937";
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
    setSignature(true);
    setFieldErrors((current) => ({ ...current, signature: "" }));
  };
  const clearSignature = () => {
    const canvas = signatureRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(false);
  };
  return (
    <Box
      sx={{
        minHeight: embeddedRecord ? 0 : "100vh",
        bgcolor: "background.default",
        fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif",
      }}
    >
      {!embeddedRecord && <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}>
        <Toolbar
          sx={{
            minHeight: 64,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          <IconButton
            aria-label="Back to suppliers"
            onClick={() => navigate("/suppliers")}
            sx={{ justifySelf: "start", color: "common.white" }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography sx={{ fontSize: 20, fontWeight: 600 }}>
            Record Payment
          </Typography>
          <Box />
        </Toolbar>
      </AppBar>}
      <Box sx={{ px: 2.5, py: 3, maxWidth: 520, mx: "auto" }}>
        <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                bgcolor: "#e8f6ee",
                color: "success.main",
              }}
            >
              <WalletOutlinedIcon />
            </Box>
            <Box>
              <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                {activeSupplier.name} · Outstanding Balance
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 700, mt: 0.25 }}>
                {money(activeSupplier.outstanding)}
              </Typography>
            </Box>
          </Box>
        </Paper>
        <TextField
          fullWidth
          select
          label="Payment Method *"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          slotProps={{
            input: { startAdornment: adornment(<PaymentsOutlinedIcon />) },
          }}
          sx={inputSx}
        >
          {paymentMethods.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
        <TextField
          fullWidth
          label="Amount *"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value.replace(/[^0-9]/g, ""));
            setError("");
            setFieldErrors((current) => ({ ...current, amount: "" }));
          }}
          placeholder="Enter payment amount"
          inputMode="numeric"
          slotProps={{
            input: {
              startAdornment: adornment(<PaymentsOutlinedIcon />),
              endAdornment: (
                <InputAdornment position="end">ကျပ်</InputAdornment>
              ),
            },
          }}
          sx={inputSx}
        />
        <Typography
          color={error || fieldErrors.amount ? "error.main" : "text.secondary"}
          sx={{ mt: -1.25, mb: 2, fontSize: 13 }}
        >
          {error || fieldErrors.amount || `Outstanding after payment: ${money(remaining)}`}
        </Typography>
      {isCash ? (
          <>
            <PaymentField
              label="Receiver Name *"
              placeholder="Enter receiver name"
              value={cashName}
              onChange={(event) => setCashName(event.target.value)}
              icon={<AccountCircleOutlinedIcon />}
            />
            <PaymentField
              label="Receiver Phone *"
              placeholder="Enter receiver phone"
              value={cashPhone}
              onChange={(event) => setCashPhone(event.target.value)}
              icon={<PhoneOutlinedIcon />}
              type="tel"
            />
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ mb: 0.75, fontSize: 14, fontWeight: 500 }}>
                Receiver Signature *
              </Typography>
              <Box
                sx={{
                  position: "relative",
                  height: 130,
                  border: "1px dashed",
                  borderColor: fieldErrors.signature ? "error.main" : signature ? "primary.main" : "primary.light",
                  borderRadius: 1.5,
                  bgcolor: "#fafcff",
                  overflow: "hidden",
                }}
              >
                <Box
                  component="canvas"
                  ref={signatureRef}
                  width={440}
                  height={130}
                  aria-label="Receiver signature pad"
                  onPointerDown={startSignature}
                  onPointerMove={drawSignature}
                  sx={{
                    width: "100%",
                    height: "100%",
                    touchAction: "none",
                    cursor: "crosshair",
                  }}
                />
                <Button
                  size="small"
                  onClick={clearSignature}
                  sx={{
                    position: "absolute",
                    right: 8,
                    bottom: 6,
                    textTransform: "none",
                  }}
                >
                  Clear signature
                </Button>
              </Box>
              {fieldErrors.signature && (
                <Typography color="error.main" sx={{ mt: 0.75, fontSize: 12.5 }}>
                  {fieldErrors.signature}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <>
            <PaymentField
              label="Receiver Mobile Payment User Name *"
              placeholder="Enter user name"
              value={mobileName}
              onChange={(event) => setMobileName(event.target.value)}
              icon={<AccountCircleOutlinedIcon />}
            />
            <PaymentField
              label="Receiver Mobile Payment Number *"
              placeholder="Enter mobile payment number"
              value={mobileNumber}
              onChange={(event) => setMobileNumber(event.target.value)}
              icon={<PhoneOutlinedIcon />}
            />
            <PaymentField
              label="Transaction ID *"
              placeholder="Enter transaction ID"
              value={transactionId}
              onChange={(event) => {
                setTransactionId(event.target.value);
                setFieldErrors((current) => ({ ...current, transactionId: "" }));
              }}
              icon={<ReceiptLongOutlinedIcon />}
              error={Boolean(fieldErrors.transactionId)}
              helperText={fieldErrors.transactionId}
            />
          </>
        )}
        {dueRequired && (
          <TextField
            fullWidth
            label="Due Date *"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            slotProps={{
              inputLabel: { shrink: true },
              input: {
                startAdornment: adornment(<CalendarTodayOutlinedIcon />),
              },
            }}
            sx={inputSx}
          />
        )}
      </Box>
      <Paper
        elevation={5}
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          px: 2.5,
          py: 2,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ maxWidth: 472, mx: "auto" }}>
          <Button
            fullWidth
            variant="contained"
            disabled={saving}
            startIcon={<CheckRoundedIcon />}
            onClick={save}
            sx={{
              minHeight: 56,
              borderRadius: 1.5,
              fontSize: 16,
              fontWeight: 600,
              textTransform: "none",
            }}
          >
            {saving ? "Saving…" : "Add Payment"}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

function PaymentField({ label, icon, ...props }) {
  return (
    <TextField
      fullWidth
      label={label}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ color: "text.secondary" }}>
              {icon}
            </InputAdornment>
          ),
        },
      }}
      sx={inputSx}
      {...props}
    />
  );
}
