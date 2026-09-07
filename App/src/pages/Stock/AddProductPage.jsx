import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CurrencyExchangeRoundedIcon from "@mui/icons-material/CurrencyExchangeRounded";
import DocumentScannerRoundedIcon from "@mui/icons-material/DocumentScannerRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import NumbersRoundedIcon from "@mui/icons-material/NumbersRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import StraightenRoundedIcon from "@mui/icons-material/StraightenRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import BarcodeManagerDialog from "../../components/Barcode/BarcodeManagerDialog";
import BarcodeScannerDialog from "../../components/BarcodeScanner/BarcodeScannerDialog";
import { usePosApi } from "../../hooks/useApiResource";
import { normalizeBarcode } from "../../lib/barcodeScanner";
import { queryKeys } from "../../lib/queryKeys";
import { useAuth } from "../../context/AuthContext";

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  shortCode: "",
  categoryId: "",
  cost: "0",
  price: "0",
  stock: "0",
  unitId: "",
  minimum: "10",
};
const internalCode = /^[A-Z]{2}[0-9]{4}$/;
function inferSymbology(value) {
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{12}$/.test(value)) return "UPCA";
  if (/^\d{8}$/.test(value)) return "EAN8";
  return "CODE128";
}

export default function AddProductPage() {
  // Phones keep the existing full-page workflow. Tablets and larger screens
  // use the same dialog workflow, with an internally responsive form.
  const isMobile = useMediaQuery("(max-width:600px)");
  const navigate = useNavigate();
  const api = usePosApi();
  const { shop } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("edit");
  const isEditMode = Boolean(productId);
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryBatches, setInventoryBatches] = useState([]);
  const [initialStock, setInitialStock] = useState(0);
  const [hasSaleHistory, setHasSaleHistory] = useState(false);
  const [activeBarcode, setActiveBarcode] = useState(null);
  const [activeShortCode, setActiveShortCode] = useState(null);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeReservationId, setBarcodeReservationId] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeManagerOpen, setBarcodeManagerOpen] = useState(false);
  const [shortCodeManagerOpen, setShortCodeManagerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.categories.list(),
      api.units.list(),
      // A new product has no existing batches, so avoid an all-inventory read
      // until edit mode actually needs the product's current stock history.
      productId ? api.inventory.list() : Promise.resolve({ inventory: [] }),
      productId ? api.products.get(productId) : Promise.resolve(null),
    ])
      .then(([categoryResult, unitResult, inventoryResult, productResult]) => {
        if (!alive) return;
        const nextUnits = unitResult.units || [];
        setCategories(categoryResult.categories || []);
        setUnits(nextUnits);
        if (productResult?.product) {
          const product = productResult.product;
          const baseUnit =
            product.units?.find((unit) => unit.isBase) || product.units?.[0];
          const shortCodeRecord = product.barcodes?.find(
            (item) =>
              item.status === "ACTIVE" &&
              !item.isPrimary &&
              /^[A-Z]{2}[0-9]{4}$/.test(item.value),
          );
          const shortCode = shortCodeRecord?.value || "";
          const batches = (inventoryResult.inventory || []).filter(
            (batch) => batch.productId === product.id,
          );
          const stock = batches.reduce(
            (total, batch) => total + Number(batch.quantity || 0),
            0,
          );
          setInventoryBatches(batches);
          setInitialStock(stock);
          setHasSaleHistory(Boolean(productResult.hasSaleHistory));
          setForm({
            name: product.name || "",
            description: product.description || "",
            sku: product.sku || "",
            barcode: productResult.activeBarcode?.value || "",
            shortCode,
            categoryId: product.categoryId || "",
            cost: String(product.cost ?? 0),
            price: String(product.price ?? 0),
            stock: String(stock),
            unitId: baseUnit?.unitId || nextUnits[0]?.id || "",
            minimum: "10",
          });
          setActiveBarcode(productResult.activeBarcode || null);
          setActiveShortCode(shortCodeRecord || null);
        } else
          setForm((current) =>
            current.unitId
              ? current
              : { ...current, unitId: nextUnits[0]?.id || "" },
          );
      })
      .catch(
        (error) =>
          alive &&
          setMessage({
            severity: "error",
            text: error.message || "Unable to load product options.",
          }),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, productId]);

  const update = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "barcode") {
      setBarcodeDraft("");
      setBarcodeReservationId("");
    }
  };
  const selectedCategory = categories.find(
    (item) => item.id === form.categoryId,
  );
  const selectCategory = (category) => {
    setForm((current) => ({ ...current, categoryId: category.id }));
    setCategoryDialogOpen(false);
  };
  const createCategory = async (name) => {
    const categoryName = name.trim();
    if (!categoryName) throw new Error("Category name is required.");
    const result = await api.categories.create({ name: categoryName });
    const category = result.category;
    setCategories((current) => [...current, category].sort((left, right) => left.name.localeCompare(right.name)));
    selectCategory(category);
  };
  const handleDetected = useCallback(
    async (value) => {
      setScannerOpen(false);
      const normalized = normalizeBarcode(value);
      try {
        const result = await api.pricing.barcodeLookup(normalized);
        if (result.known) {
          setMessage({
            severity: "warning",
            text: `This barcode is already assigned to ${result.product?.name || "another product"}.`,
          });
          return;
        }
        setForm((current) => ({ ...current, barcode: normalized }));
        setBarcodeDraft("");
      } catch (error) {
        setForm((current) => ({ ...current, barcode: normalized }));
        setBarcodeDraft("");
        setMessage({
          severity: "warning",
          text: `Barcode could not be verified: ${error.message}`,
        });
      }
    },
    [api],
  );
  const useDraft = (draft) => {
    if (draft.type === "shortCode") {
      setBarcodeReservationId("");
      setBarcodeDraft("");
      setForm((current) => ({
        ...current,
        barcode: "",
        shortCode: draft.value,
      }));
      return;
    }
    setBarcodeReservationId(draft.id);
    setBarcodeDraft("");
    setForm((current) => ({ ...current, barcode: draft.value, shortCode: "" }));
  };
  const handleBarcodeChanged = (barcode) => {
    setActiveBarcode(barcode);
    setBarcodeDraft("");
    setForm((current) => ({ ...current, barcode: barcode?.value || "" }));
  };
  const handleShortCodeChanged = (barcode) => {
    setActiveShortCode(barcode);
    setForm((current) => ({ ...current, shortCode: barcode?.value || "" }));
  };

  const save = async () => {
    if (!form.name.trim())
      return setMessage({
        severity: "error",
        text: "Product name is required.",
      });
    if (!form.unitId)
      return setMessage({
        severity: "error",
        text: "Select a base unit before saving.",
      });
    if (
      ![form.cost, form.price, ...(isEditMode ? [] : [form.stock])].every(
        (value) => Number.isInteger(Number(value)) && Number(value) >= 0,
      )
    )
      return setMessage({
        severity: "error",
        text: "Prices and stock must be whole, non-negative values.",
      });
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        sku: form.sku.trim() || undefined,
        price: Number(form.price),
        cost: Number(form.cost),
        categoryId: form.categoryId || undefined,
        ...(isEditMode ? { stockQuantity: Number(form.stock) } : {}),
        minimumStock: Number(form.minimum || 0),
      };
      if (isEditMode) {
        const delta = Number(form.stock) - initialStock;
        if (delta !== 0 && hasSaleHistory) {
          throw new Error("Stock quantity cannot be edited after this product has sale history.");
        }
        await api.products.update(productId, payload);
        if (delta !== 0) {
          const batch = inventoryBatches[0];
          if (delta > 0 && batch)
            await api.inventory.adjust(batch.id, {
              action: "ADD",
              quantity: delta,
              reason: "Product edit stock quantity.",
            });
          else if (delta > 0)
            await api.inventory.create({
              productId,
              quantity: delta,
              unitCost: Number(form.cost),
              note: "Stock quantity set during product edit.",
            });
          else {
            let remaining = Math.abs(delta);
            for (const currentBatch of inventoryBatches) {
              if (remaining <= 0) break;
              const quantity = Math.min(remaining, Number(currentBatch.quantity || 0));
              if (quantity > 0) await api.inventory.adjust(currentBatch.id, { action: "SUB", quantity, reason: "Product edit stock quantity." });
              remaining -= quantity;
            }
            if (remaining > 0) throw new Error("Stock quantity cannot be negative.");
          }
        }
        setMessage({
          severity: "success",
          text: "Product updated successfully.",
        });
        await invalidateProductData(queryClient, shop?.id);
        window.setTimeout(() => navigate(`/stock/${productId}`), 800);
        return;
      }
      const barcodeValue = barcodeDraft || form.barcode.trim();
      const barcode =
        !barcodeReservationId && barcodeValue
          ? {
              value: barcodeValue,
              kind: internalCode.test(barcodeValue)
                ? "INTERNAL"
                : "MANUFACTURER",
              symbology: internalCode.test(barcodeValue)
                ? "CODE128"
                : inferSymbology(barcodeValue),
            }
          : undefined;
      const result = await api.products.create({
        ...payload,
        units: [
          {
            unitId: form.unitId,
            conversionFactor: 1,
            isBase: true,
            canSell: true,
            canPurchase: true,
          },
        ],
        ...(barcode ? { barcode } : {}),
        ...(barcodeReservationId ? { barcodeReservationId } : {}),
        ...(form.shortCode.trim()
          ? { shortCode: form.shortCode.trim().toUpperCase() }
          : {}),
      });
      if (Number(form.stock) > 0)
        await api.inventory.create({
          productId: result.product.id,
          quantity: Number(form.stock),
          unitCost: Number(form.cost),
          note: "Initial stock created with product.",
        });
      setMessage({
        severity: "success",
        text: barcode
          ? "Product and barcode saved successfully."
          : "Product saved successfully.",
      });
      await invalidateProductData(queryClient, shop?.id);
      window.setTimeout(() => navigate("/stock"), 900);
    } catch (error) {
      setMessage({
        severity: "error",
        text: error.message || "Unable to save product.",
      });
    } finally {
      setSaving(false);
    }
  };
  const props = {
    form,
    update,
    categories,
    units,
    selectedCategory,
    categoryDialogOpen,
    setCategoryDialogOpen,
    selectCategory,
    createCategory,
    navigate,
    isEditMode,
    scannerOpen,
    setScannerOpen,
    handleDetected,
    barcodeManagerOpen,
    setBarcodeManagerOpen,
    shortCodeManagerOpen,
    setShortCodeManagerOpen,
    activeBarcode,
    activeShortCode,
    useDraft,
    handleBarcodeChanged,
    handleShortCodeChanged,
    api,
    setMessage,
    save,
    saving,
    loading,
    hasSaleHistory,
  };
  if (!isMobile)
    return (
      <>
        <DesktopAddProduct {...props} />
        <Notice message={message} onClose={() => setMessage(null)} />
      </>
    );
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa", pb: "96px" }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#1976d2" }}>
        <Toolbar
          sx={{
            minHeight: 64,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          <IconButton
            onClick={() => navigate("/stock")}
            sx={{ color: "#fff", justifySelf: "start" }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>
            {isEditMode ? "Edit Product" : "Add Product"}
          </Typography>
          <Box />
        </Toolbar>
      </AppBar>
      <Box sx={{ px: 3, py: 2.25 }}>
        <ProductFields {...props} />
        <CategorySelector
          value={selectedCategory?.name}
          onClick={() => setCategoryDialogOpen(true)}
        />
        <PricingFields form={form} update={update} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Field
            label="Stock Quantity"
            value={form.stock}
            onChange={update("stock")}
            icon={<Inventory2RoundedIcon />}
            disabled={isEditMode && hasSaleHistory}
            helperText={isEditMode && hasSaleHistory ? "Stock quantity is locked because this product has sale history." : undefined}
          />
          <UnitField {...props} />
        </Box>
        <Field
          label="Minimum Stock Alert Level (Optional)"
          value={form.minimum}
          onChange={update("minimum")}
          icon={<WarningAmberRoundedIcon />}
        />
      </Box>
      <SharedDialogs {...props} />
      <Fab
        aria-label="Scan barcode"
        onClick={() => setScannerOpen(true)}
        sx={{
          position: "fixed",
          right: 24,
          bottom: 88,
          width: 58,
          height: 58,
          bgcolor: "primary.main",
          color: "common.white",
        }}
      >
        <QrCodeScannerRoundedIcon />
      </Fab>
      <Paper
        elevation={6}
        sx={{ position: "fixed", left: 0, right: 0, bottom: 0, px: 3, py: 2 }}
      >
        <Button
          fullWidth
          variant="contained"
          startIcon={<CheckRoundedIcon />}
          onClick={save}
          disabled={saving || loading}
          sx={{ minHeight: 56, textTransform: "none" }}
        >
          {saving ? "Saving…" : isEditMode ? "Save Changes" : "Save"}
        </Button>
      </Paper>
      <Notice message={message} onClose={() => setMessage(null)} />
    </Box>
  );
}

async function invalidateProductData(queryClient, shopId) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.products(shopId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory(shopId) }),
  ]);
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.movements(shopId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.pricing(shopId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
    queryClient.invalidateQueries({ queryKey: ["shops", shopId, "reports"] }),
  ]);
}

