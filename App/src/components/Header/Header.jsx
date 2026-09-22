import { useEffect, useState } from "react";
import { AppBar, Avatar, Badge, Box, Button, Divider, IconButton, Menu, MenuItem, Stack, Toolbar, Typography, useMediaQuery } from "@mui/material";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { usePosApi } from "../../hooks/useApiResource";
import { useAppPreferences } from "../../context/AppPreferenceContext";

const pageTitles = {
  "/": "Home",
  "/sale": "Orders",
  "/sale/create": "Create Order",
  "/stock": "Inventory",
  "/note": "Note",
  "/sale-record": "Sale Records",
  "/payment": "Payment",
  "/report": "Reports",
  "/price": "Price & Discount",
  "/suppliers": "Suppliers",
  "/settings": "Settings",
  "/settings/staff-access": "Staff & Access",
  "/branches": "Branches",
  "/report/payments": "Payment Report",
  "/report/operations": "Operations",
};

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:768px)");
  const isDesktopStockDetails = pathname.startsWith("/stock/") && !["/stock/add", "/stock/history", "/stock/movement/add"].includes(pathname);
  const isDesktopStockHistory = pathname === "/stock/history";
  const isDesktopCreateOrder = pathname === "/sale/create";
  const isSupplierDetails = /^\/suppliers\/[^/]+$/.test(pathname);
  const mobileTitle = pathname === "/" ? "Dashboard" : pageTitles[pathname] ?? "POS System";
  const [sortAnchor, setSortAnchor] = useState(null);
  const [notificationAnchor, setNotificationAnchor] = useState(null);
  const [shopAnchor, setShopAnchor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const api = usePosApi();
  const { t } = useAppPreferences();
  const { shop, user, selectShop } = useAuth();
  const accessibleShops = user?.shops || [];
  const hasBranchSelector = accessibleShops.length > 1;
  const showBranchManagement = Boolean(shop?.isOwner);
  const branchMenu = <Menu anchorEl={shopAnchor} open={Boolean(shopAnchor)} onClose={() => setShopAnchor(null)} PaperProps={{ sx: { minWidth: 220, mt: 1 } }}>
    {showBranchManagement && <MenuItem onClick={() => { setShopAnchor(null); navigate("/branches"); }}>All branches</MenuItem>}
    {showBranchManagement && <Divider />}
    {accessibleShops.map((entry) => <MenuItem key={entry.id} selected={entry.id === shop?.id} onClick={() => { selectShop(entry); setShopAnchor(null); }}>{entry.name}</MenuItem>)}
  </Menu>;
  useEffect(() => { let active = true; if (!shop?.id) return undefined; api.notifications.list().then((result) => { if (active) setNotifications(result.notifications || []); }).catch(() => {}); return () => { active = false; }; }, [api, shop?.id]);

  if (isMobile) {
    const mobileShopHeader = ["/", "/sale", "/stock", "/settings", "/branches"].includes(pathname);
    if (!mobileShopHeader && (pathname.startsWith("/sale/") || pathname.startsWith("/stock/") || pathname === "/suppliers" || pathname.startsWith("/suppliers/") || pathname.startsWith("/supplier-delivery/") || pathname === "/payment" || pathname.startsWith("/payment/") || pathname === "/price" || pathname.startsWith("/price/") || pathname.startsWith("/settings/") || pathname.startsWith("/report/"))) return null;
    const action = pathname === "/stock"
      ? { label: "Sort inventory", icon: <FilterListRoundedIcon />, event: "inventory-sort" }
      : pathname === "/sale"
      ? { label: "Filter orders", icon: <FilterListRoundedIcon />, event: "orders-filter" }
      : pathname === "/suppliers"
      ? { label: "Filter suppliers", icon: <FilterListRoundedIcon />, event: "suppliers-filter" }
      : null;

    if (mobileShopHeader) return (
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#1976d2", borderBottom: 0 }}>
        <Toolbar sx={{ minHeight: 64, px: 2, display: "flex", justifyContent: "space-between", gap: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.15} onClick={hasBranchSelector ? (event) => setShopAnchor(event.currentTarget) : undefined} sx={{ minWidth: 0, cursor: hasBranchSelector ? "pointer" : "default" }}>
            <Avatar src={shop?.logoUrl || undefined} alt={shop?.name || "Shop"} sx={{ width: 34, height: 34, bgcolor: "common.white", color: "primary.main", border: "1px solid rgba(255,255,255,.55)" }}><StorefrontRoundedIcon fontSize="small" /></Avatar>
            <Typography noWrap sx={{ minWidth: 0, color: "common.white", fontSize: 17, fontWeight: 750 }}>{pathname === "/settings" ? t("More") : shop?.name || "POS System"}</Typography>
            {hasBranchSelector && <KeyboardArrowDownRoundedIcon sx={{ color: "common.white", flexShrink: 0 }} />}
          </Stack>
          {action ? <IconButton aria-label={action.label} onClick={(event) => action.event === "inventory-sort" ? setSortAnchor(event.currentTarget) : window.dispatchEvent(new Event(action.event))} sx={{ flexShrink: 0, color: "common.white" }}>{action.icon}</IconButton> : <Box sx={{ width: 40, flexShrink: 0 }} />}
        </Toolbar>
        <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)} PaperProps={{ sx: { minWidth: 268, borderRadius: 1, mt: 1 } }}>
          {[ ["recent", "Recently Added"], ["name", "Name (A-Z)"], ["price", "Price (High to Low)"], ["stock", "Stock (Low to High)"] ].map(([value, label]) => <MenuItem key={value} onClick={() => { window.dispatchEvent(new CustomEvent("inventory-sort", { detail: value })); setSortAnchor(null); }} sx={{ minHeight: 60, fontSize: 17 }}>{t(label)}</MenuItem>)}
        </Menu>
        {branchMenu}
      </AppBar>
    );

    return (
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#1976d2", borderBottom: 0 }}>
        <Toolbar sx={{ minHeight: 64, display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
          <Box />
          <Typography variant="h6" fontWeight={700}>{t(mobileTitle)}</Typography>
          {action ? <IconButton aria-label={action.label} onClick={(event) => action.event === "inventory-sort" ? setSortAnchor(event.currentTarget) : window.dispatchEvent(new Event(action.event))} sx={{ justifySelf: "end", color: "common.white" }}>{action.icon}</IconButton> : <Box />}
        </Toolbar>
        <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)} PaperProps={{ sx: { minWidth: 268, borderRadius: 1, mt: 1 } }}>
          {[ ["recent", "Recently Added"], ["name", "Name (A-Z)"], ["price", "Price (High to Low)"], ["stock", "Stock (Low to High)"] ].map(([value, label]) => <MenuItem key={value} onClick={() => { window.dispatchEvent(new CustomEvent("inventory-sort", { detail: value })); setSortAnchor(null); }} sx={{ minHeight: 60, fontSize: 17 }}>{t(label)}</MenuItem>)}
        </Menu>
        {branchMenu}
      </AppBar>
    );
  }

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar sx={{ justifyContent: "space-between", minHeight: 72, px: { md: 4, lg: 5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {(isDesktopStockDetails || isDesktopStockHistory || isDesktopCreateOrder) && <IconButton aria-label={isDesktopCreateOrder ? "Back to orders" : "Back to inventory"} onClick={() => navigate(isDesktopCreateOrder ? "/sale" : "/stock")} sx={{ ml: -1 }}><ArrowBackRoundedIcon /></IconButton>}
          {!isSupplierDetails && <Typography variant="h6" fontWeight={800}>{t(pathname === "/" ? "Dashboard" : isDesktopStockDetails ? "Stock Details" : isDesktopStockHistory ? "Stock Movement" : pathname === "/report/sales" ? "Sale Report" : pathname === "/report/products" ? "Product Report" : pathname === "/report/payments" ? "Payment Report" : pathname.startsWith("/report") ? "Reports" : pageTitles[pathname] ?? "POS System")}</Typography>}
        </Box>
        <Stack direction="row" spacing={1}>
          {hasBranchSelector && <Button color="inherit" onClick={(event) => setShopAnchor(event.currentTarget)} endIcon={<KeyboardArrowDownRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700 }}>{shop?.name}</Button>}
          <IconButton aria-label="Notifications" onClick={(event) => setNotificationAnchor(event.currentTarget)}><Badge color="error" variant="dot" invisible={!notifications.some((item) => !item.readAt)}><NotificationsRoundedIcon /></Badge></IconButton>
          <IconButton aria-label="Account"><AccountCircleRoundedIcon /></IconButton>
        </Stack>
      </Toolbar>
      <Menu anchorEl={notificationAnchor} open={Boolean(notificationAnchor)} onClose={() => setNotificationAnchor(null)} PaperProps={{ sx: { width: 340, maxHeight: 420 } }}>
        {!notifications.length && <MenuItem disabled>{t("No notifications")}</MenuItem>}
        {notifications.map((item) => <MenuItem key={item.id} onClick={async () => { if (!item.readAt) { await api.notifications.markRead(item.id); setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); } }} sx={{ whiteSpace: "normal", alignItems: "flex-start", opacity: item.readAt ? .65 : 1 }}><Box><Typography fontWeight={700} variant="body2">{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.message}</Typography></Box></MenuItem>)}
      </Menu>
      {branchMenu}
    </AppBar>
  );
}
