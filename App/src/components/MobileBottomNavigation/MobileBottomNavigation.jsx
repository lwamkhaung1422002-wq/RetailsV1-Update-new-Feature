import { BottomNavigation, BottomNavigationAction, Paper, useMediaQuery } from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { useLocation, useNavigate } from "react-router";
import { useAppPreferences } from "../../context/AppPreferenceContext";
import { useAuth } from "../../context/AuthContext";

const navigationItems = [
  { label: "Home", value: "/", icon: <DashboardRoundedIcon /> },
  { label: "Orders", value: "/sale", icon: <ShoppingCartRoundedIcon />, permission: "order.view" },
  { label: "Inventory", value: "/stock", icon: <Inventory2RoundedIcon />, permission: "stock.view" },
  { label: "More", value: "/settings", icon: <SettingsRoundedIcon /> },
];

export default function MobileBottomNavigation() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useAppPreferences();
  const { hasPermission } = useAuth();
  const visibleItems = navigationItems.filter((item) => !item.permission || hasPermission(item.permission));

  if (!isMobile) return null;

  const selectedValue = visibleItems.some((item) => item.value === pathname) ? pathname : false;

  return (
    <Paper elevation={8} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.appBar, bgcolor: "#fff" }}>
      <BottomNavigation value={selectedValue} onChange={(_, value) => navigate(value)} showLabels sx={{ height: 72, bgcolor: "transparent", "& .MuiBottomNavigationAction-root": { color: "#9a9a9a", minWidth: 0 }, "& .Mui-selected": { color: "#1976d2" } }}>
        {visibleItems.map((item) => <BottomNavigationAction key={item.value} label={t(item.label)} value={item.value} icon={item.icon} />)}
      </BottomNavigation>
    </Paper>
  );
}
