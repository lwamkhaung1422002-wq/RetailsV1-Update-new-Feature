import { useNavigate, useSearchParams } from "react-router";
import { AppBar, Box, Button, IconButton, Paper, Toolbar, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import SupplierForm from "./SupplierForm";

export default function AddSupplierPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); const supplierId = searchParams.get("edit"); const isEditMode = Boolean(supplierId);
  const formId = "mobile-supplier-form";
  return <Box sx={{ minHeight: "100vh", bgcolor: "background.default", fontFamily: "Inter, Roboto, Noto Sans Myanmar, sans-serif" }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main" }}><Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}><IconButton aria-label="Back to suppliers" onClick={() => navigate("/suppliers")} sx={{ justifySelf: "start", color: "common.white" }}><ArrowBackRoundedIcon /></IconButton><Typography sx={{ fontSize: 20, fontWeight: 600 }}>{isEditMode ? "Edit Supplier" : "Add Supplier"}</Typography><Box /></Toolbar></AppBar>
    <Box sx={{ px: 2.5, py: 3, maxWidth: 520, mx: "auto" }}>
      <SupplierForm formId={formId} supplierId={supplierId || ""} onSaved={() => navigate("/suppliers")} />
    </Box>
    <Paper elevation={5} sx={{ position: "sticky", bottom: 0, zIndex: 10, px: 2.5, py: 2, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}><Box sx={{ maxWidth: 472, mx: "auto", display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 1.5 }}><Button variant="outlined" onClick={() => navigate("/suppliers")} sx={{ minHeight: 56, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none", borderColor: "divider", color: "text.secondary" }}>Cancel</Button><Button variant="contained" type="submit" form={formId} startIcon={<CheckRoundedIcon />} sx={{ minHeight: 56, borderRadius: 1.5, fontSize: 16, fontWeight: 600, textTransform: "none" }}>{isEditMode ? "Save Supplier" : "Add Supplier"}</Button></Box></Paper>
  </Box>;
}
