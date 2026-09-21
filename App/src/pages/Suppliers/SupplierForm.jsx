import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, InputAdornment, TextField, Typography } from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { useSupplierDeliveriesQuery } from "../../hooks/usePosQueries";
import { queryKeys } from "../../lib/queryKeys";
import { buildSupplierHistoryOptions } from "./supplierHistory";

const initialForm = {
  supplierName: "",
  phone: "",
  invoiceNumber: "",
  deliveryName: "",
  deliveryPhone: "",
  receiveDate: "",
  amount: "",
  dueDate: "",
};

export default function SupplierForm({ formId, supplierId = "", desktop = false, onSaved }) {
  const api = usePosApi();
  const queryClient = useQueryClient();
  const { shop } = useAuth();
  const { data: deliveryResult } = useSupplierDeliveriesQuery({ page: 1, pageSize: 100 });
  const options = useMemo(
    () => buildSupplierHistoryOptions(deliveryResult?.records || []),
    [deliveryResult],
  );
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supplierId) {
      return undefined;
    }
    let active = true;
    api.suppliers.deliveryRecord(supplierId).then(({ record }) => {
      if (!active) return;
      setForm({
        supplierName: record.supplierName || record.supplier?.name || "",
        phone: record.supplierPhone || record.supplier?.phone || "",
        invoiceNumber: record.invoiceNumber || "",
        deliveryName: record.deliveryName || "",
        deliveryPhone: record.deliveryPhone || "",
        receiveDate: String(record.receivedAt || "").slice(0, 10),
        amount: String(record.amount || ""),
        dueDate: String(record.dueAt || "").slice(0, 10),
      });
    }).catch(() => {}).finally(() => { if (active) setSaving(false); });
    return () => { active = false; };
  }, [api, supplierId]);

  const setValue = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: false, submit: false }));
  };
  const update = (name) => (event) => setValue(name, event.target.value);
  const selectSupplier = (_event, value) => {
    if (value && typeof value === "object") {
      setForm((current) => ({ ...current, supplierName: value.name, phone: value.phone || "" }));
      setErrors((current) => ({ ...current, supplierName: false, phone: false, submit: false }));
    } else if (typeof value === "string") {
      setValue("supplierName", value);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, !String(value).trim()]),
    );
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || saving) return;
    setSaving(true);
    try {
      const body = {
        name: form.supplierName.trim(),
        phone: form.phone.trim(),
        deliveryRecord: {
          invoiceNumber: form.invoiceNumber.trim(),
          deliveryName: form.deliveryName.trim(),
          deliveryPhone: form.deliveryPhone.trim(),
          receivedAt: form.receiveDate,
          dueAt: form.dueDate,
          amount: Number(form.amount),
        },
      };
      if (supplierId) await api.suppliers.updateDeliveryRecord(supplierId, body);
      else await api.suppliers.create(body);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.supplierDeliveries(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: ["shops", shop?.id, "purchases"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.payments(shop?.id) }),
      ]);
      onSaved?.();
    } catch (error) {
      const fieldErrors = error?.payload?.errors || {};
      const deliveryErrors = fieldErrors.deliveryRecord || {};
      const message = Object.values(fieldErrors).flat().filter(Boolean)[0] || error.message || "Unable to save supplier.";
      const duplicateInvoice = /invoice number already exists/i.test(message);
      setErrors((current) => ({
        ...current,
        submit: duplicateInvoice ? false : message,
        ...(fieldErrors.name ? { supplierName: true } : {}),
        ...(fieldErrors.phone ? { phone: true } : {}),
        ...(deliveryErrors.invoiceNumber || duplicateInvoice ? { invoiceNumber: duplicateInvoice ? message : true } : {}),
        ...(deliveryErrors.deliveryName ? { deliveryName: true } : {}),
        ...(deliveryErrors.deliveryPhone ? { deliveryPhone: true } : {}),
        ...(deliveryErrors.receivedAt ? { receiveDate: true } : {}),
        ...(deliveryErrors.dueAt ? { dueDate: true } : {}),
        ...(deliveryErrors.amount ? { amount: true } : {}),
      }));
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, icon, props = {}) => (
    <FormField
      key={name}
      label={label}
      value={form[name]}
      onChange={update(name)}
      error={errors[name] || (name === "amount" ? errors.submit : false)}
      icon={icon}
      desktop={desktop}
      {...props}
    />
  );

  return (
    <Box
      component="form"
      id={formId}
      onSubmit={save}
      data-saving={saving ? "true" : "false"}
      sx={desktop ? { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 1.5 } : undefined}
    >
      <Box sx={desktop ? { gridColumn: "1 / -1" } : undefined}>
        {!desktop && <Typography sx={{ mb: 0.75, fontSize: 14, fontWeight: 500 }}>Supplier Name *</Typography>}
        <Autocomplete
          freeSolo
          autoHighlight
          options={options}
          getOptionLabel={(option) => typeof option === "string" ? option : option.name}
          inputValue={form.supplierName}
          onInputChange={(_event, value, reason) => {
            if (reason === "input" || reason === "clear") setValue("supplierName", value);
          }}
          onChange={selectSupplier}
          renderInput={(params) => (
            <TextField
              {...params}
              label={desktop ? "Supplier Name *" : undefined}
              placeholder="Enter supplier name"
              error={Boolean(errors.supplierName)}
              helperText={errors.supplierName ? "This field is required." : ""}
              slotProps={{
                input: {
                  ...params.slotProps.input,
                  startAdornment: <><InputAdornment position="start" sx={{ color: "text.secondary" }}><StorefrontOutlinedIcon /></InputAdornment>{params.slotProps.input.startAdornment}</>,
                },
                htmlInput: params.slotProps.htmlInput,
              }}
              sx={supplierFieldSx(desktop)}
            />
          )}
          sx={{ mb: 2 }}
        />
      </Box>
      {field("phone", "Phone *", <PhoneOutlinedIcon />, { placeholder: "Enter phone number", type: "tel" })}
      {field("invoiceNumber", "Invoice Number *", <ReceiptLongOutlinedIcon />, { placeholder: "Enter invoice number" })}
      {field("deliveryName", "Delivery Name *", <LocalShippingOutlinedIcon />, { placeholder: "Enter delivery name" })}
      {field("deliveryPhone", "Delivery Phone *", <PhoneOutlinedIcon />, { placeholder: "Enter delivery phone", type: "tel" })}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, ...(desktop ? { gridColumn: "1 / -1" } : {}) }}>
        {field("receiveDate", "Receive Date *", <CalendarTodayOutlinedIcon />, { type: "date" })}
        {field("dueDate", "Due Date *", <CalendarTodayOutlinedIcon />, { type: "date" })}
      </Box>
      <Box sx={desktop ? { gridColumn: "1 / -1" } : undefined}>
        {field("amount", "Amount *", <PaymentsOutlinedIcon />, { placeholder: "Enter amount", type: "number", containerSx: { mb: 0 } })}
      </Box>
      <button type="submit" hidden aria-label="Submit supplier form" />
    </Box>
  );
}

function supplierFieldSx(desktop) {
  return {
    "& .MuiOutlinedInput-root": {
      minHeight: desktop ? 50 : 56,
      borderRadius: 1.5,
      bgcolor: "action.hover",
      "& fieldset": { border: 0 },
    },
    "& .MuiInputBase-input": { fontSize: desktop ? 14 : 16 },
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
  };
}

function FormField({ label, icon, error, type, containerSx, desktop, ...props }) {
  const isDate = type === "date";
  const helperText = error === true ? "This field is required." : error || "";
  return <Box sx={{ mb: 2, ...containerSx }}>{!desktop && <Typography sx={{ mb: 0.75, fontSize: 14, fontWeight: 500 }}>{label}</Typography>}<TextField fullWidth label={desktop ? label : undefined} error={Boolean(error)} helperText={helperText} type={type} slotProps={{ inputLabel: isDate ? { shrink: true } : undefined, input: { startAdornment: <InputAdornment position="start" sx={{ color: "text.secondary" }}>{icon}</InputAdornment> } }} sx={supplierFieldSx(desktop)} {...props} /></Box>;
}