function ProductFields({
  form,
  update,
  setScannerOpen,
  setBarcodeManagerOpen,
  setShortCodeManagerOpen,
  isEditMode,
  activeBarcode,
  activeShortCode,
}) {
  return (
    <>
      <Field
        label="Product Name"
        placeholder="Enter product name"
        value={form.name}
        onChange={update("name")}
        icon={<ShoppingBagRoundedIcon />}
      />
      <Field
        label="Description (Optional)"
        placeholder="Enter product description"
        value={form.description}
        onChange={update("description")}
        icon={<DocumentScannerRoundedIcon />}
        multiline
        minRows={2}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Field
          label="SKU (Optional)"
        placeholder="Enter..."
        value={form.sku}
        onChange={update("sku")}
        icon={<NumbersRoundedIcon />}
        endIcon={<AutoAwesomeRoundedIcon />}
        />
        <Field
          label="Barcode (Optional)"
          labelAction={
            <Button
              size="small"
              variant="outlined"
              onClick={() => setBarcodeManagerOpen(true)}
              sx={{
                minHeight: 32,
                ml: 1.25,
                px: 1.35,
                borderRadius: 1.25,
                borderColor: "primary.main",
                color: "primary.main",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                textTransform: "none",
                "&:hover": { borderColor: "primary.dark", bgcolor: "#f4f8ff" },
              }}
            >
              {isEditMode && activeBarcode ? "Manage" : "Create"}
            </Button>
          }
          placeholder="Scan or enter barcode"
          value={form.barcode}
          onChange={update("barcode")}
          icon={<QrCode2RoundedIcon />}
          endIcon={
            <IconButton
              size="small"
              aria-label="Scan barcode"
              onClick={() => setScannerOpen(true)}
            >
              <QrCodeScannerRoundedIcon />
            </IconButton>
          }
        />
      </Box>
      {form.shortCode && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ mt: -1.1, mb: 1.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            Item code: <strong>{form.shortCode}</strong>
          </Typography>
          {isEditMode && activeShortCode && (
            <Button
              size="small"
              onClick={() => setShortCodeManagerOpen(true)}
              sx={{ textTransform: "none" }}
            >
              Manage
            </Button>
          )}
        </Stack>
      )}
    </>
  );
}
function PricingFields({ form, update }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
      <Field
        label="Cost Price"
        value={form.cost}
        onChange={update("cost")}
        icon={<CurrencyExchangeRoundedIcon />}
      />
      <Field
        label="Selling Price"
        value={form.price}
        onChange={update("price")}
        icon={<SellRoundedIcon />}
      />
    </Box>
  );
}
function UnitField({ form, update, units }) {
  return (
    <Field
      label="Unit"
      select
      value={form.unitId}
      onChange={update("unitId")}
      icon={<StraightenRoundedIcon />}
    >
      {units
        .filter((unit) => unit.isActive !== false)
        .map((unit) => (
          <MenuItem key={unit.id} value={unit.id}>
            {unit.name}
          </MenuItem>
        ))}
    </Field>
  );
}
function DesktopAddProduct(props) {
  const {
    form,
    update,
    selectedCategory,
    setCategoryDialogOpen,
    navigate,
    save,
    saving,
    loading,
    isEditMode,
    units,
    hasSaleHistory,
  } = props;
  return (
    <Dialog open fullWidth maxWidth="md" onClose={() => navigate("/stock")} slotProps={{ paper: { sx: { width: "calc(100% - 32px)", maxWidth: 760, borderRadius: 3, maxHeight: "88vh" } } }}>
      <DialogTitle sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 21, fontWeight: 800 }}>
          {isEditMode ? "Edit Product" : "Create Product"}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.25, alignContent: "start" }}>
          <Box sx={{ gridColumn: "1 / -1" }}><ProductFields {...props} /></Box>
          <Box sx={{ gridColumn: "1 / -1" }}><CategorySelector
            value={selectedCategory?.name}
            onClick={() => setCategoryDialogOpen(true)}
          /></Box>
          <Box sx={{ gridColumn: "1 / -1" }}><PricingFields form={form} update={update} /></Box>
          <Field label="Stock Quantity" value={form.stock} onChange={update("stock")} icon={<Inventory2RoundedIcon />} disabled={isEditMode && hasSaleHistory} helperText={isEditMode && hasSaleHistory ? "Locked after sale history." : undefined} />
          <UnitField form={form} update={update} units={units} />
          <Box sx={{ gridColumn: "1 / -1" }}><Field
            label="Minimum Stock Alert Level (Optional)"
            value={form.minimum}
            onChange={update("minimum")}
            icon={<WarningAmberRoundedIcon />}
          /></Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
        <Button onClick={() => navigate("/stock")} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<CheckRoundedIcon />}
          onClick={save}
          disabled={saving || loading}
          sx={{ minHeight: 40, textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Saving…" : isEditMode ? "Save Changes" : "Save Product"}
        </Button>
      </DialogActions>
      <SharedDialogs {...props} />
    </Dialog>
  );
}
function SharedDialogs({
  categoryDialogOpen,
  setCategoryDialogOpen,
  categories,
  selectCategory,
  createCategory,
  scannerOpen,
  setScannerOpen,
  handleDetected,
  barcodeManagerOpen,
  setBarcodeManagerOpen,
  shortCodeManagerOpen,
  setShortCodeManagerOpen,
  api,
  form,
  activeBarcode,
  activeShortCode,
  useDraft,
  handleBarcodeChanged,
  handleShortCodeChanged,
  setMessage,
}) {
  return (
    <>
      <CategoryDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        categories={categories}
        onSelect={selectCategory}
        onCreate={createCategory}
      />
      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />
      <BarcodeManagerDialog
        open={barcodeManagerOpen}
        onClose={() => setBarcodeManagerOpen(false)}
        api={api}
        productName={form.name}
        barcode={activeBarcode}
        onDraft={useDraft}
        onChanged={handleBarcodeChanged}
        onNotice={setMessage}
      />
      <BarcodeManagerDialog
        open={shortCodeManagerOpen}
        onClose={() => setShortCodeManagerOpen(false)}
        api={api}
        productName={form.name}
        barcode={activeShortCode}
        onChanged={handleShortCodeChanged}
        onNotice={setMessage}
      />
    </>
  );
}
function CategorySelector({ value, onClick }) {
  return (
    <Box sx={{ minWidth: 0, mb: { xs: 2, md: 1.25 } }}>
      <Typography fontSize={16} fontWeight={700} sx={{ mb: 0.75 }}>
        Category (Optional)
      </Typography>
      <Button
        fullWidth
        variant="outlined"
        onClick={onClick}
        startIcon={<CategoryRoundedIcon />}
        endIcon={<KeyboardArrowDownRoundedIcon />}
        sx={{
          minHeight: 64,
          justifyContent: "flex-start",
          borderRadius: 1.5,
          borderColor: "#b8b8b8",
          color: value ? "text.primary" : "text.secondary",
          fontSize: 16,
          fontWeight: 400,
          px: 1.75,
          textTransform: "none",
          "& .MuiButton-startIcon": { mr: 1, color: "text.primary" },
          "& .MuiButton-endIcon": { ml: "auto", color: "text.secondary" },
        }}
      >
        {value || "Select Category"}
      </Button>
    </Box>
  );
}
function CategoryDialog({ open, onClose, categories, onSelect, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const closeCreate = () => { setCreating(false); setName(""); setError(""); };
  const save = async () => { setSaving(true); setError(""); try { await onCreate(name); closeCreate(); } catch (requestError) { setError(requestError.message || "Unable to create category."); } finally { setSaving(false); } };
  return (
    <><Dialog open={open} onClose={onClose} aria-labelledby="select-category-title" slotProps={{ paper: { sx: { width: "calc(100% - 64px)", maxWidth: 448, minHeight: "78vh", m: 0, borderRadius: 4, boxShadow: "0 18px 48px rgba(0,0,0,0.3)", alignSelf: "center" } }, backdrop: { sx: { bgcolor: "rgba(0, 0, 0, 0.55)" } } }}>
      <DialogContent sx={{ p: 5, "&:first-of-type": { pt: 5 } }}>
        <Typography id="select-category-title" sx={{ fontSize: 34, fontWeight: 400, lineHeight: 1.15, mb: 4.25 }}>Select Category</Typography>
        <Button onClick={() => setCreating(true)} startIcon={<AddRoundedIcon />} sx={{ minHeight: 52, px: 2.5, color: "text.primary", fontSize: 22, fontWeight: 400, textTransform: "none", "& .MuiButton-startIcon": { mr: 2 } }}>Add New Category</Button>
        <Divider sx={{ borderColor: "text.primary", my: 1.5 }} />
        <Stack spacing={0.5} sx={{ pt: 1.5 }}>
          {categories.map((category) => (
            <Button
              key={category.id}
              onClick={() => onSelect(category)}
              sx={{
                justifyContent: "flex-start",
                minHeight: 72,
                px: 2.5,
                fontSize: 23,
                fontWeight: 400,
                textTransform: "none",
                color: "text.primary",
              }}
            >
              {category.name}
            </Button>
          ))}
        </Stack>
      </DialogContent>
    </Dialog><Dialog open={creating} onClose={closeCreate} fullWidth maxWidth="xs"><DialogTitle>Add New Category</DialogTitle><DialogContent><TextField autoFocus fullWidth value={name} onChange={(event) => setName(event.target.value)} label="Category name" onKeyDown={(event) => { if (event.key === "Enter") void save(); }} error={Boolean(error)} helperText={error} /></DialogContent><DialogActions><Button onClick={closeCreate}>Cancel</Button><Button variant="contained" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? "Adding…" : "Add Category"}</Button></DialogActions></Dialog></>
  );
}
function Field({
  label,
  labelAction,
  icon,
  endIcon,
  multiline,
  minRows,
  children,
  ...props
}) {
  return (
    <Box sx={{ mb: { xs: 2, md: 1.25 } }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ minWidth: 0, minHeight: 32, mb: 0.75 }}
      >
        <Typography noWrap fontSize={16} fontWeight={700}>
          {label}
        </Typography>
        {labelAction}
      </Stack>
      <TextField
        fullWidth
        multiline={multiline}
        minRows={minRows}
        {...props}
        slotProps={{
          input: {
            startAdornment: icon ? (
              <InputAdornment
                position="start"
                sx={
                  multiline ? { alignSelf: "flex-start", mt: 1.25, color: "text.primary", mr: 1 } : { color: "text.primary", mr: 1 }
                }
              >
                {icon}
              </InputAdornment>
            ) : undefined,
            endAdornment: endIcon ? (
              <InputAdornment position="end" sx={{ ml: 0.5 }}>{endIcon}</InputAdornment>
            ) : undefined,
          },
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            minHeight: multiline ? { xs: 116, md: 96 } : { xs: 64, md: 56 },
            borderRadius: 1.5,
            fontSize: 16,
            alignItems: multiline ? "flex-start" : "center",
            "& fieldset": { borderColor: "#b8b8b8" },
          },
          "& .MuiInputBase-inputMultiline": { pt: 1.5 },
        }}
      >
        {children}
      </TextField>
    </Box>
  );
}
function Notice({ message, onClose }) {
  return (
    <Snackbar
      open={Boolean(message)}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      {message ? (
        <Alert severity={message.severity} onClose={onClose}>
          {message.text}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
