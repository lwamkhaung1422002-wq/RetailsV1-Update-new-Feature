import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  AppBar,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Fab,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import BarcodeScannerDialog from "../../components/BarcodeScanner/BarcodeScannerDialog";
import { usePosApi } from "../../hooks/useApiResource";
import { useProductsQuery } from "../../hooks/usePosQueries";
import { queryKeys } from "../../lib/queryKeys";
import { useAuth } from "../../context/AuthContext";

const initialItems = [];

function printReceipt(order, items, totals, method) {
  const popup = window.open("", "_blank", "width=420,height=700");
  if (!popup)
    throw new Error(
      "The print window was blocked. Allow pop-ups and try again.",
    );
  const rows = items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)} × ${item.quantity}</td><td>${formatMoney(item.price * item.quantity)}</td></tr>`,
    )
    .join("");
  popup.document.write(
    `<!doctype html><html><head><title>Receipt ${escapeHtml(order.orderNumber || order.id)}</title><style>@page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:4mm;font:12px Arial,sans-serif;color:#111}.head{text-align:center;border-bottom:1px dashed #222;padding-bottom:3mm}.head h1{font-size:16px;margin:0 0 2mm}.meta{font-size:10px;text-align:left;margin:3mm 0}table{width:100%;border-collapse:collapse}td{padding:1.4mm 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total{border-top:1px dashed #222;margin-top:2mm;padding-top:2mm;font-size:14px;font-weight:700;display:flex;justify-content:space-between}.foot{text-align:center;border-top:1px dashed #222;margin-top:3mm;padding-top:3mm;font-size:10px}</style></head><body><div class="head"><h1>POS RECEIPT</h1><div>${escapeHtml(order.orderNumber || order.id)}</div></div><div class="meta">Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}<br>Payment: ${escapeHtml(method)}</div><table>${rows}</table><div class="total"><span>Total</span><span>${formatMoney(totals.total)}</span></div><div class="foot">Thank you for shopping.</div><script>window.onload=()=>window.print();window.onafterprint=()=>window.close();</script></body></html>`,
  );
  popup.document.close();
}
function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}
void printReceipt;

const toPricedCartItem = (product, quantity, pricing) => ({ ...product, price: Number(pricing.regularUnitPrice ?? product.price ?? 0), quantity, promotion: pricing.promotionId ? { type: "discount", value: Number(pricing.promotionDiscount || 0) * quantity, text: `Promotion${pricing.promotionName ? `: ${pricing.promotionName}` : ""}` } : { type: "regular", text: "Regular price" } });

