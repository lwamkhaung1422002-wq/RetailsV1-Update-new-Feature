import { Alert, Box, Button, Container, useMediaQuery } from "@mui/material";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import Header from "../../components/Header/Header";
import AppDrawer from "../../components/AppDrawer/AppDrawer";
import MobileBottomNavigation from "../../components/MobileBottomNavigation/MobileBottomNavigation";
import { useAuth } from "../../context/AuthContext";
import { prefetchCommonRouteChunks } from "../../routeChunks";

export default function AppLayout() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const { pathname } = useLocation();
  const { isGuest, requestRegistration } = useAuth();
  const isFullscreenMobilePage = pathname.startsWith("/sale/") || pathname === "/customers" || pathname.startsWith("/stock/") || pathname === "/suppliers" || pathname.startsWith("/suppliers/") || pathname.startsWith("/supplier-delivery/") || pathname === "/payment" || pathname.startsWith("/payment/") || pathname === "/price" || pathname.startsWith("/price/") || pathname.startsWith("/settings/") || pathname.startsWith("/report/");

  useEffect(() => {
    const connection = navigator.connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return undefined;
    const schedule = window.requestIdleCallback
      ? window.requestIdleCallback(() => { void prefetchCommonRouteChunks(); }, { timeout: 2_000 })
      : window.setTimeout(() => { void prefetchCommonRouteChunks(); }, 500);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(schedule);
      else window.clearTimeout(schedule);
    };
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: isMobile ? "#f8fafc" : "background.default" }}>
      <AppDrawer expanded={drawerExpanded} setExpanded={setDrawerExpanded} />
      <Box sx={{ ml: isMobile ? 0 : drawerExpanded ? "220px" : "76px", minHeight: "100vh", transition: "margin-left 180ms ease" }}>
        <Header />
        {isGuest && <Alert severity="info" sx={{ borderRadius: 0, py: .25 }} action={<Button color="inherit" size="small" onClick={requestRegistration}>Create account</Button>}>Guest mode — create an account to save and sync your store data.</Alert>}
        <Container component="main" maxWidth={false} disableGutters={isMobile} sx={{ pt: isMobile ? 0 : 1.5, px: isMobile ? 0 : { md: 3, lg: 3 }, pb: isMobile ? "88px" : 2 }}>
          <Outlet />
        </Container>
      </Box>
      {!isFullscreenMobilePage && <MobileBottomNavigation />}
    </Box>
  );
}
