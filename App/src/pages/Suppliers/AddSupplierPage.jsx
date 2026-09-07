import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AppBar, Box, Button, IconButton, InputAdornment, Paper, TextField, Toolbar, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { usePosApi } from "../../hooks/useApiResource";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../lib/queryKeys";

const initialForm = { supplierName: "", phone: "", invoiceNumber: "", deliveryName: "", deliveryPhone: "", receiverName: "", receiveDate: "", amount: "", dueDate: "" };

export default function AddSupplierPage() {
  const navigate = useNavigate(); const api = usePosApi(); const queryClient = useQueryClient(); const { shop } = useAuth();
  const [searchParams] = useSearchParams(); const supplierId = searchParams.get("edit"); const isEditMode = Boolean(supplierId);
  const [form, setForm] = useState(initialForm); const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    api.suppliers.deliveryRecord(supplierId).then(({ record }) => {
      if (active) setForm({ supplierName: record.supplierName || record.supplier?.name || "", phone: record.supplierPhone || record.supplier?.phone || "", invoiceNumber: record.invoiceNumber || "", deliveryName: record.deliveryName || "", deliveryPhone: record.deliveryPhone || "", receiverName: record.receiverName || "", receiveDate: String(record.receivedAt).slice(0, 10), amount: String(record.amount || ""), dueDate: String(record.dueAt).slice(0, 10) });
    }).catch(() => {}).finally(() => { if (active) setSaving(false); });
    return () => { active = false; };
  }, [api, supplierId]);
  const update = (name) => (event) => { setForm((current) => ({ ...current, [name]: event.target.value })); setErrors((current) => ({ ...current, [name]: false, submit: false })); };
  const save = async () => {
    const nextErrors = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, !String(value).trim()])); setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || saving) return;
    setSaving(true);
    try {
      const body = { name: form.supplierName.trim(), phone: form.phone.trim(), deliveryRecord: { invoiceNumber: form.invoiceNumber.trim(), deliveryName: form.deliveryName.trim(), deliveryPhone: form.deliveryPhone.trim(), receiverName: form.receiverName.trim(), receivedAt: form.receiveDate, dueAt: form.dueDate, amount: Number(form.amount) } };
      if (supplierId) await api.suppliers.updateDeliveryRecord(supplierId, body); else await api.suppliers.create(body);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "suppliers"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.supplierDeliveries(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "purchases"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.payments(shop?.id) }),
      ]);
      navigate("/suppliers");
    } catch (error) {
      const fieldErrors = error?.payload?.errors || {};
      const deliveryErrors = fieldErrors.deliveryRecord || {};
      const message = Object.values(fieldErrors).flat().filter(Boolean)[0] || error.message || "Unable to save supplier.";
      const duplicateInvoice = /invoice number already exists/i.test(message);
      setErrors((current) => ({ ...current, submit: duplicateInvoice ? false : message, ...(fieldErrors.name ? { supplierName: true } : {}), ...(fieldErrors.phone ? { phone: true } : {}), ...(deliveryErrors.invoiceNumber ? { invoiceNumber: true } : {}), ...(duplicateInvoice ? { invoiceNumber: message } : {}), ...(deliveryErrors.deliveryName ? { deliveryName: true } : {}), ...(deliveryErrors.deliveryPhone ? { deliveryName: true } : {}), ...(deliveryErrors.receiverName ? { receiverName: true } : {}), ...(deliveryErrors.receivedAt ? { receiveDate: true } : {}), ...(deliveryErrors.dueAt ? { dueDate: true } : {}), ...(deliveryErrors.amount ? { amount: true } : {}) }));
    } finally { setSaving(false); }
  };
  return <Box sx={{ minHeight: "100vh", bgcolor: "background.default", fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif" }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}><Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}><IconButton aria-label="Back to suppliers" onClick={() => navigate("/suppliers")} sx={{ justifySelf: "start", color: "common.white" }}><ArrowBackRoundedIcon /></IconButton><Typography sx={{ fontSize: 20, fontWeight: 600 }}>{isEditMode ? "Edit Supplier" : "Add Supplier"}</Typography><Box /></Toolbar></AppBar>
    <Box sx={{ px: 2.5, py: 3, maxWidth: 520, mx: "auto" }}>
      <FormField label="Supplier Name *" placeholder="Enter supplier name" value={form.supplierName} onChange={update("supplierName")} error={errors.supplierName} icon={<StorefrontOutlinedIcon />} />
      <FormField label="Phone *" placeholder="Enter phone number" value={form.phone} onChange={update("phone")} error={errors.phone} type="tel" icon={<PhoneOutlinedIcon />} />
      <FormField label="Invoice Number *" placeholder="Enter invoice number" value={form.invoiceNumber} onChange={update("invoiceNumber")} error={errors.invoiceNumber} icon={<ReceiptLongOutlinedIcon />} />
      <FormField label="Delivery Name *" placeholder="Enter delivery name" value={form.deliveryName} onChange={update("deliveryName")} error={errors.deliveryName} icon={<LocalShippingOutlinedIcon />} />
      <FormField label="Delivery Phone *" placeholder="Enter delivery phone" value={form.deliveryPhone} onChange={update("deliveryPhone")} error={errors.deliveryPhone} type="tel" icon={<PhoneOutlinedIcon />} />
      <FormField label="Receiver Name *" placeholder="Enter receiver name" value={form.receiverName} onChange={update("receiverName")} error={errors.receiverName} icon={<PersonOutlineRoundedIcon />} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}><FormField label="Receive Date *" value={form.receiveDate} onChange={update("receiveDate")} error={errors.receiveDate} type="date" icon={<CalendarTodayOutlinedIcon />} /><FormField label="Due Date *" value={form.dueDate} onChange={update("dueDate")} error={errors.dueDate} type="date" icon={<CalendarTodayOutlinedIcon />} /></Box>
      <FormField containerSx={{ mb: 0 }} label="Amount *" placeholder="Enter amount" value={form.amount} onChange={update("amount")} error={errors.amount || errors.submit} type="number" icon={<PaymentsOutlinedIcon />} />
    </Box>
    <Paper elevation={5} sx={{ position: "sticky", bottom: 0, zIndex: 10, px: 2.5, py: 2, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}><Box sx={{ maxWidth: 472, mx: "auto", display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 1.5 }}><Button variant="outlined" onClick={() => navigate("/suppliers")} sx={{ minHeight: 56, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none", borderColor: "divider", color: "text.secondary" }}>Cancel</Button><Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={save} disabled={saving} sx={{ minHeight: 56, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none" }}>{isEditMode ? "Save Supplier" : "Add Supplier"}</Button></Box></Paper>
  </Box>;
}
function FormField({ label, icon, error, type, containerSx, ...props }) { const isDate = type === "date"; const helperText = error === true ? "This field is required." : error || ""; return <Box sx={{ mb: 2, ...containerSx }}><Typography sx={{ mb: 0.75, fontSize: 14, fontWeight: 500 }}>{label}</Typography><TextField fullWidth error={Boolean(error)} helperText={helperText} type={type} slotProps={{ inputLabel: isDate ? { shrink: true } : undefined, input: { startAdornment: <InputAdornment position="start" sx={{ color: "text.secondary" }}>{icon}</InputAdornment> } }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 56, borderRadius: 1.5, bgcolor: "action.hover", "& fieldset": { border: 0 } }, "& .MuiInputBase-input": { fontSize: 16 }, "& input[type=number]": { MozAppearance: "textfield" }, "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 } }} {...props} /></Box>; }