const formatMoney = (amount) =>
  `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;

function QuantityButton({ item, change, onQuantityChange, children, ...props }) {
  const delayTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const ignoreClickRef = useRef(false);

  const stopRepeating = () => {
    if (delayTimerRef.current) window.clearTimeout(delayTimerRef.current);
    if (repeatTimerRef.current) window.clearInterval(repeatTimerRef.current);
    delayTimerRef.current = null;
    repeatTimerRef.current = null;
  };

  useEffect(() => stopRepeating, []);

  const startRepeating = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    ignoreClickRef.current = true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onQuantityChange(item.id, change);
    delayTimerRef.current = window.setTimeout(() => {
      repeatTimerRef.current = window.setInterval(
        () => onQuantityChange(item.id, change),
        120,
      );
    }, 350);
  };

  const releaseRepeating = () => {
    stopRepeating();
    // Pointer clicks are dispatched immediately after pointer-up. Clearing on the
    // next task keeps that click from applying the change a second time.
    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 0);
  };

  return (
    <IconButton
      {...props}
      onPointerDown={startRepeating}
      onPointerUp={releaseRepeating}
      onPointerCancel={releaseRepeating}
      onPointerLeave={releaseRepeating}
      onClick={() => {
        if (ignoreClickRef.current) {
          ignoreClickRef.current = false;
          return;
        }
        onQuantityChange(item.id, change);
      }}
      sx={{ touchAction: "manipulation", userSelect: "none", ...props.sx }}
    >
      {children}
    </IconButton>
  );
}

function QuantityInput({ item, onQuantitySet, sx }) {
  const [draft, setDraft] = useState(null);
  const value = draft ?? String(item.quantity);

  const commit = () => {
    if (draft === null || draft.trim() === "") {
      setDraft(null);
      return;
    }
    const quantity = Number(draft);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.stock) {
      setDraft(null);
      return;
    }
    setDraft(null);
    onQuantitySet(item.id, quantity);
  };

  return <Box component="input" type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`Quantity for ${item.name}`} value={value} onChange={(event) => { const nextValue = event.target.value; if (/^\d*$/.test(nextValue)) setDraft(nextValue); }} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); event.currentTarget.blur(); } }} sx={{ width: "100%", minWidth: 0, height: "100%", p: 0, border: 0, outline: 0, bgcolor: "transparent", color: "text.primary", textAlign: "center", font: "inherit", ...sx }} />;
}

const ProductCard = memo(function ProductCard({ item, onQuantityChange, onQuantitySet }) {
  const lineTotal = item.price * item.quantity;
  const promotionText =
    item.promotion.type === "discount"
      ? `${item.promotion.text} · Discount ${formatMoney(item.promotion.value)}`
      : item.promotion.text;

  return (
    <Card
      sx={{
        minHeight: 148,
        borderRadius: 2.5,
        boxShadow: "0 2px 8px rgba(15,23,42,0.14)",
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" spacing={1.5}>
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: 78,
              height: 104,
              borderRadius: 2,
              bgcolor: "#edf7fc",
              color: item.color,
              flexShrink: 0,
            }}
          >
            {item.icon}
          </Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                columnGap: 1,
                alignItems: "start",
              }}
            >
              <Box>
                <Typography fontWeight={700}>{item.name}</Typography>
                <Typography sx={{ mt: 0.25 }}>
                  {formatMoney(item.price)}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.25 }}
                >
                  Stock: {item.stock} pcs
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "44px 40px 44px",
                    height: 46,
                    border: "1px solid #1976d2",
                    borderRadius: 1.5,
                    overflow: "hidden",
                  }}
                >
                  <QuantityButton
                    size="small"
                    aria-label={`Reduce ${item.name} quantity`}
                    item={item}
                    change={-1}
                    onQuantityChange={onQuantityChange}
                    sx={{
                      borderRadius: 0,
                      color: "#1976d2",
                      borderRight: "1px solid #1976d2",
                    }}
                  >
                    <RemoveRoundedIcon />
                  </QuantityButton>
                  <QuantityInput item={item} onQuantitySet={onQuantitySet} sx={{ fontWeight: 600 }} />
                  <QuantityButton
                    size="small"
                    aria-label={`Increase ${item.name} quantity`}
                    item={item}
                    change={1}
                    onQuantityChange={onQuantityChange}
                    sx={{
                      borderRadius: 0,
                      color: "#1976d2",
                      borderLeft: "1px solid #1976d2",
                    }}
                  >
                    <AddRoundedIcon />
                  </QuantityButton>
                </Box>
                <Typography fontWeight={700} sx={{ mt: 0.8 }}>
                  {formatMoney(lineTotal)}
                </Typography>
              </Box>
            </Box>
            <Stack
              direction="row"
              spacing={0.8}
              alignItems="center"
              sx={{
                minHeight: 38,
                mt: 1.1,
                px: 1,
                py: 0.65,
                borderRadius: 1.5,
                bgcolor: "#f0faf2",
                color: "#278a45",
              }}
            >
              {item.promotion.type === "discount" ? (
                <SellOutlinedIcon fontSize="small" />
              ) : (
                <Inventory2RoundedIcon fontSize="small" />
              )}
              <Typography variant="body2" fontWeight={500}>
                {promotionText}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
});

export default function CreateOrderPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState(initialItems);
  const itemsRef = useRef(initialItems);
  const pricingRevisionRef = useRef(new Map());
  const pendingQuantityRef = useRef(new Map());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [otherAnchor, setOtherAnchor] = useState(null);
  const [otherPayment, setOtherPayment] = useState("unpaid");
  const [amountReceived, setAmountReceived] = useState("0");
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [note, setNote] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [configuredMethods, setConfiguredMethods] = useState([]);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [orderError, setOrderError] = useState("");
  const {
    data: catalogResponse,
    error: catalogQueryError,
    refetch: refetchCatalog,
  } = useProductsQuery(
    { status: "active", page: 1, pageSize: 100, sort: "name", direction: "asc", view: "catalog" },
  );
  const catalog = useMemo(() => (catalogResponse?.products || []).map((product) => ({ ...product, price: Number(product.price || 0), stock: Number(product.currentStock || 0), color: "#1976d2", icon: <Inventory2RoundedIcon />, promotion: { type: "regular", text: "Regular price" } })), [catalogResponse]);
  const catalogError = catalogQueryError?.message || "";

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const commitItems = useCallback((nextItems) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);
  const nextPricingRevision = useCallback((productId) => {
    const revision = (pricingRevisionRef.current.get(productId) || 0) + 1;
    pricingRevisionRef.current.set(productId, revision);
    return revision;
  }, []);

  useEffect(() => {
    const refreshCatalog = () => {
      void refetchCatalog();
    };
    window.addEventListener("inventory-updated", refreshCatalog);
    return () => window.removeEventListener("inventory-updated", refreshCatalog);
  }, [refetchCatalog]);

  useEffect(() => {
    if (!createdOrder) return undefined;
    const timer = window.setTimeout(() => setCreatedOrder(null), 5000);
    return () => window.clearTimeout(timer);
  }, [createdOrder]);

  useEffect(() => {
    let active = true;
    api.shop
      .getSettings()
      .then(({ settings }) => {
        if (active) setConfiguredMethods(settings.paymentMethods || []);
      })
      .catch(() => {
        if (active) setConfiguredMethods([]);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const totals = useMemo(() => {
    const quantity = items.reduce((total, item) => total + item.quantity, 0);
    const itemsTotal = items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
    const discount = items.reduce(
      (total, item) =>
        total + (item.promotion.type === "discount" ? item.promotion.value : 0),
      0,
    );
    return { quantity, itemsTotal, discount, total: itemsTotal - discount };
  }, [items]);

  const cashAmount = Number(amountReceived.replace(/,/g, "")) || 0;
  const isPartial = paymentMethod === "other" && otherPayment === "partial";
  const showsAmountReceived = paymentMethod === "cash" || isPartial;
  const insufficientAmount = items.length > 0 && paymentMethod === "cash" && amountReceivedTouched && cashAmount < totals.total;
  // A new order has no existing balance to settle. Partial is simply the
  // amount received at creation; the later Payment worklist owns settlement
  // and remaining-balance validation.
  const invalidPartialAmount = items.length > 0 && isPartial && (!amountReceivedTouched || cashAmount <= 0);
  const updateAmountReceived = (value) => {
    setAmountReceived(value.replace(/[^0-9]/g, ""));
    setAmountReceivedTouched(true);
  };
  const nonCashMethods = configuredMethods.filter(
    (method) => method.active && method.id !== "cash" && method.type !== "cod",
  );
  const quickMethods = nonCashMethods.slice(0, 2);
  const otherMethods = nonCashMethods.slice(2);
  const savePaymentMethod = async () => {
    const name = newPaymentMethod.trim();
    if (!name) return;
    const next = [
      ...configuredMethods,
      {
        id: `custom-${Date.now()}`,
        name,
        type: "normal",
        active: true,
        sortOrder: configuredMethods.length + 1,
      },
    ];
    try {
      const result = await api.shop.updateSettings({ paymentMethods: next });
      setConfiguredMethods(result.settings.paymentMethods || next);
      setNewPaymentMethod("");
      setPaymentMethodDialogOpen(false);
    } catch {
      /* Existing payment controls remain usable if saving fails. */
    }
  };
  const paymentName =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "other"
        ? otherPayment === "partial"
          ? "Cash"
          : "Unpaid"
        : configuredMethods.find((method) => method.id === paymentMethod)
            ?.name || paymentMethod;
  const createOrder = async () => {
    if (creatingOrder) return;
    if (insufficientAmount) { setOrderError("Amount received must be at least the total amount."); return; }
    if (invalidPartialAmount) { setOrderError("Enter a partial payment amount greater than zero."); return; }
    if (!items.length) {
      setOrderError("Add at least one product before creating the order.");
      return;
    }
    if (
      paymentMethod === "other" &&
      ["unpaid", "partial"].includes(otherPayment) &&
      !buyerName.trim()
    ) {
      setOrderError("Buyer name is required for unpaid and partial orders.");
      return;
    }
    setCreatingOrder(true);
    setOrderError("");
    try {
      const amountReceived =
        paymentMethod === "other" && otherPayment === "unpaid"
          ? 0
          : paymentMethod === "cash" ||
              (paymentMethod === "other" && otherPayment === "partial")
            ? paymentMethod === "cash" && !amountReceivedTouched
              ? totals.total
              : cashAmount
            : totals.total;
      // Cash received can exceed the total; only the order total is a payment.
      const initialPaymentAmount = Math.min(amountReceived, totals.total);
      const result = await api.orders.create({
        fulfillmentStatus: "reserved",
        ...(initialPaymentAmount > 0 ? {
          initialPayment: {
            method: paymentName,
            amount: initialPaymentAmount,
            note: note.trim() || undefined,
          },
        } : {}),
        ...(buyerName.trim() ? { customer: { name: buyerName.trim() } } : {}),
        note: note.trim() || undefined,
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      });
      const order = result.order;
      const completed = await api.orders.updateStatus(order.id, { fulfillmentStatus: "completed" });
      window.dispatchEvent(new Event("inventory-updated"));
      // The completed order response is authoritative for this checkout. Keep
      // its success UI immediate while dependent lists refresh in the background.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders(shop?.id) }),
        queryClient.invalidateQueries({
          queryKey: ["shops", shop?.id, "products"],
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.movements(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shop?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reports(shop?.id, "products") }),
      ]);
      setCreatedOrder(completed.order || completed);
      pricingRevisionRef.current.clear();
      pendingQuantityRef.current.clear();
      commitItems([]);
      setProductSearch("");
      setBuyerName("");
      setNote("");
      setAmountReceived("0");
      setAmountReceivedTouched(false);
      setPaymentMethod("cash");
      setOtherPayment("unpaid");
      setOtherAnchor(null);
    } catch (error) {
      setOrderError(error.message || "Unable to create order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const priceCartItem = useCallback(async (product, quantity) => {
    const resolved = await api.pricing.resolve({ productId: product.id, quantity });
    return toPricedCartItem(product, quantity, resolved.pricing);
  }, [api]);
  const setQuantity = useCallback((id, quantity) => {
    const item = itemsRef.current.find((current) => current.id === id);
    if (!item) return;
    if (!Number.isInteger(quantity)) return;

    if (quantity <= 0) {
      const nextItems = itemsRef.current.filter((entry) => entry.id !== id);
      nextPricingRevision(id);
      pendingQuantityRef.current.delete(id);
      commitItems(nextItems);
      return;
    }
    if (quantity > item.stock) return;

    const nextItems = itemsRef.current.map((entry) =>
      entry.id === id ? { ...entry, quantity } : entry,
    );
    const revision = nextPricingRevision(id);
    pendingQuantityRef.current.delete(id);
    commitItems(nextItems);
    void priceCartItem(item, quantity)
      .then((priced) => {
        // A delayed pricing response must not overwrite a later hold-to-repeat change.
        if (
          pricingRevisionRef.current.get(id) !== revision ||
          itemsRef.current.find((entry) => entry.id === id)?.quantity !== quantity
        )
          return;
        const pricedItems = itemsRef.current.map((entry) =>
          entry.id === id ? priced : entry,
        );
        commitItems(pricedItems);
      })
      .catch((error) =>
        setOrderError(error.message || "Promotion price could not be refreshed."),
      );
  }, [commitItems, nextPricingRevision, priceCartItem]);
  const changeQuantity = useCallback((id, change) => {
    const item = itemsRef.current.find((current) => current.id === id);
    if (item) setQuantity(id, item.quantity + change);
  }, [setQuantity]);

  const selectOtherPayment = (value) => {
    setPaymentMethod("other");
    setOtherPayment(value);
    setOtherAnchor(null);
  };

  const addProductFromPicker = async (product, initialPricing, quantityOverride) => {
    if (product.stock <= 0) return;
    const existing = itemsRef.current.find((item) => item.id === product.id);
    const requestedQuantity = quantityOverride ?? ((pendingQuantityRef.current.get(product.id) ?? existing?.quantity ?? 0) + 1);
    const quantity = Math.min(product.stock, requestedQuantity);
    const revision = nextPricingRevision(product.id);
    try {
      if (!existing && quantity === 1 && initialPricing) {
        pendingQuantityRef.current.delete(product.id);
        commitItems([...itemsRef.current, toPricedCartItem(product, quantity, initialPricing)]);
        setOrderError("");
        return;
      }
      pendingQuantityRef.current.set(product.id, quantity);
      const priced = await priceCartItem(product, quantity);
      if (pricingRevisionRef.current.get(product.id) !== revision) return;
      const current = itemsRef.current;
      const currentItem = current.find((item) => item.id === product.id);
      if (currentItem && currentItem.quantity !== quantity) return;
      pendingQuantityRef.current.delete(product.id);
      commitItems(currentItem ? current.map((item) => item.id === product.id ? priced : item) : [...current, priced]);
      setOrderError("");
    } catch (error) {
      if (pricingRevisionRef.current.get(product.id) === revision) {
        pendingQuantityRef.current.delete(product.id);
        setOrderError(error.message || "Promotion price could not be loaded.");
      }
    }
    setProductPickerOpen(false);
    setProductSearch("");
  };
  const matchesProduct = (product, value) => {
    const query = value.trim().toLowerCase();
    return (
      !query ||
      [
        product.name,
        product.sku,
        product.description,
        ...(product.barcodes || []).map((barcode) => barcode.value),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  };
  const visibleCatalog = useMemo(
    () => catalog.filter((product) => matchesProduct(product, productSearch)),
    [catalog, productSearch],
  );
  const handleBarcodeScan = async (value) => {
    setScannerOpen(false);
    try {
      const result = await api.pricing.barcodeLookup(value);
      if (result.known && result.product?.isActive !== false) {
        const product = catalog.find(
          (item) => item.id === result.product.id,
        ) || {
          ...result.product,
          price: Number(
            result.pricing?.finalUnitPrice || result.product.price || 0,
          ),
          stock: Number(result.product.currentStock || 0),
          color: "#1976d2",
          icon: <Inventory2RoundedIcon />,
          promotion: { type: "regular", text: "Regular price" },
        };
        addProductFromPicker(product, result.pricing);
        return;
      }
    } catch {
      /* Manual filtering remains available below. */
    }
    setProductSearch(value);
    setProductPickerOpen(true);
  };

  if (!isMobile)
    return (
      <DesktopCreateOrder
        items={items}
        catalog={catalog}
        catalogError={catalogError}
        addProduct={addProductFromPicker}
        totals={totals}
        changeQuantity={changeQuantity}
        setQuantity={setQuantity}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        amountReceived={amountReceived}
        setAmountReceived={updateAmountReceived}
        buyerName={buyerName}
        setBuyerName={setBuyerName}
        note={note}
        setNote={setNote}
        productSearch={productSearch}
        setProductSearch={setProductSearch}
        navigate={navigate}
        createOrder={createOrder}
        creatingOrder={creatingOrder}
        insufficientAmount={insufficientAmount}
        invalidPartialAmount={invalidPartialAmount}
        cashChange={amountReceivedTouched ? cashAmount - totals.total : 0}
        createdOrder={createdOrder}
        orderError={orderError}
        quickMethods={quickMethods}
        otherMethods={otherMethods}
        otherAnchor={otherAnchor}
        setOtherAnchor={setOtherAnchor}
        otherPayment={otherPayment}
        selectOtherPayment={selectOtherPayment}
        setPaymentMethodDialogOpen={setPaymentMethodDialogOpen}
        paymentMethodDialogOpen={paymentMethodDialogOpen}
        newPaymentMethod={newPaymentMethod}
        setNewPaymentMethod={setNewPaymentMethod}
        savePaymentMethod={savePaymentMethod}
      />
    );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", pb: 12 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#1976d2" }}>
        <Toolbar
          sx={{
            minHeight: 64,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          <IconButton
            aria-label="Back to orders"
            onClick={() => navigate("/sale")}
            sx={{ justifySelf: "start", color: "#fff" }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>
            Create Order
          </Typography>
          <IconButton
            aria-label="Scan barcode"
            onClick={() => setScannerOpen(true)}
            sx={{ justifySelf: "end", color: "#fff" }}
          >
            <QrCodeScannerRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 2, py: 2 }}>
        <Button
          fullWidth
          startIcon={<AddRoundedIcon />}
          onClick={() => setProductPickerOpen(true)}
          sx={{
            minHeight: 58,
            bgcolor: "#fff",
            borderRadius: 2.5,
            color: "#1976d2",
            boxShadow: "0 2px 7px rgba(15,23,42,0.14)",
            fontWeight: 600,
            fontSize: 16,
            textTransform: "none",
          }}
        >
          Add Product
        </Button>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              onQuantityChange={changeQuantity}
              onQuantitySet={setQuantity}
            />
          ))}
        </Stack>

        <Card
          sx={{
            mt: 2,
            borderRadius: 2.5,
            boxShadow: "0 2px 8px rgba(15,23,42,0.14)",
          }}
        >
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Stack spacing={1.1}>
              <SummaryRow
                label="Total quantity"
                value={`${totals.quantity} pcs`}
              />
              <SummaryRow
                label="Total"
                value={formatMoney(totals.itemsTotal)}
              />
              <SummaryRow
                label="Discount"
                value={formatMoney(totals.discount)}
                valueColor="#278a45"
              />
              <Box sx={{ borderTop: "1px solid #cbd5e1", pt: 1.25, mt: 0.4 }}>
                <SummaryRow
                  label="Total"
                  value={formatMoney(totals.total)}
                  strong
                  valueColor="#1976d2"
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card
          sx={{
            mt: 2,
            borderRadius: 2.5,
            boxShadow: "0 2px 8px rgba(15,23,42,0.14)",
          }}
        >
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography fontWeight={700}>Payment Method</Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(3, 1 + quickMethods.length + (quickMethods.length < 2 ? 1 : 0) + 1)}, minmax(0, 1fr))`,
                gap: 0.8,
                mt: 1.25,
              }}
            >
              <PaymentButton
                label="Cash"
                icon={<CreditCardRoundedIcon />}
                active={paymentMethod === "cash"}
                onClick={() => setPaymentMethod("cash")}
              />
              {quickMethods.map((method) => (
                <PaymentButton
                  key={method.id}
                  label={method.name}
                  active={paymentMethod === method.id}
                  onClick={() => setPaymentMethod(method.id)}
                />
              ))}
              {quickMethods.length < 2 && (
                <PaymentButton
                  label="Add Method"
                  icon={<AddRoundedIcon />}
                  active={false}
                  onClick={() => setPaymentMethodDialogOpen(true)}
                />
              )}
              <PaymentButton
                label="Other"
                icon={<MoreHorizRoundedIcon />}
                active={paymentMethod === "other"}
                onClick={(event) => setOtherAnchor(event.currentTarget)}
              />
            </Box>

            <Menu
              anchorEl={otherAnchor}
              open={Boolean(otherAnchor)}
              onClose={() => setOtherAnchor(null)}
            >
              {otherMethods.map((method) => (
                <MenuItem
                  key={method.id}
                  selected={paymentMethod === method.id}
                  onClick={() => {
                    setPaymentMethod(method.id);
                    setOtherAnchor(null);
                  }}
                >
                  {method.name}
                </MenuItem>
              ))}
              {otherMethods.length > 0 && <Divider />}
              <MenuItem
                selected={otherPayment === "unpaid"}
                onClick={() => selectOtherPayment("unpaid")}
              >
                Unpaid
              </MenuItem>
              <MenuItem
                selected={otherPayment === "partial"}
                onClick={() => selectOtherPayment("partial")}
              >
                Partial
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  setOtherAnchor(null);
                  setPaymentMethodDialogOpen(true);
                }}
              >
                <AddRoundedIcon fontSize="small" sx={{ mr: 1 }} />
                Add Method
              </MenuItem>
            </Menu>

            {paymentMethod === "other" && (
              <Chip
                label={
                  otherPayment === "partial" ? "Partial payment" : "Unpaid"
                }
                size="small"
                sx={{
                  mt: 1.25,
                  borderRadius: 1,
                  bgcolor: "#fff7ed",
                  color: "#c2410c",
                  fontWeight: 500,
                }}
              />
            )}

            {paymentMethod === "other" && ["unpaid", "partial"].includes(otherPayment) && (
              <>
                <Typography variant="body2" sx={{ mt: 1.75, mb: 0.7 }}>
                  Buyer name
                </Typography>
                <TextField
                  fullWidth
                  required
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  placeholder="Enter buyer name"
                />
              </>
            )}

            {showsAmountReceived && (
              <>
                <Typography variant="body2" sx={{ mt: 1.75, mb: 0.7 }}>
                  Amount received
                </Typography>
                <TextField
                  fullWidth
                  value={amountReceived}
                  onChange={(event) => updateAmountReceived(event.target.value)}
                  inputMode="numeric"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">ကျပ်</InputAdornment>
                    ),
                  }}
                />
              </>
            )}

            {paymentMethod === "cash" && (
              <>
                <Typography variant="body2" sx={{ mt: 1.5, mb: 0.7 }}>
                  Change
                </Typography>
                <TextField
                  fullWidth
                  value={formatMoney(amountReceivedTouched ? cashAmount - totals.total : 0)}
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#f1f5f9" } }}
                />
              </>
            )}

            {isPartial && (
              <>
                <Typography variant="body2" sx={{ mt: 1.5, mb: 0.7 }}>
                  Remaining balance
                </Typography>
                <TextField
                  fullWidth
                  value={formatMoney(Math.max(0, totals.total - cashAmount))}
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#f1f5f9" } }}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card
          sx={{
            mt: 2,
            borderRadius: 2.5,
            boxShadow: "0 2px 8px rgba(15,23,42,0.14)",
          }}
        >
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <TextField
              fullWidth
              label="Note (optional)"
              placeholder="Add a note..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              multiline
              minRows={2}
            />
          </CardContent>
        </Card>
        {orderError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {orderError}
          </Alert>
        )}
        {insufficientAmount && <Alert severity="warning" sx={{ mt: 2 }}>Amount received is lower than the total amount.</Alert>}
        {invalidPartialAmount && <Alert severity="warning" sx={{ mt: 2 }}>Enter a partial payment amount greater than zero.</Alert>}
        {createdOrder && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Order {createdOrder.orderNumber || createdOrder.id} created
            successfully.
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          startIcon={<CheckRoundedIcon />}
          disabled={creatingOrder || insufficientAmount || invalidPartialAmount}
          onClick={() => void createOrder()}
          sx={{
            mt: 2,
            minHeight: 54,
            borderRadius: 2,
            bgcolor: "#1976d2",
            fontSize: 17,
            fontWeight: 600,
            textTransform: "none",
            "&:hover": { bgcolor: "#1565c0" },
          }}
        >
          {creatingOrder ? "Creating Order…" : "Create Order"}
        </Button>
      </Box>

      <Drawer
        anchor="bottom"
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              left: 0,
              right: 0,
              width: "100%",
              height: "78vh",
              maxHeight: "78vh",
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              overflow: "hidden",
              bgcolor: "background.paper",
            },
          },
        }}
        sx={{
          "& .MuiDrawer-paper": {
            left: 0,
            right: 0,
            width: "100%",
            height: "78vh",
            maxHeight: "78vh",
            borderTopLeftRadius: "24px",
            borderTopRightRadius: "24px",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
          "& .MuiBackdrop-root": { bgcolor: "rgba(15, 23, 42, 0.62)" },
        }}
      >
        <Box sx={{ width: "100%", pt: 3.75 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              px: 3,
            }}
          >
            <Typography
              sx={{
                color: "#111827",
                fontSize: 29,
                fontWeight: 700,
                lineHeight: 1.15,
              }}
            >
              Add Products
            </Typography>
            <IconButton
              aria-label="Scan product barcode"
              onClick={() => setScannerOpen(true)}
              sx={{ p: 0.5, color: "#111827" }}
            >
              <QrCodeScannerRoundedIcon sx={{ fontSize: 30 }} />
            </IconButton>
          </Box>

          <TextField
            fullWidth
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Search products..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            }}
            sx={{
              mt: 4.25,
              mx: 3,
              width: "calc(100% - 48px)",
              "& .MuiOutlinedInput-root": {
                minHeight: 56,
                borderRadius: 2.25,
                bgcolor: "#f5f5f5",
                fontSize: 18,
                px: 1.5,
                "& fieldset": { border: 0 },
              },
              "& .MuiInputAdornment-root": { mr: 1.5 },
              "& .MuiSvgIcon-root": { fontSize: 31, color: "#0f172a" },
            }}
          />

          {catalogError && (
            <Typography color="error" sx={{ px: 3, mt: 2 }}>
              {catalogError}
            </Typography>
          )}
          {visibleCatalog.map((item) => (
            <Box key={item.id} sx={{ px: 3 }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2.25}
                sx={{ mt: 3.25, minHeight: 76 }}
              >
                <Box
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 64,
                    height: 64,
                    color: item.color,
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography
                    sx={{
                      color: "#111827",
                      fontSize: 20,
                      fontWeight: 500,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.name}
                  </Typography>
                  <Typography sx={{ mt: 0.75, color: "#111827", fontSize: 17 }}>
                    {formatMoney(item.price)} · Stock: {item.stock}
                  </Typography>
                </Box>
                <IconButton
                  aria-label={`Add ${item.name}`}
                  disabled={item.stock <= 0}
                  onClick={() => addProductFromPicker(item)}
                  sx={{
                    width: 42,
                    height: 42,
                    flexShrink: 0,
                    bgcolor: "#1976d2",
                    color: "#fff",
                    "&:hover": { bgcolor: "#1565c0" },
                    "&.Mui-disabled": { bgcolor: "#cbd5e1" },
                  }}
                >
                  <AddRoundedIcon sx={{ fontSize: 27 }} />
                </IconButton>
              </Stack>
            </Box>
          ))}
        </Box>
      </Drawer>
      <Fab
        aria-label="Scan barcode"
        onClick={() => setScannerOpen(true)}
        sx={{
          position: "fixed",
          zIndex: 21,
          right: 20,
          bottom: "calc(24px + env(safe-area-inset-bottom))",
          width: 56,
          height: 56,
          bgcolor: "primary.main",
          color: "common.white",
          boxShadow: 4,
          "&:hover": { bgcolor: "primary.dark" },
        }}
      >
        <QrCodeScannerRoundedIcon />
      </Fab>
      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeScan}
      />
      <Dialog
        open={paymentMethodDialogOpen}
        onClose={() => setPaymentMethodDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Add Payment Method</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Payment method name"
            value={newPaymentMethod}
            onChange={(event) => setNewPaymentMethod(event.target.value)}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentMethodDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={savePaymentMethod}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function DesktopCreateOrder({
  items,
  catalog,
  catalogError,
  addProduct,
  totals,
  changeQuantity,
  setQuantity,
  paymentMethod,
  setPaymentMethod,
  amountReceived,
  setAmountReceived,
  buyerName,
  setBuyerName,
  note,
  setNote,
  productSearch,
  setProductSearch,
  navigate,
  createOrder,
  creatingOrder,
  insufficientAmount,
  invalidPartialAmount,
  cashChange,
  createdOrder,
  orderError,
  quickMethods,
  otherMethods,
  otherAnchor,
  setOtherAnchor,
  otherPayment,
  selectOtherPayment,
  setPaymentMethodDialogOpen,
  paymentMethodDialogOpen,
  newPaymentMethod,
  setNewPaymentMethod,
  savePaymentMethod,
}) {
  const received = Number(amountReceived.replace(/,/g, "")) || 0;
  const change = cashChange;
  const isPartialPayment = paymentMethod === "other" && otherPayment === "partial";
  const query = productSearch.trim().toLowerCase();
  const visibleCatalog = catalog.filter(
    (product) =>
      !query ||
      [
        product.name,
        product.sku,
        product.description,
        ...(product.barcodes || []).map((barcode) => barcode.value),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
  );
  const visibleItems = query
    ? visibleCatalog.map((product) => ({
        ...product,
        quantity: items.find((item) => item.id === product.id)?.quantity || 0,
      }))
    : items;
  const updateDesktopQuantity = (id, delta) => {
    const existing = items.find((item) => item.id === id);
    if (!existing && delta > 0) {
      const product = catalog.find((item) => item.id === id);
      if (product) addProduct(product);
      return;
    }
    if (existing) changeQuantity(id, delta);
  };
  const setDesktopQuantity = (id, quantity) => {
    if (items.some((item) => item.id === id)) {
      setQuantity(id, quantity);
      return;
    }
    const product = catalog.find((item) => item.id === id);
    if (product && quantity > 0 && quantity <= product.stock) addProduct(product, undefined, quantity);
  };
  const panelSx = {
    borderRadius: 2.5,
    bgcolor: "background.paper",
    border: "1px solid",
    borderColor: "divider",
    boxShadow: "0 3px 12px rgba(15,23,42,0.07)",
  };
  return (
    <Box
      sx={{
        width: "100%",
        px: 3,
        py: 2.5,
        bgcolor: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(350px, 0.75fr)",
          gap: 2,
        }}
      >
        <Box>
          <TextField
            fullWidth
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Search by product code, name or barcode..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            }}
            sx={{
              mb: 1.5,
              "& .MuiOutlinedInput-root": {
                minHeight: 52,
                borderRadius: 2,
                bgcolor: "background.paper",
              },
            }}
          />
          {visibleItems.length > 0 && <Card sx={panelSx}>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack spacing={1}>
                {catalogError
                  ? visibleCatalog.map((item) => (
                      <Button
                        key={item.id}
                        disabled={item.stock <= 0}
                        onClick={() => addProduct(item)}
                        sx={{
                          justifyContent: "space-between",
                          textTransform: "none",
                          color: "text.primary",
                          py: 1.25,
                        }}
                      >
                        <Box textAlign="left">
                          <Typography fontWeight={700}>{item.name}</Typography>
                          <Typography color="text.secondary" variant="body2">
                            {item.sku || item.barcodes?.[0]?.value || "No code"}{" "}
                            · Stock: {item.stock}
                          </Typography>
                        </Box>
                        <Typography fontWeight={700}>
                          {formatMoney(item.price)}
                        </Typography>
                      </Button>
                    ))
                  : visibleItems.map((item) => (
                      <DesktopOrderItem
                        key={item.id}
                        item={item}
                        onQuantityChange={updateDesktopQuantity}
                        onQuantitySet={setDesktopQuantity}
                      />
                    ))}
              </Stack>
            </CardContent>
          </Card>}
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, alignContent: "start" }}>
          <Card sx={panelSx}>
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>
                Order Summary
              </Typography>
              <Stack spacing={1.15}>
                <DesktopTotal
                  label="Total quantity"
                  value={`${totals.quantity} pcs`}
                />
                <Divider />
                <DesktopTotal
                  label="Total"
                  value={formatMoney(totals.itemsTotal)}
                />
                <DesktopTotal
                  label="Discount"
                  value={totals.discount > 0 ? `-${formatMoney(totals.discount)}` : formatMoney(0)}
                  color="success.main"
                />
                <Divider />
                <DesktopTotal
                  label="Grand Total"
                  value={formatMoney(totals.total)}
                  strong
                />
              </Stack>
            </CardContent>
          </Card>
          <Card sx={panelSx}>
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>
                Payment Method
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.max(3, 1 + quickMethods.length + (quickMethods.length < 2 ? 1 : 0) + 1)}, minmax(0, 1fr))`,
                  gap: 1,
                  mb: 2.25,
                }}
              >
                <PaymentButton label="Cash" icon={<CreditCardRoundedIcon />} active={paymentMethod === "cash"} onClick={() => setPaymentMethod("cash")} />
                {quickMethods.map((method) => <PaymentButton key={method.id} label={method.name} active={paymentMethod === method.id} onClick={() => setPaymentMethod(method.id)} />)}
                {quickMethods.length < 2 && <PaymentButton label="Add Method" icon={<AddRoundedIcon />} active={false} onClick={() => setPaymentMethodDialogOpen(true)} />}
                <PaymentButton label="Other" icon={<MoreHorizRoundedIcon />} active={paymentMethod === "other"} onClick={(event) => setOtherAnchor(event.currentTarget)} />
              </Box>
              <Menu anchorEl={otherAnchor} open={Boolean(otherAnchor)} onClose={() => setOtherAnchor(null)}>
                {otherMethods.map((method) => <MenuItem key={method.id} selected={paymentMethod === method.id} onClick={() => { setPaymentMethod(method.id); setOtherAnchor(null); }}>{method.name}</MenuItem>)}
                {otherMethods.length > 0 && <Divider />}
                <MenuItem selected={otherPayment === "unpaid"} onClick={() => selectOtherPayment("unpaid")}>Unpaid</MenuItem>
                <MenuItem selected={otherPayment === "partial"} onClick={() => selectOtherPayment("partial")}>Partial</MenuItem>
                <Divider />
                <MenuItem onClick={() => { setOtherAnchor(null); setPaymentMethodDialogOpen(true); }}><AddRoundedIcon fontSize="small" sx={{ mr: 1 }} />Add Method</MenuItem>
              </Menu>
              {(paymentMethod === "cash" || isPartialPayment) && (
                <>
                  <Typography
                    color="text.secondary"
                    sx={{ fontSize: 13, mb: 0.75 }}
                  >
                    Amount received
                  </Typography>
                  <TextField
                    fullWidth
                    value={amountReceived}
                    onChange={(event) => setAmountReceived(event.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                  />
                  <Box sx={{ mt: 1.75 }}>
                    <DesktopTotal
                      label={isPartialPayment ? "Remaining balance" : "Change"}
                      value={formatMoney(isPartialPayment ? Math.max(0, totals.total - received) : change)}
                      color="success.main"
                      strong
                    />
                  </Box>
                </>
              )}
              {paymentMethod === "other" && ["unpaid", "partial"].includes(otherPayment) && <TextField
                fullWidth
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                placeholder="Buyer name (for unpaid or partial orders)"
                sx={{
                  mt: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: 1.5 },
                }}
              />}
              <TextField
                fullWidth
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note..."
                multiline
                minRows={3}
                sx={{
                  mt: 1.5,
                  "& .MuiOutlinedInput-root": { borderRadius: 1.5 },
                }}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1.25,
                  mt: 2.25,
                }}
              >
                <Button
                  variant="contained"
                  startIcon={<CheckRoundedIcon />}
                  disabled={creatingOrder || insufficientAmount || invalidPartialAmount}
                  onClick={() => void createOrder()}
                  sx={{ minHeight: 44, textTransform: "none", fontWeight: 700 }}
                >
                  {creatingOrder ? "Creating Order…" : "Create Order"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => navigate("/sale")}
                  sx={{ minHeight: 44, textTransform: "none", fontWeight: 700 }}
                >
                  Cancel Order
                </Button>
              </Box>
              {orderError && <Alert severity="error" sx={{ mt: 1.25 }}>{orderError}</Alert>}
              {insufficientAmount && <Alert severity="warning" sx={{ mt: 1.25 }}>Amount received is lower than the total amount.</Alert>}
              {invalidPartialAmount && <Alert severity="warning" sx={{ mt: 1.25 }}>Enter a partial payment amount greater than zero.</Alert>}
              {createdOrder && <Alert severity="success" sx={{ mt: 1.25 }}>Order {createdOrder.orderNumber || createdOrder.id} created successfully.</Alert>}
            </CardContent>
          </Card>
        </Box>
      </Box>
      <Dialog open={paymentMethodDialogOpen} onClose={() => setPaymentMethodDialogOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Add Payment Method</DialogTitle><DialogContent><TextField autoFocus fullWidth label="Payment method name" value={newPaymentMethod} onChange={(event) => setNewPaymentMethod(event.target.value)} sx={{ mt: .5 }} /></DialogContent><DialogActions><Button onClick={() => setPaymentMethodDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={savePaymentMethod}>Save</Button></DialogActions></Dialog>
    </Box>
  );
}

function DesktopOrderItem({ item, onQuantityChange, onQuantitySet }) {
  const subtotal = item.price * item.quantity;
  const promotionText =
    item.promotion.type === "discount"
      ? `${item.promotion.text} · Discount ${formatMoney(item.promotion.value)}`
      : item.promotion.text;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "84px minmax(150px, 1fr) 230px 154px",
        gap: 1.5,
        alignItems: "center",
        minHeight: 136,
        p: 1.75,
        border: "1px solid",
        borderColor: "#e5e7eb",
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          width: 78,
          height: 92,
          display: "grid",
          placeItems: "center",
          borderRadius: 1.5,
          bgcolor: "#edf7fc",
          color: item.color,
        }}
      >
        {item.icon}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 17, fontWeight: 700 }}>
          {item.name}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.8 }}>
          {item.description || "No description"}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.55 }}>
          Stock: {item.stock} pcs
        </Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 92px 1fr",
          height: 86,
          border: "1px solid",
          borderColor: "#b9d7ff",
          borderRadius: 1.5,
          overflow: "hidden",
        }}
      >
        <QuantityButton
          aria-label={`Reduce ${item.name} quantity`}
          item={item}
          change={-1}
          onQuantityChange={onQuantityChange}
          sx={{
            borderRadius: 0,
            color: "primary.main",
            borderRight: "1px solid",
            borderColor: "#b9d7ff",
          }}
        >
          <RemoveRoundedIcon sx={{ fontSize: 28 }} />
        </QuantityButton>
        <QuantityInput item={item} onQuantitySet={onQuantitySet} sx={{ fontSize: 26, fontWeight: 700 }} />
        <QuantityButton
          aria-label={`Increase ${item.name} quantity`}
          item={item}
          change={1}
          onQuantityChange={onQuantityChange}
          sx={{
            borderRadius: 0,
            color: "primary.main",
            borderLeft: "1px solid",
            borderColor: "#b9d7ff",
          }}
        >
          <AddRoundedIcon sx={{ fontSize: 30 }} />
        </QuantityButton>
      </Box>
      <Box sx={{ textAlign: "right" }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
          {formatMoney(item.price)}
        </Typography>
        <Stack
          direction="row"
          justifyContent="flex-end"
          alignItems="flex-start"
          spacing={0.5}
          sx={{ color: "success.main", mt: 1.5 }}
        >
          <SellOutlinedIcon sx={{ fontSize: 17 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, textAlign: "right", overflowWrap: "anywhere" }}>
            {promotionText}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
          {formatMoney(subtotal)}
        </Typography>
      </Box>
    </Box>
  );
}

function DesktopTotal({
  label,
  value,
  color = "text.primary",
  strong = false,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography
        color={color}
        sx={{ fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 600 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
  valueColor = "text.primary",
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 2,
        width: "100%",
      }}
    >
      <Typography fontWeight={strong ? 700 : 400}>{label}</Typography>
      <Typography
        color={valueColor}
        fontWeight={strong ? 700 : 500}
        sx={{ textAlign: "right" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function PaymentButton({ label, icon, active, onClick }) {
  return (
    <Button
      onClick={onClick}
      variant="outlined"
      sx={{
        minWidth: 0,
        minHeight: 52,
        borderRadius: 1.5,
        borderColor: active ? "#1976d2" : "#d1d5db",
        bgcolor: active ? "#eaf3ff" : "#fff",
        color: active ? "#1976d2" : "#475569",
        textTransform: "none",
        fontSize: 11,
        px: 0.4,
        "&:hover": { borderColor: "#1976d2", bgcolor: "#f8fbff" },
      }}
    >
      <Stack direction="column" alignItems="center" spacing={0.15}>
        {icon}
        <span>{label}</span>
      </Stack>
    </Button>
  );
}
