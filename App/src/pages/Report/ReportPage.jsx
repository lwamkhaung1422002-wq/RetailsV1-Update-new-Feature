import { Box, Card, CardActionArea, CardContent, Typography, useMediaQuery } from "@mui/material";
import { DesktopPlaceholder, DesktopStat } from "../../components/Desktop/DesktopUI";
import { Button } from "@mui/material";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { useNavigate } from "react-router";
import { DesktopPanel } from "../../components/Desktop/DesktopUI";
import { useAppPreferences } from "../../context/AppPreferenceContext";
import { useAuth } from "../../context/AuthContext";

export default function ReportPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { t } = useAppPreferences();
  const { hasPermission } = useAuth();
  const choices = [<ReportChoice key="sales" icon={<AssessmentRoundedIcon />} title={t("Sale Report")} description={t("Review sales, payments, order activity, and store performance.")} label={t("Open report")} onClick={() => navigate("/report/sales")} />, <ReportChoice key="products" icon={<Inventory2RoundedIcon />} title={t("Product Report")} description={t("Monitor product sales, slow-moving inventory, low stock, and out-of-stock items.")} label={t("Open report")} onClick={() => navigate("/report/products")} />, ...(hasPermission("report.viewSales") ? [<ReportChoice key="payments" icon={<AccountBalanceWalletRoundedIcon />} title="Payment Report" description="Collections, refunds, methods, and staff activity." label={t("Open report")} onClick={() => navigate("/report/payments")} />] : [])];
  if (!isMobile) return <Box sx={{ maxWidth: 1440, mx: "auto", py: 1 }}><Typography sx={{ fontSize: 30, fontWeight: 700 }}>{t("Reports")}</Typography><Typography color="text.secondary" sx={{ mt: .75, fontSize: 15 }}>{t("Review sales performance and product inventory insights.")}</Typography><Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2.5, mt: 3 }}>{choices}</Box></Box>;
  if (isMobile) return <Box sx={{ px: 2, py: 2.5 }}><Typography sx={{ fontSize: 22, fontWeight: 800 }}>{t("Reports")}</Typography><Typography color="text.secondary" sx={{ mt: .5, fontSize: 14 }}>{t("Review your store performance and inventory insights.")}</Typography><Box sx={{ display: "grid", gap: 1.5, mt: 2.5 }}><MobileReportChoice icon={<AssessmentRoundedIcon />} title={t("Sale Report")} description={t("Sales, payments, orders, cost, and profit insights.")} onClick={() => navigate("/report/sales")} /><MobileReportChoice icon={<Inventory2RoundedIcon />} title={t("Product Report")} description={t("Product sales, low stock, and inventory movement insights.")} onClick={() => navigate("/report/products")} />{hasPermission("report.viewSales") && <MobileReportChoice icon={<AccountBalanceWalletRoundedIcon />} title="Payment Report" description="Collections, refunds, methods, and staff activity." onClick={() => navigate("/report/payments")} />}</Box></Box>;
  return <DesktopPlaceholder title="Reports" description="Sales performance and inventory insights for your store." primaryLabel="Export Report"><Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}><DesktopStat label="Today's Sales" value="114,500 ကျပ်" color="success.main" /><DesktopStat label="Today's Expense" value="0 ကျပ်" color="warning.main" /><DesktopStat label="Net Profit" value="114,500 ကျပ်" color="primary.main" /></Box><Box sx={{ mt: 3, height: 190, borderRadius: 2, bgcolor: "#f6f9fd", display: "grid", placeItems: "center" }}><Typography color="text.secondary">Sales chart will appear here</Typography></Box></DesktopPlaceholder>;
}

function MobileReportChoice({ icon, title, description, onClick }) {
  return <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, boxShadow: "0 3px 12px rgba(15,23,42,.06)" }}><CardActionArea onClick={onClick} sx={{ borderRadius: "inherit" }}><CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2, "&:last-child": { pb: 2 } }}><Box sx={{ width: 46, height: 46, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 2, bgcolor: "#eaf3ff", color: "primary.main" }}>{icon}</Box><Box><Typography sx={{ fontSize: 16, fontWeight: 800 }}>{title}</Typography><Typography color="text.secondary" sx={{ mt: .35, fontSize: 13, lineHeight: 1.4 }}>{description}</Typography></Box></CardContent></CardActionArea></Card>;
}

function ReportChoice({ icon, title, description, label, onClick }) {
  return <DesktopPanel sx={{ minHeight: 210, cursor: "pointer", transition: "box-shadow .18s ease, transform .18s ease", "&:hover": { boxShadow: "0 9px 22px rgba(15,23,42,.13)", transform: "translateY(-2px)" } }}><Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}><Box sx={{ width: 50, height: 50, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "#eaf3ff", color: "primary.main", "& .MuiSvgIcon-root": { fontSize: 28 } }}>{icon}</Box><Typography sx={{ mt: 2, fontSize: 20, fontWeight: 750 }}>{title}</Typography><Typography color="text.secondary" sx={{ mt: .75, lineHeight: 1.6 }}>{description}</Typography><Button onClick={onClick} endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: "auto", pt: 2, px: 0, textTransform: "none", fontWeight: 700 }}>{label}</Button></Box></DesktopPanel>;
}
