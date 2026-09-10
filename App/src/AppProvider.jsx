import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import AppRouter from "./AppRouter";
import { AppPreferenceContext } from "./context/AppPreferenceContext";
import { AuthContext } from "./context/AuthContext";
import { ApprovalProvider } from "./context/ApprovalContext";
import { apiRequest } from "./lib/api";
import { accessTokenRefreshDelay, requestAccessTokenRefresh } from "./lib/auth-refresh";
import { queryClient } from "./lib/queryClient";
import { readStoredJson } from "./lib/storage";
import { localeToUiLanguage, translateUi } from "./lib/uiLanguage";

const defaultShop = { name: "POS System", address: "", logo: "" };

export default function AppProvider() {
  const [shop, setShopState] = useState(() => readStoredJson("pos-shop-details", defaultShop));
  const [uiLanguage, setUiLanguageState] = useState(() => localStorage.getItem("pos-ui-language") || "English");
  const [session, setSession] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [registrationPromptOpen, setRegistrationPromptOpen] = useState(false);
  const previousShopId = useRef(null);
  const setShop = useCallback((nextShop) => { setShopState(nextShop); localStorage.setItem("pos-shop-details", JSON.stringify(nextShop)); }, []);
  const setUiLanguage = useCallback((language) => { setUiLanguageState(language); localStorage.setItem("pos-ui-language", language); }, []);
  const saveSession = useCallback((nextSession, nextAccessToken) => {
    setSession(nextSession);
    setAccessToken(nextAccessToken);
    setSessionExpired(false);
    if (nextSession.shop) {
      setShop({ name: nextSession.shop.name, address: nextSession.shop.address || "", logo: nextSession.shop.logoUrl || "" });
      setUiLanguage(localeToUiLanguage(nextSession.shop.setting?.locale));
    }
  }, [setShop, setUiLanguage]);
  const clearSession = useCallback(() => {
    queryClient.clear();
    setSession(null);
    setAccessToken(null);
  }, []);
  const expireSession = useCallback(() => {
    clearSession();
    setSessionExpired(true);
  }, [clearSession]);
  const logout = useCallback(async () => {
    try { await apiRequest("/auth/logout", { method: "POST" }); }
    catch { /* Local state must be cleared even when the network is unavailable. */ }
    finally { clearSession(); }
  }, [clearSession]);
  const continueAsGuest = useCallback(() => {
    setSessionExpired(false);
    const guestSession = { mode: "guest" };
    setSession(guestSession);
  }, []);
  const authenticate = useCallback(async (path, body) => {
    const result = await apiRequest(path, { method: "POST", body });
    const selectedShop = result.shop || result.user?.shops?.[0];
    if (!result.accessToken || !selectedShop) throw new Error("Your account does not have a shop yet.");
    saveSession({ user: result.user, shop: selectedShop }, result.accessToken);
    return result;
  }, [saveSession]);
  const login = useCallback((credentials) => authenticate("/auth/login", credentials), [authenticate]);
  const register = useCallback(async ({ logoFile, ...details }) => {
    const result = await authenticate("/auth/register", details);
    if (!logoFile || !result.shop?.id) return result;
    try {
      const body = new FormData();
      body.append("logo", logoFile);
      const logoResult = await apiRequest(`/shops/${result.shop.id}/logo`, { method: "POST", body, token: result.accessToken });
      const updatedShop = logoResult.shop;
      const updatedUser = { ...result.user, shops: (result.user?.shops || []).map((entry) => entry.id === updatedShop.id ? updatedShop : entry) };
      saveSession({ user: updatedUser, shop: updatedShop }, result.accessToken);
      return { ...result, user: updatedUser, shop: updatedShop };
    } catch (error) {
      return { ...result, logoUploadError: error.message || "Your account was created, but the logo could not be uploaded." };
    }
  }, [authenticate, saveSession]);
  const refreshAccessToken = useCallback(async () => {
    try {
      const refresh = await requestAccessTokenRefresh();
      if (!refresh?.accessToken) throw new Error("A refreshed access token was not returned.");
      setAccessToken(refresh.accessToken);
      return refresh.accessToken;
    } catch (error) {
      // Do not sign a user out merely because their connection temporarily
      // failed. A rejected/expired refresh session is the only expiry signal.
      if (error?.status === 401) expireSession();
      throw error;
    }
  }, [expireSession]);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      if (session?.mode === "guest") {
        if (active) setAuthReady(true);
        return;
      }
      try {
        const refresh = await requestAccessTokenRefresh();
        const result = await apiRequest("/auth/me", { token: refresh.accessToken });
        const selectedShop = result.user?.shops?.[0];
        if (!selectedShop) throw new Error("No shop found.");
        if (active) saveSession({ user: result.user, shop: selectedShop }, refresh.accessToken);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setAuthReady(true);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, [clearSession, saveSession, session?.mode]);
  useEffect(() => {
    if (!accessToken || session?.mode === "guest") return undefined;

    let active = true;
    let timer;
    const refreshBeforeExpiry = async () => {
      try {
        await refreshAccessToken();
      } catch (error) {
        // Retain the current session for a transient network/server failure and
        // try again shortly. Invalid refresh sessions are cleared above.
        if (active && error?.status !== 401) timer = window.setTimeout(refreshBeforeExpiry, 60_000);
      }
    };
    timer = window.setTimeout(refreshBeforeExpiry, accessTokenRefreshDelay(accessToken));
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, refreshAccessToken, session?.mode]);
  useEffect(() => {
    const nextShopId = session?.shop?.id;
    if (previousShopId.current && nextShopId && previousShopId.current !== nextShopId) queryClient.clear();
    previousShopId.current = nextShopId;
  }, [session?.shop?.id]);
  const theme = useMemo(() => createTheme({ palette: { mode: "light", primary: { main: "#1976d2", dark: "#1565c0" }, background: { default: "#f8fafc" } } }), []);
  const t = useCallback((key) => translateUi(uiLanguage, key), [uiLanguage]);
  const preferences = useMemo(() => ({ shop, setShop, uiLanguage, setUiLanguage, t }), [shop, setShop, uiLanguage, setUiLanguage, t]);
  const requestRegistration = useCallback(() => setRegistrationPromptOpen(true), []);
  const selectShop = useCallback((nextShop) => saveSession({ ...session, shop: nextShop }, accessToken), [accessToken, saveSession, session]);
  const hasPermission = useCallback((permission) => Boolean(session?.mode === "guest" || session?.shop?.isOwner || session?.shop?.permissions?.includes(permission)), [session?.mode, session?.shop]);
  const auth = useMemo(() => ({ session, user: session?.user || null, shop: session?.shop || null, token: accessToken, isGuest: session?.mode === "guest", isAuthenticated: Boolean(accessToken || session?.mode === "guest"), authReady, sessionExpired, login, register, logout, continueAsGuest, requestRegistration, selectShop, hasPermission, refreshAccessToken, expireSession }), [session, accessToken, authReady, sessionExpired, login, register, logout, continueAsGuest, requestRegistration, selectShop, hasPermission, refreshAccessToken, expireSession]);
  const guardGuestAction = (event) => {
    if (session?.mode !== "guest") return;
    const button = event.target.closest("button");
    const label = button?.textContent?.trim().replace(/\s+/g, " ") || "";
    if (/^(Save|Update Shop|Delete|Delete order|Record Payment|Save Payment|Order Completed|Apply Price|Create Promotion|Create Product|Add Stock)$/i.test(label)) {
      event.preventDefault();
      event.stopPropagation();
      setRegistrationPromptOpen(true);
    }
  };
  return <QueryClientProvider client={queryClient}><AppPreferenceContext.Provider value={preferences}><AuthContext.Provider value={auth}><ThemeProvider theme={theme}><CssBaseline /><ApprovalProvider><div onClickCapture={guardGuestAction}><AppRouter /></div></ApprovalProvider><Dialog open={registrationPromptOpen} onClose={() => setRegistrationPromptOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={800}>{t("Create an account to save")}</DialogTitle><DialogContent><Typography color="text.secondary">{t("Guest mode lets you explore General POS. Create an account before saving stock, orders, payments, or other business records.")}</Typography></DialogContent><DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setRegistrationPromptOpen(false)}>{t("Continue exploring")}</Button><Button variant="contained" onClick={() => { window.location.assign("/register"); }}>{t("Create account")}</Button></DialogActions></Dialog></ThemeProvider></AuthContext.Provider></AppPreferenceContext.Provider></QueryClientProvider>;
}
