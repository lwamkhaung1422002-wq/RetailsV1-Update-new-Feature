import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AddBusinessRoundedIcon from "@mui/icons-material/AddBusinessRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import ShoppingCartCheckoutRoundedIcon from "@mui/icons-material/ShoppingCartCheckoutRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { useNavigate } from "react-router";
import { useDashboardQuery } from "../../hooks/usePosQueries";

const setupStorageKey = "pos:dashboard-setup-dismissed";
const greetingForHour = (hour) => {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
};
const formatKyat = (amount) =>
  `${new Intl.NumberFormat("en-US").format(amount)} ကျပ်`;

const paymentMethodChipSx = (paymentMethod) => {
  const tones = {
    Cash: { bgcolor: "#e8f6ec", color: "#38924e" },
    KPay: { bgcolor: "#eaf2ff", color: "#2367d8" },
    Wave: { bgcolor: "#fff0e7", color: "#df6b19" },
  };

  return {
    ...(tones[paymentMethod] || tones.Cash),
    fontWeight: 700,
    height: 26,
    fontSize: 13,
    borderRadius: 3,
  };
};

function MetricCard({ label, value, color, borderColor }) {
  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: "#fff",
        borderColor,
        borderWidth: 2,
        borderRadius: 2.5,
        minHeight: 142,
        boxShadow: "0 3px 8px rgba(15, 23, 42, 0.11)",
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          minHeight: 142,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          textAlign: "left",
          pl: 3,
          pr: 2,
          py: 2,
          "&:last-child": { pb: 2 },
        }}
      >
        <Stack spacing={1.5} alignItems="flex-start">
          <Typography
            sx={{
              color,
              fontSize: { xs: 23, sm: 28 },
              lineHeight: 1.1,
              fontWeight: 800,
            }}
          >
            {value}
          </Typography>
          <Typography sx={{ color: "#5f6368", fontSize: 14 }}>
            {label}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { data: dashboard, refetch } = useDashboardQuery();
  const [showSetup, setShowSetup] = useState(
    () => localStorage.getItem(setupStorageKey) !== "true",
  );
  const [greeting, setGreeting] = useState(() => greetingForHour(new Date().getHours()));
  const summary = dashboard ? {
    todaySales: Number(dashboard.summary?.todaySales || 0),
    todayExpense: Number(dashboard.summary?.operatingExpenses || 0),
    todayProfit: Number(dashboard.summary?.todayProfit || 0),
    lowStockItems: dashboard.lowStock?.length || 0,
  } : {
    todaySales: 0,
    todayExpense: 0,
    todayProfit: 0,
    lowStockItems: 0,
  };
  const orders = dashboard ? (dashboard.recentSales || []).map((order) => ({
    id: order.invoiceNumber || order.id,
    amount: Number(order.amount || 0),
    quantity: Number(order.itemCount || 0),
    paymentMethod: order.paymentStatus === "unpaid" ? "Unpaid" : order.paymentStatus === "partial" ? "Partial" : order.paymentMethod === "KBZ Pay" ? "KPay" : order.paymentMethod || "Cash",
  })) : [];

  useEffect(() => {
    const refreshDashboard = () => { void refetch(); };
    window.addEventListener("dashboard-refresh", refreshDashboard);
    return () =>
      window.removeEventListener("dashboard-refresh", refreshDashboard);
  }, [refetch]);
  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForHour(new Date().getHours()));
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dismissSetup = () => {
    localStorage.setItem(setupStorageKey, "true");
    setShowSetup(false);
  };

  if (!isMobile) {
    return <DesktopDashboard summary={summary} orders={orders} navigate={navigate} />;
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#f8fafc",
        color: "#101828",
        px: 3,
        py: 3,
      }}
    >
      <Typography sx={{ color: "#7a7f87", fontSize: 16 }}>
        {greeting}
      </Typography>
      {showSetup && (
        <Card
          variant="outlined"
          sx={{
            position: "relative",
            mt: 3,
            bgcolor: "#f3f8ff",
            borderColor: "#c6dcec",
            borderRadius: 3,
            boxShadow: "0 3px 8px rgba(15, 23, 42, 0.18)",
          }}
        >
          <IconButton
            aria-label="Dismiss setup"
            onClick={dismissSetup}
            size="small"
            sx={{ position: "absolute", right: 8, top: 8, color: "#708090" }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
          <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
            <Stack direction="row" spacing={1.25} alignItems="left">
              <RocketLaunchRoundedIcon
                sx={{ color: "#1976d2", fontSize: 34 }}
              />
              <Typography
                sx={{ color: "#1976d2", fontSize: 23, fontWeight: 800 }}
              >
                Get Started
              </Typography>
            </Stack>
            <Typography
              sx={{
                mt: 1.25,
                color: "#384452",
                fontSize: 16,
                lineHeight: 1.55,
              }}
            >
              Set up your shop by adding products to your inventory
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2.5, alignItems: "flex-start" }}>
              <Button
                variant="outlined"
                startIcon={<AddBusinessRoundedIcon />}
                onClick={() => navigate("/stock")}
                sx={{
                  borderColor: "#b7d0e5",
                  color: "#1976d2",
                  borderRadius: 6,
                  px: 2.5,
                  py: 1,
                  fontSize: 16,
                }}
              >
                Add Category
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={() => navigate("/stock/add")}
                sx={{
                  borderColor: "#b7d0e5",
                  color: "#1976d2",
                  borderRadius: 6,
                  px: 2.5,
                  py: 1,
                  fontSize: 16,
                }}
              >
                Add Product
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 2,
          mt: 3,
        }}
      >
        <MetricCard
          label="Today's Sales"
          value={formatKyat(summary.todaySales)}
          color="#43a35a"
          borderColor="#c9e8d1"
        />
        <MetricCard
          label="Today's Expense"
          value={formatKyat(summary.todayExpense)}
          color="#e69b22"
          borderColor="#f4ddb4"
        />
        <MetricCard
          label="Low Stock Items"
          value={summary.lowStockItems}
          color="#e65353"
          borderColor="#f3c9c9"
        />
        <MetricCard
          label="Today's Profit"
          value={formatKyat(summary.todayProfit)}
          color="#1f86d6"
          borderColor="#c4e0f2"
        />
      </Box>

      <Typography variant="h6" fontWeight={800} sx={{ mt: 3.25, mb: 2 }}>
        Quick Actions
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 2,
        }}
      >
        <Button
          onClick={() => navigate("/sale/create")}
          sx={{
            minHeight: 138,
            flexDirection: "column",
            gap: 1.2,
            border: 1,
            borderColor: "#a9cbe3",
            bgcolor: "#e9f4fd",
            color: "#1976d2",
            borderRadius: 2.5,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          <ShoppingCartCheckoutRoundedIcon sx={{ fontSize: 42 }} />
          Create Order
        </Button>
        <Button
          onClick={() => navigate("/stock/add")}
          sx={{
            minHeight: 138,
            flexDirection: "column",
            gap: 1.2,
            border: 1,
            borderColor: "#f0c1b6",
            bgcolor: "#fff0ea",
            color: "#f25c3b",
            borderRadius: 2.5,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          <AddRoundedIcon sx={{ fontSize: 42 }} />
          Add Product
        </Button>
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mt: 4, mb: 2 }}
      >
        <Typography variant="h6" fontWeight={800}>
          Recent Orders
        </Typography>
        <Button
          onClick={() => navigate("/sale")}
          sx={{
            ml: "auto",
            color: "#1976d2",
            textTransform: "none",
            fontSize: 16,
            fontWeight: 700,
            minWidth: 0,
          }}
        >
          View All
        </Button>
      </Stack>
      <Stack spacing={1.25}>
        {orders.map((order) => (
          <Card
            key={order.id}
            sx={{
              bgcolor: "#fff",
              borderRadius: 2.5,
              boxShadow: "0 3px 8px rgba(15, 23, 42, 0.16)",
            }}
          >
            <CardContent sx={{ px: 2, py: 1, "&:last-child": { pb: 1 } }}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <CheckCircleRoundedIcon
                  sx={{ color: "#43a35a", fontSize: 36, flexShrink: 0 }}
                />
                <Typography
                  noWrap
                  fontWeight={700}
                  sx={{ minWidth: 0, flexGrow: 1 }}
                >
                  {order.id}
                </Typography>
                <Typography noWrap fontWeight={800}>
                  {formatKyat(order.amount)}
                </Typography>
                <Chip
                  label={order.paymentMethod}
                  size="small"
                  sx={paymentMethodChipSx(order.paymentMethod)}
                />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

function DesktopDashboard({ summary, orders, navigate }) {
  const metrics = [
    { label: "Today's Sales", value: formatKyat(summary.todaySales), tone: "#1769e0", soft: "#f3f7ff" },
    { label: "Today's Expense", value: formatKyat(summary.todayExpense), tone: "#f36b2b", soft: "#fff8f1" },
    { label: "Low Stock Items", value: summary.lowStockItems, tone: "#7648e9", soft: "#faf7ff" },
    { label: "Today's Profit", value: formatKyat(summary.todayProfit), tone: "#24934a", soft: "#f4fbf6" },
  ];
  const topSellingProducts = [];

  return (
    <Box sx={{ width: "100%", maxWidth: "none", mx: 0, py: 0.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 2.25, alignItems: "stretch", mb: 4 }}>
        {metrics.map((metric) => <DesktopMetricCard key={metric.label} {...metric} />)}
        <Card sx={{ ...desktopCardSx, minHeight: 116 }}>
          <CardContent sx={{ height: "100%", boxSizing: "border-box", p: 1.5, display: "grid", gap: 1, "&:last-child": { pb: 1.5 } }}>
            <Button variant="contained" startIcon={<ShoppingCartCheckoutRoundedIcon />} onClick={() => navigate("/sale/create")} sx={{ minHeight: 42, textTransform: "none", fontWeight: 700, borderRadius: 1.5, whiteSpace: "nowrap" }}>Create Order</Button>
            <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => navigate("/stock/add")} sx={{ minHeight: 42, textTransform: "none", fontWeight: 700, borderRadius: 1.5, whiteSpace: "nowrap" }}>Add Product</Button>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1.28fr) minmax(370px, 0.98fr)", gap: 2.25 }}>
        <Card sx={{ ...desktopCardSx, height: 474 }}>
          <CardContent sx={{ height: "100%", boxSizing: "border-box", p: 2.75, display: "flex", flexDirection: "column", "&:last-child": { pb: 2.75 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Recent Orders</Typography>
              <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate("/sale")} sx={{ minWidth: 0, p: 0, color: "primary.main", textTransform: "none", fontWeight: 700 }}>View all</Button>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "104px minmax(170px, 1fr) 58px 112px 128px", columnGap: 1.5, px: 0.5, pb: 1.25 }}>
              <Typography color="text.secondary" sx={desktopTableHeaderSx}>STATUS</Typography>
              <Typography color="text.secondary" sx={desktopTableHeaderSx}>ORDER</Typography>
              <Typography color="text.secondary" sx={desktopTableHeaderSx}>QTY</Typography>
              <Typography color="text.secondary" sx={desktopTableHeaderSx}>PAYMENT</Typography>
              <Typography color="text.secondary" sx={{ ...desktopTableHeaderSx, textAlign: "right" }}>AMOUNT</Typography>
            </Box>
            <Divider />
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.75, mr: -0.75, "&::-webkit-scrollbar": { width: 6 }, "&::-webkit-scrollbar-thumb": { bgcolor: "#cbd5e1", borderRadius: 99 }, "&::-webkit-scrollbar-track": { bgcolor: "transparent" } }}>
              {orders.map((order) => <Box key={order.id} sx={{ display: "grid", gridTemplateColumns: "104px minmax(170px, 1fr) 58px 112px 128px", columnGap: 1.5, alignItems: "center", px: 0.5, py: 1.75, borderBottom: "1px solid", borderColor: "divider" }}>
                <Chip label="Done" size="small" sx={{ justifySelf: "start", bgcolor: "#e8f6ec", color: "#38924e", fontWeight: 700, height: 30, borderRadius: 1.5 }} />
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{order.id}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{order.quantity}</Typography>
                <Chip label={order.paymentMethod} size="small" sx={{ justifySelf: "start", ...paymentMethodChipSx(order.paymentMethod) }} />
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, textAlign: "right" }}>{formatKyat(order.amount)}</Typography>
              </Box>)}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ ...desktopCardSx, height: 474 }}>
          <CardContent sx={{ height: "100%", boxSizing: "border-box", p: 2.75, "&:last-child": { pb: 2.75 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.25 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Daily Top Selling Products</Typography>
              <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate("/stock")} sx={{ minWidth: 0, p: 0, color: "primary.main", textTransform: "none", fontWeight: 700 }}>View all</Button>
            </Box>
            <Box>
              {topSellingProducts.map((product, index) => <Box key={product.name} sx={{ display: "grid", gridTemplateColumns: "28px 42px minmax(0, 1fr) auto", alignItems: "center", columnGap: 1.25, py: 1.7, borderBottom: index === topSellingProducts.length - 1 ? 0 : "1px solid", borderColor: "divider" }}>
                <Typography sx={{ color: "text.secondary", fontSize: 14, fontWeight: 700 }}>{index + 1}</Typography>
                <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: product.color, color: product.textColor, fontSize: 11, fontWeight: 800 }}>{product.initials}</Box>
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{product.name}</Typography>
                <Box sx={{ minWidth: 64, px: 1.25, py: 0.6, borderRadius: 99, bgcolor: "#f2f6fd", color: "#335e9e", textAlign: "center" }}><Typography component="span" sx={{ fontSize: 13, fontWeight: 800 }}>{product.qty}</Typography><Typography component="span" sx={{ ml: 0.5, fontSize: 12, fontWeight: 600 }}>sold</Typography></Box>
              </Box>)}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function DesktopMetricCard({ label, value, tone, soft }) {
  return (
    <Card sx={{ ...desktopCardSx, minHeight: 116, bgcolor: soft, borderColor: `${tone}24` }}>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography sx={{ color: tone, fontSize: 14, lineHeight: 1.3, fontWeight: 700, textAlign: "left" }}>{label}</Typography>
        <Typography noWrap sx={{ mt: 1.35, fontSize: 25, lineHeight: 1.1, fontWeight: 700, textAlign: "left" }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

const desktopCardSx = { borderRadius: 3, bgcolor: "background.paper", boxShadow: "0 3px 12px rgba(15,23,42,0.07)", border: "1px solid", borderColor: "divider" };
const desktopTableHeaderSx = { fontSize: 12, fontWeight: 700, letterSpacing: 0.15 };
