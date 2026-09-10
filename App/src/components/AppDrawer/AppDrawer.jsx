import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useAppPreferences } from "../../context/AppPreferenceContext";
import {
  Avatar,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  AccountBalanceWalletRounded as PaymentIcon,
  AnalyticsRounded as ReportIcon,
  DashboardRounded as HomeIcon,
  Inventory2Rounded as InventoryIcon,
  LocalOfferRounded as PriceIcon,
  LogoutRounded as LogoutIcon,
  SettingsRounded as SettingsRoundedIcon,
  ShoppingCartRounded as SaleIcon,
  ShoppingCartSharp as SuppliersIcon,
  StorefrontRounded as StoreIcon,
} from "@mui/icons-material";

const menuItems = [
  { label: "Home", path: "/", icon: <HomeIcon /> },
  { label: "Orders", path: "/sale", icon: <SaleIcon />, permission: "order.view" },
  { label: "Inventory", path: "/stock", icon: <InventoryIcon />, permission: "stock.view" },
  {
    label: "Suppliers",
    path: "/suppliers",
    icon: <SuppliersIcon />, permission: "supplier.view",
  },
  {
    label: "Price & Discount",
    path: "/price",
    icon: <PriceIcon />, permission: "price.view",
  },

  {
    label: "Payment",
    path: "/payment",
    icon: <PaymentIcon />, permission: "payment.view",
  },
  { label: "Sale Report", path: "/report/sales", icon: <ReportIcon />, permission: "report.viewSales" },
  {
    label: "Product Report",
    path: "/report/products",
    icon: <InventoryIcon />, permission: "report.viewSales",
  },
  { label: "Settings", path: "/settings", icon: <SettingsRoundedIcon />, permission: "settings.manage" },
];

export default function AppDrawer({ expanded, setExpanded }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:768px)");
  const { t } = useAppPreferences();
  const { logout, shop, hasPermission } = useAuth();
  if (isMobile) return null;

  const drawerWidth = expanded ? 220 : 76;
  const textSx = { opacity: expanded ? 1 : 0, whiteSpace: "nowrap", transition: "opacity 100ms ease", overflow: "hidden", width: expanded ? "auto" : 0 };
  const navItemSx = { minHeight: 48, mb: 0.75, px: expanded ? 1.5 : 0, justifyContent: expanded ? "flex-start" : "center", borderRadius: 1.5, color: "rgba(255,255,255,0.94)", "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.14)", color: "#fff", "&:hover": { bgcolor: "rgba(255,255,255,0.18)" } }, "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } };
  const iconSx = { minWidth: expanded ? 38 : 0, color: "inherit", justifyContent: "center" };
  const listItem = (item) => <Tooltip key={item.label} title={expanded ? "" : t(item.label)} placement="right"><ListItemButton selected={item.path && pathname === item.path} onClick={() => item.label === "Logout" ? logout() : item.path && navigate(item.path)} sx={{ ...navItemSx, mb: item.label === "Logout" ? 0 : navItemSx.mb }}><ListItemIcon sx={iconSx}>{item.icon}</ListItemIcon><ListItemText primary={t(item.label)} sx={textSx} slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 600 } } }} /></ListItemButton></Tooltip>;
  return <Drawer variant="permanent" onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)} sx={{ width: drawerWidth, flexShrink: 0, transition: "width 180ms ease", "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box", overflowX: "hidden", background: "linear-gradient(180deg, #106fd5 0%, #0764ca 100%)", color: "#fff", borderRight: 0, transition: "width 180ms ease" } }}>
    <Toolbar sx={{ minHeight: 76, px: expanded ? 2.75 : 0, justifyContent: expanded ? "flex-start" : "center", gap: 1.5 }}>
      <Avatar sx={{ width: 40, height: 40, bgcolor: "#fff", color: "#1471d5", boxShadow: "0 3px 10px rgba(0,0,0,.12)" }}><StoreIcon /></Avatar>
      <Typography fontWeight={700} sx={{ ...textSx, fontSize: 17 }}>{shop?.name || "Belle Store"}</Typography>
    </Toolbar>
    <List sx={{ px: expanded ? 1.5 : 1.25, py: 1.75, flexGrow: 1 }}>{menuItems.filter((item) => !item.permission || hasPermission(item.permission)).map(listItem)}</List>
    <Divider sx={{ borderColor: "rgba(255,255,255,0.18)", mx: expanded ? 2.25 : 1.25 }} />
    <List sx={{ px: expanded ? 1.5 : 1.25, py: 1.5 }}>{listItem({ label: "Logout", icon: <LogoutIcon /> })}</List>
  </Drawer>;
}
