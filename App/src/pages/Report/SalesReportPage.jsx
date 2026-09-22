import { useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Popover,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useSalesReportQuery } from "../../hooks/usePosQueries";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router";

const desktopReportTabs = [
  "Overview",
  "Daily",
  "Weekly",
  "Monthly",
  "Yearly",
  "Compare",
];
const mobileReportTabs = [
  "Overview",
  "Today",
  "Weekly",
  "Monthly",
  "Yearly",
  "Compare",
];
const trendTabs = ["daily", "weekly", "monthly", "yearly"];
const money = (value) =>
  new Intl.NumberFormat("en-US").format(Math.round(Number(value ?? 0)));
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Yangon",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00+06:30`))
    : "";

function yangonDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCalendarDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00+06:30`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthToDate() {
  const today = yangonDateKey();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function allHistoryRange() {
  return { mode: "all", from: "2000-01-01", to: yangonDateKey() };
}

function defaultMonthRange() {
  return { mode: "mtd", ...monthToDate() };
}

function todayRange() {
  const today = yangonDateKey();
  return { mode: "today", from: today, to: today };
}

function lastSevenDaysRange() {
  const today = yangonDateKey();
  return { mode: "custom", from: addCalendarDays(today, -6), to: today };
}

function yearToDateRange() {
  const today = yangonDateKey();
  return { mode: "custom", from: `${today.slice(0, 4)}-01-01`, to: today };
}

function reportQuery(range, trend) {
  const today = yangonDateKey();
  const dates =
    range.mode === "today"
      ? { from: today, to: today }
      : range.mode === "all"
        ? { from: "2000-01-01", to: today }
        : range.mode === "custom"
          ? { from: range.from, to: range.to }
          : monthToDate();
  return { ...dates, trend };
}

function guestDemoReport(query) {
  const current = {
    totalSales: 296000,
    orders: 18,
    itemsSold: 47,
    totalCostPrice: 202500,
    grossProfit: 93500,
  };
  const previous = {
    totalSales: 241500,
    orders: 15,
    itemsSold: 39,
    totalCostPrice: 168200,
    grossProfit: 73300,
  };
  const metric = (value, prior) => ({
    current: value,
    previous: prior,
    change: value - prior,
    percentage: Number((((value - prior) / prior) * 100).toFixed(1)),
  });
  const summary = Object.fromEntries(
    Object.keys(current).map((key) => [
      key,
      metric(current[key], previous[key]),
    ]),
  );
  const today = yangonDateKey();
  const previousFrom =
    query.from === query.to
      ? addCalendarDays(query.from, -1)
      : addCalendarDays(
          query.from,
          -(
            Math.round(
              (new Date(`${query.to}T00:00:00+06:30`) -
                new Date(`${query.from}T00:00:00+06:30`)) /
                86400000,
            ) + 1
          ),
        );
  const previousTo = addCalendarDays(query.from, -1);
  const reportMetrics = (label, values) => ({ label, ...values });

  return {
    range: {
      from: query.from,
      to: query.to,
      previous: { from: previousFrom, to: previousTo },
    },
    summary,
    trend: [
      { key: addCalendarDays(today, -4), sales: 42000, orders: 3 },
      { key: addCalendarDays(today, -3), sales: 54000, orders: 4 },
      { key: addCalendarDays(today, -2), sales: 61000, orders: 3 },
      { key: addCalendarDays(today, -1), sales: 68000, orders: 4 },
      { key: today, sales: 71000, orders: 4 },
    ],
    categories: [
      { name: "Drinks", amount: 118400, percentage: 40 },
      { name: "Food", amount: 88800, percentage: 30 },
      { name: "Beauty", amount: 59200, percentage: 20 },
      { name: "Household", amount: 29600, percentage: 10 },
    ],
    paymentCollections: [
      { method: "Cash", amount: 142000, percentage: 48 },
      { method: "KPay", amount: 95000, percentage: 32.1 },
      { method: "WavePay", amount: 59000, percentage: 19.9 },
    ],
    collectionTotal: current.totalSales,
    salesSummary: [
      reportMetrics("Today", {
        totalSales: 71000,
        orders: 4,
        itemsSold: 11,
        totalCostPrice: 48400,
        grossProfit: 22600,
      }),
      reportMetrics("This Week", {
        totalSales: 296000,
        orders: 18,
        itemsSold: 47,
        totalCostPrice: 202500,
        grossProfit: 93500,
      }),
      reportMetrics("Last Week", previous),
      reportMetrics("This Month", current),
      reportMetrics("Last Month", {
        totalSales: 684000,
        orders: 43,
        itemsSold: 112,
        totalCostPrice: 467000,
        grossProfit: 217000,
      }),
    ],
    comparison: [
      ["Total Sales", current.totalSales, previous.totalSales],
      ["Orders", current.orders, previous.orders],
      ["Items Sold", current.itemsSold, previous.itemsSold],
      ["Total Cost Price", current.totalCostPrice, previous.totalCostPrice],
      ["Gross Profit", current.grossProfit, previous.grossProfit],
    ].map(([metricName, value, prior]) => ({
      metric: metricName,
      ...metric(value, prior),
    })),
  };
}

function growthText(metric) {
  if (!metric || metric.percentage === null) return "";
  return `${metric.percentage > 0 ? "+" : ""}${metric.percentage}%`;
}

function growthSx(metric) {
  if (!metric || metric.percentage === null)
    return metric?.current
      ? { color: "#16813a", bgcolor: "#e9f8ee" }
      : { color: "#64748b", bgcolor: "#f1f5f9" };
  if (metric.percentage > 0) return { color: "#16813a", bgcolor: "#e9f8ee" };
  if (metric.percentage < 0) return { color: "#c62828", bgcolor: "#ffebee" };
  return { color: "#64748b", bgcolor: "#f1f5f9" };
}

function niceMaximum(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude
  );
}

function compactAmount(value) {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function compactMobileAmount(value) {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) < 1_000) return String(Math.round(amount));
  const divisor = Math.abs(amount) >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000 ? "M" : "K";
  return `${Number((amount / divisor).toFixed(1))}${suffix}`;
}

void guestDemoReport;

export default function SalesReportPage() {
  const isMobile = useMediaQuery("(max-width:768px)");
  const navigate = useNavigate();
  const { isGuest } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [trend, setTrend] = useState("daily");
  const [dateAnchor, setDateAnchor] = useState(null);
  const [draftRange, setDraftRange] = useState(defaultMonthRange);
  const [range, setRange] = useState(defaultMonthRange);
  const [comparisonFocused, setComparisonFocused] = useState(false);
  const comparisonRef = useRef(null);
  const mobileComparisonRef = useRef(null);
  const query = useMemo(() => reportQuery(range, trend), [range, trend]);
  const salesComparisonQuery = useMemo(
    () => ({
      ...reportQuery(defaultMonthRange(), "monthly"),
      comparison: "month",
    }),
    [],
  );
  const {
    data: report,
    error: reportError,
    isLoading,
  } = useSalesReportQuery(query, { enabled: !isGuest });
  const { data: salesComparisonReport } = useSalesReportQuery(
    salesComparisonQuery,
    { enabled: !isGuest },
  );
  const activeReport = isGuest ? null : report;
  const error = reportError?.message || "";
  const loading = !isGuest && isLoading;

  const selectTab = (next) => {
    setTab(next);
    const nextTrend = next === "Today" ? "daily" : next.toLowerCase();
    if (trendTabs.includes(nextTrend)) setTrend(nextTrend);
    if (isMobile) {
      const nextRange =
        next === "Today"
          ? todayRange()
          : next === "Weekly" || next === "Compare"
            ? lastSevenDaysRange()
            : next === "Yearly"
              ? yearToDateRange()
              : defaultMonthRange();
      setRange(nextRange);
      setDraftRange(nextRange);
    }
    if (next === "Compare") {
      requestAnimationFrame(() => {
        (isMobile
          ? mobileComparisonRef
          : comparisonRef
        ).current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setComparisonFocused(true);
        window.setTimeout(() => setComparisonFocused(false), 1250);
      });
    }
  };
  const summary = activeReport?.summary;
  const stats = [
    {
      key: "totalSales",
      label: "Total Sales",
    },
    {
      key: "orders",
      label: "Orders",
      plain: true,
    },
    {
      key: "totalCostPrice",
      label: "Total Cost Price",
    },
    {
      key: "grossProfit",
      label: "Profit",
    },
  ];
  const rangeLabel = range.mode === "all"
    ? "All history"
    : report?.range
      ? `${formatDate(report.range.from)} – ${formatDate(report.range.to)}`
      : "Date range";

  if (isMobile)
    return (
      <MobileSalesReport
        report={activeReport}
        loading={loading}
        error={error}
        range={range}
        draftRange={draftRange}
        setDraftRange={setDraftRange}
        setRange={setRange}
        dateAnchor={dateAnchor}
        setDateAnchor={setDateAnchor}
        tab={tab}
        selectTab={selectTab}
        trend={trend}
        setTrend={setTrend}
        navigate={navigate}
        comparisonRef={mobileComparisonRef}
        comparisonFocused={comparisonFocused}
        comparisonReport={salesComparisonReport}
      />
    );

  return (
    <Box sx={{ width: "100%", maxWidth: "none", mx: 0, py: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 2.5,
        }}
      >
        <Stack direction="row" spacing={0.5}>
          {desktopReportTabs.map((item) => (
            <Button
              key={item}
              variant={tab === item ? "contained" : "text"}
              onClick={() => selectTab(item)}
              sx={{
                minHeight: 40,
                px: 1.75,
                borderRadius: 1.5,
                textTransform: "none",
                color: tab === item ? "common.white" : "text.secondary",
                fontWeight: tab === item ? 700 : 600,
              }}
            >
              {item}
            </Button>
          ))}
        </Stack>
        <Button
          variant="outlined"
          startIcon={<CalendarMonthRoundedIcon />}
          onClick={(event) => {
            setDraftRange(range);
            setDateAnchor(event.currentTarget);
          }}
          sx={toolbarButtonSx}
        >
          {rangeLabel}
        </Button>
      </Box>
      {loading && (
        <Box sx={{ minHeight: 430, display: "grid", placeItems: "center" }}>
          <Stack alignItems="center" spacing={1.5}>
            <CircularProgress />
            <Typography color="text.secondary">
              Loading sales analytics…
            </Typography>
          </Stack>
        </Box>
      )}
      {!loading && error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && activeReport && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 1.75,
              mb: 2.25,
            }}
          >
            {stats.map((stat) => (
              <SalesStat
                key={stat.key}
                {...stat}
                metric={summary?.[stat.key]}
              />
            ))}
          </Box>
          {summary?.orders?.current === 0 ? (
            <EmptyReport />
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.45fr) minmax(340px, .9fr)",
                  gap: 2.25,
                }}
              >
                <SalesTrend
                  trend={trend}
                  onTrend={setTrend}
                  entries={activeReport.trend}
                />
                <DonutCard
                  title="Sales by Payment Method (Collected)"
                  total={activeReport.collectionTotal}
                  items={activeReport.paymentCollections.map((entry) => [
                    entry.method,
                    entry.amount,
                    entry.percentage,
                  ])}
                />
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.45fr) minmax(340px, .9fr)",
                  gap: 2.25,
                  mt: 2.25,
                }}
              >
                <SalesSummary rows={activeReport.salesSummary} />
                <DonutCard
                  title="Sales by Category"
                  total={summary.totalSales.current}
                  items={activeReport.categories.map((entry) => [
                    entry.name,
                    entry.amount,
                    entry.percentage,
                  ])}
                />
              </Box>
              {salesComparisonReport && <Box
                ref={comparisonRef}
                sx={{
                  scrollMarginTop: 24,
                  borderRadius: 2.5,
                  outline: comparisonFocused
                    ? "2px solid #1976d2"
                    : "2px solid transparent",
                  outlineOffset: 4,
                  transition: "outline-color .25s ease",
                }}
              >
                <ComparisonTable
                  comparison={salesComparisonReport.comparison}
                />
              </Box>}
            </>
          )}
        </>
      )}
      <DatePopover
        anchor={dateAnchor}
        onClose={() => setDateAnchor(null)}
        draftRange={draftRange}
        setDraftRange={setDraftRange}
        setRange={setRange}
      />
    </Box>
  );
}

function MobileSalesReport({
  report,
  loading,
  error,
  range,
  draftRange,
  setDraftRange,
  setRange,
  dateAnchor,
  setDateAnchor,
  tab,
  selectTab,
  trend,
  setTrend,
  navigate,
  comparisonRef,
  comparisonFocused,
  comparisonReport,
}) {
  const summary = report?.summary;
  const mobileStats = [
    {
      key: "totalSales",
      label: "Total Sales",
    },
    {
      key: "orders",
      label: "Orders",
      plain: true,
    },
    {
      key: "totalCostPrice",
      label: "Total Cost Price",
    },
    {
      key: "grossProfit",
      label: "Profit",
    },
  ];
  return (
    <Box sx={{ pb: 3 }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: "#1976d2" }}>
        <Toolbar
          sx={{
            minHeight: 62,
            display: "grid",
            gridTemplateColumns: "40px minmax(0, 1fr) 40px",
            px: 1,
          }}
        >
          <IconButton
            aria-label="Back to settings"
            onClick={() => navigate("/settings")}
            sx={{ color: "common.white" }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography
            noWrap
            align="center"
            sx={{ px: 0.5, fontSize: 17, fontWeight: 800 }}
          >
            Sale Report
          </Typography>
          <IconButton
            aria-label="Choose date range"
            onClick={(event) => {
              setDraftRange(range);
              setDateAnchor(event.currentTarget);
            }}
            sx={{ color: "common.white" }}
          >
            <CalendarMonthRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 0.35,
            p: 0.35,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            bgcolor: "background.paper",
          }}
        >
          {mobileReportTabs.map((item) => (
            <Button
              key={item}
              variant={tab === item ? "contained" : "text"}
              onClick={() => selectTab(item)}
              sx={{
                minWidth: 0,
                minHeight: 34,
                px: 0.3,
                borderRadius: 1,
                textTransform: "none",
                color: tab === item ? "common.white" : "text.primary",
                fontSize: "clamp(8.5px, 2.55vw, 10.5px)",
                fontWeight: tab === item ? 600 : 500,
                whiteSpace: "nowrap",
              }}
            >
              {item}
            </Button>
          ))}
        </Box>
        {loading && (
          <Box sx={{ minHeight: 340, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        {!loading && !error && report && (
          <>
            {summary?.orders?.current === 0 ? (
              <Box sx={{ mt: 1.5 }}>
                <EmptyReport />
              </Box>
            ) : (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 1,
                    mt: 1.5,
                  }}
                >
                  {mobileStats.map((stat) => (
                    <MobileSalesStat
                      key={stat.key}
                      {...stat}
                      metric={summary?.[stat.key]}
                    />
                  ))}
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <SalesTrend
                    trend={trend}
                    onTrend={setTrend}
                    entries={report.trend}
                    mobile
                  />
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <MobileDonutCard
                    title="Sale by Payment Method"
                    total={report.collectionTotal}
                    items={report.paymentCollections.map((entry) => [
                      entry.method,
                      entry.amount,
                      entry.percentage,
                    ])}
                  />
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <MobileTable
                    kind="summary"
                    title="Sales Summary"
                    columns={[
                      "Period",
                      "Sales",
                      "Orders",
                      "Items",
                      "Cost",
                      "Profit",
                    ]}
                    rows={report.salesSummary.map((row) => [
                      row.label,
                      compactMobileAmount(row.totalSales),
                      compactMobileAmount(row.orders),
                      compactMobileAmount(row.itemsSold),
                      compactMobileAmount(row.totalCostPrice),
                      compactMobileAmount(row.grossProfit),
                    ])}
                  />
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <MobileDonutCard
                    title="Sale by Category"
                    total={summary.totalSales.current}
                    items={report.categories.map((entry) => [
                      entry.name,
                      entry.amount,
                      entry.percentage,
                    ])}
                  />
                </Box>
                {comparisonReport && <Box
                  ref={comparisonRef}
                  sx={{
                    mt: 1.25,
                    scrollMarginTop: 16,
                    borderRadius: 2,
                    outline: comparisonFocused
                      ? "2px solid #1976d2"
                      : "2px solid transparent",
                    outlineOffset: 3,
                    transition: "outline-color .25s ease",
                  }}
                >
                  <MobileTable
                    kind="comparison"
                    title="Sales Comparison"
                    columns={[
                      "Metric",
                      "This Month",
                      "Last Month",
                      "Change",
                      "Growth",
                    ]}
                    rows={comparisonReport.comparison.map((row) => [
                      row.metric,
                      compactMobileAmount(row.current),
                      compactMobileAmount(row.previous),
                      `${row.change > 0 ? "+" : ""}${compactMobileAmount(row.change)}`,
                      growthText(row),
                    ])}
                    growthMetrics={comparisonReport.comparison}
                  />
                </Box>}
              </>
            )}
          </>
        )}
      </Box>
      <DatePopover
        anchor={dateAnchor}
        onClose={() => setDateAnchor(null)}
        draftRange={draftRange}
        setDraftRange={setDraftRange}
        setRange={setRange}
        mobile
      />
    </Box>
  );
}

function MobileSalesStat({ label, metric, plain = false }) {
  const change = growthText(metric);
  const arrow = metric?.percentage > 0 ? "↑" : metric?.percentage < 0 ? "↓" : "";
  return <Card sx={cardSx}>
    <CardContent sx={{ p: 1.35, "&:last-child": { pb: 1.35 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: .75 }}>
        <Typography color="text.secondary" noWrap sx={{ minWidth: 0, fontSize: 11.5, fontWeight: 500 }}>{label}</Typography>
        {change && <Box component="span" sx={{ flexShrink: 0, px: .55, py: .1, borderRadius: .75, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", ...growthSx(metric) }}>{arrow}{change}</Box>}
      </Box>
      <Typography noWrap sx={{ mt: .55, minWidth: 0, fontSize: 18, lineHeight: 1.25, fontWeight: 700 }}>{money(metric?.current)}{plain ? "" : " ကျပ်"}</Typography>
    </CardContent>
  </Card>;
}

function MobileDonutCard({ title, total, items }) {
  const colors = [
    "#7c5cf0",
    "#4a90f5",
    "#55bd8a",
    "#f8ad39",
    "#e76f51",
    "#64748b",
  ];
  let accumulated = 0;
  const gradient = items.length
    ? items
        .map(([, , percentage], index) => {
          const start = accumulated;
          accumulated += Math.max(0, percentage);
          return `${colors[index % colors.length]} ${start}% ${accumulated}%`;
        })
        .join(", ")
    : "#e7edf5 0 100%";
  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography sx={{ fontSize: 17, lineHeight: 1.3, fontWeight: 600 }}>
          {title}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "126px minmax(0, 1fr)",
            alignItems: "center",
            gap: 1,
            mt: 1.25,
          }}
        >
          <Box
            sx={{
              position: "relative",
              width: 120,
              height: 120,
              mx: "auto",
              borderRadius: "50%",
              background: `conic-gradient(${gradient})`,
              "&::after": {
                content: '""',
                position: "absolute",
                inset: 26,
                borderRadius: "50%",
                bgcolor: "background.paper",
              },
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  {money(total)}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 500 }}>
                  Total
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack spacing={0.75}>
            {items.map(([label, amount, percentage], index) => (
              <Box
                key={label}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "9px minmax(0, 1fr)",
                  gap: 0.55,
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    mt: 0.45,
                    borderRadius: 0.5,
                    bgcolor: colors[index % colors.length],
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                    {label}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 11.5, fontWeight: 500 }}>
                    {money(amount)} ({percentage.toFixed(1)}%)
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

function MobileTable({ title, columns, rows, growthMetrics, kind }) {
  const isComparison = kind === "comparison";
  const gridTemplateColumns = isComparison
    ? "1.12fr 1fr 1fr .9fr .9fr"
    : "1.2fr .9fr .72fr .72fr .9fr .9fr";
  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 0.85, "&:last-child": { pb: 0.85 } }}>
        <Typography
          sx={{
            mb: 0.8,
            px: 0.4,
            fontSize: 17,
            lineHeight: 1.3,
            fontWeight: 600,
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns,
              columnGap: 0.1,
              px: 0.55,
              minHeight: isComparison ? 48 : 40,
              alignItems: "center",
              bgcolor: "#f7f9fc",
            }}
          >
            {columns.map((column, index) => {
              const rangeColumn =
                isComparison && typeof column === "object" ? column : null;
              return (
                <Box
                  key={rangeColumn ? `${rangeColumn.top}-${rangeColumn.bottom}` : column}
                  sx={{ minWidth: 0, textAlign: index === 0 ? "left" : "right" }}
                >
                  <Typography
                    sx={{
                      overflowWrap: "anywhere",
                      color: "text.secondary",
                      fontSize: 11.5,
                      lineHeight: 1.15,
                      fontWeight: 600,
                      textTransform: rangeColumn ? "none" : "uppercase",
                    }}
                  >
                    {rangeColumn ? rangeColumn.top : column}
                  </Typography>
                  {rangeColumn && (
                    <Typography
                      sx={{
                        mt: 0.25,
                        color: "text.primary",
                        fontSize: 10.5,
                        lineHeight: 1.15,
                        fontWeight: 500,
                      }}
                    >
                      {rangeColumn.bottom}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
          {rows.map((row, rowIndex) => (
            <Box
              key={`${row[0]}-${rowIndex}`}
              sx={{
                display: "grid",
                gridTemplateColumns,
                columnGap: 0.1,
                px: 0.55,
                minHeight: isComparison ? 43 : 40,
                alignItems: "center",
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              {row.map((cell, index) =>
                growthMetrics && index === row.length - 1 ? (
                  <Box
                    key={`${row[0]}-${index}`}
                    sx={{
                      justifySelf: "end",
                      minWidth: 0,
                      px: isComparison ? 0.3 : 0.25,
                      py: 0.05,
                      borderRadius: 0.55,
                      fontSize: 11,
                      lineHeight: 1.15,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      ...growthSx(growthMetrics[rowIndex]),
                    }}
                  >
                    {growthMetrics[rowIndex]?.percentage > 0
                      ? "↑ "
                      : growthMetrics[rowIndex]?.percentage < 0
                        ? "↓ "
                        : ""}
                    {cell}
                  </Box>
                ) : (
                  <Typography
                    key={`${row[0]}-${index}`}
                    sx={{
                      minWidth: 0,
                      overflow: "hidden",
                      overflowWrap: index === 0 ? "break-word" : "normal",
                      color: "text.primary",
                      fontSize: 12.5,
                      lineHeight: 1.18,
                      fontWeight: index === 0 ? 600 : 500,
                      textAlign: index === 0 ? "left" : "right",
                      whiteSpace: index === 0 ? "normal" : "nowrap",
                    }}
                  >
                    {cell}
                  </Typography>
                ),
              )}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function SalesStat({ label, metric, plain = false }) {
  const change = growthText(metric);
  const arrow = metric?.percentage > 0 ? "↑" : metric?.percentage < 0 ? "↓" : "";
  return <Card sx={cardSx}>
    <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 500 }}>{label}</Typography>
        {change && <Box component="span" sx={{ px: .7, py: .2, borderRadius: 1, fontSize: 11, fontWeight: 600, ...growthSx(metric) }}>{arrow}{change}</Box>}
      </Box>
      <Typography noWrap sx={{ mt: .75, fontSize: 22, lineHeight: 1.25, fontWeight: 700 }}>{money(metric?.current)}{plain ? "" : " ကျပ်"}</Typography>
    </CardContent>
  </Card>;
}

function SalesTrend({ trend, onTrend, entries, mobile = false }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const maxSales = niceMaximum(
    Math.max(...entries.map((entry) => entry.sales), 0),
  );
  const maxOrders = niceMaximum(
    Math.max(...entries.map((entry) => entry.orders), 0),
  );
  const left = 58;
  const chartWidth = 540;
  const baseline = 252;
  const top = 34;
  const chartHeight = 218;
  const count = Math.max(entries.length, 1);
  const labelEvery = Math.max(1, Math.ceil(entries.length / 7));
  const totalSales = entries.reduce((sum, entry) => sum + Number(entry.sales || 0), 0);
  const totalOrders = entries.reduce((sum, entry) => sum + Number(entry.orders || 0), 0);
  const axisColor = "#334155";
  const axisFontSize = mobile ? 12 : 11.5;
  const axisFontWeight = mobile ? 600 : 500;
  const x = (index) => left + ((index + 0.5) * chartWidth) / count;
  const salesY = (value) => baseline - (value / maxSales) * chartHeight;
  const ordersY = (value) => baseline - (value / maxOrders) * chartHeight;
  const points = entries
    .map((entry, index) => `${x(index)},${ordersY(entry.orders)}`)
    .join(" ");
  const label = (key) => (trend === "daily" ? key.slice(5) : key);
  const active = activeIndex === null ? null : entries[activeIndex];
  const barWidth = Math.min(38, chartWidth / count / 1.8);
  return (
    <ReportCard
      title="Sales Trend"
      action={
        <Stack direction="row" spacing={0.35}>
          {trendTabs.map((item) => (
            <Button
              key={item}
              variant={item === trend ? "contained" : "text"}
              size="small"
              onClick={() => onTrend(item)}
              sx={{
                minWidth: 0,
                px: mobile ? 0.55 : 1,
                minHeight: 30,
                textTransform: "capitalize",
                color:
                  item === trend
                    ? "common.white"
                    : mobile
                      ? "text.primary"
                      : "primary.main",
                fontSize: mobile ? 10.5 : 11,
                fontWeight: item === trend ? 600 : 500,
              }}
            >
              {item}
            </Button>
          ))}
        </Stack>
      }
    >
      <Stack
        direction="row"
        spacing={{ xs: 1.5, sm: 2.5 }}
        sx={{ mb: 1.25, justifyContent: mobile ? "space-between" : "flex-start" }}
      >
        <Legend color="#7c5ce7" label={mobile ? "Sale" : "Sales (MMK)"} value={compactAmount(totalSales)} />
        <Legend color="#2563eb" label="Orders" value={money(totalOrders)} />
      </Stack>
      <Box sx={{ position: "relative" }}>
        <Box
          component="svg"
          viewBox="0 0 640 305"
          role="img"
          aria-label="Sales and order trend chart"
          sx={{
            width: "100%",
            height: { xs: 238, sm: 305 },
            display: "block",
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id="sales-bar-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#8f70ed" />
              <stop offset="100%" stopColor="#bcaaf5" />
            </linearGradient>
          </defs>
          <rect x={left} y={top} width={chartWidth} height={chartHeight} rx="8" fill="#fbfcfe" />
          <text x="6" y="20" fill={axisColor} fontSize={axisFontSize} fontWeight={axisFontWeight}>MMK</text>
          <text x="610" y="20" textAnchor="end" fill={axisColor} fontSize={axisFontSize} fontWeight={axisFontWeight}>Orders</text>
          <g stroke="#e5eaf2" strokeWidth="1">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <line
                key={index}
                x1={left}
                x2={left + chartWidth}
                y1={top + index * (chartHeight / 5)}
                y2={top + index * (chartHeight / 5)}
              />
            ))}
          </g>
          {entries.map((entry, index) => (
            <g
              key={entry.key}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(index)}
            >
              <rect
                x={x(index) - barWidth / 2}
                y={salesY(entry.sales)}
                width={barWidth}
                height={baseline - salesY(entry.sales)}
                rx="5"
                fill="#7c5ce7"
                opacity={
                  activeIndex === null || activeIndex === index ? 1 : 0.48
                }
              />
              <rect
                x={x(index) - Math.max(barWidth, chartWidth / count) / 2}
                y={top}
                width={Math.max(barWidth, chartWidth / count)}
                height={chartHeight}
                fill="transparent"
              />
              {(index % labelEvery === 0 || index === entries.length - 1) && <text x={x(index)} y="282" textAnchor="middle" fill={axisColor} fontSize={axisFontSize} fontWeight={axisFontWeight}>{label(entry.key)}</text>}
            </g>
          ))}
          {entries.length > 1 && (
            <polyline
              points={points}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {entries.map((entry, index) => (
            <circle
              key={`${entry.key}-point`}
              cx={x(index)}
              cy={ordersY(entry.orders)}
              r={activeIndex === index ? "5.5" : "4"}
              fill="#fff"
               stroke="#2563eb"
               strokeWidth="2.5"
              pointerEvents="none"
            />
          ))}
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <g key={`axis-${index}`}>
              <text
                x="6"
                y={baseline + 4 - index * (chartHeight / 5)}
                fill={axisColor}
                fontSize={axisFontSize}
                fontWeight={axisFontWeight}
              >
                {compactAmount((maxSales / 5) * index)}
              </text>
              <text
                x="610"
                y={baseline + 4 - index * (chartHeight / 5)}
                fill={axisColor}
                fontSize={axisFontSize}
                fontWeight={axisFontWeight}
                textAnchor="end"
              >
                {Math.round((maxOrders / 5) * index)}
              </text>
            </g>
          ))}
        </Box>
        {active && (
          <Box
            sx={{
              position: "absolute",
              top: 10,
              left: `${Math.min(84, Math.max(16, ((activeIndex + 0.5) / count) * 100))}%`,
              transform: "translateX(-50%)",
              zIndex: 1,
              minWidth: 156,
              p: 1,
              borderRadius: 1.5,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 8px 20px rgba(15,23,42,.16)",
              pointerEvents: "none",
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 800 }}>
              {active.key}
            </Typography>
            <Typography
              sx={{ mt: 0.35, fontSize: 11, color: "#7656e9", fontWeight: 700 }}
            >
              Sales: {money(active.sales)} ကျပ်
            </Typography>
            <Typography
              sx={{ mt: 0.2, fontSize: 11, color: "#348cf5", fontWeight: 700 }}
            >
              Orders: {active.orders}
            </Typography>
          </Box>
        )}
      </Box>
    </ReportCard>
  );
}

function DonutCard({ title, total, items }) {
  const colors = [
    "#7c5cf0",
    "#4a90f5",
    "#55bd8a",
    "#f8ad39",
    "#e76f51",
    "#64748b",
  ];
  let accumulated = 0;
  const gradient = items.length
    ? items
        .map(([, , percentage], index) => {
          const start = accumulated;
          accumulated += Math.max(0, percentage);
          return `${colors[index % colors.length]} ${start}% ${accumulated}%`;
        })
        .join(", ")
    : "#e7edf5 0 100%";
  return (
    <ReportCard title={title}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(160px, .85fr) minmax(150px, 1fr)",
          alignItems: "center",
          minHeight: 290,
          gap: 1.25,
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: 190,
            height: 190,
            mx: "auto",
            borderRadius: "50%",
            background: `conic-gradient(${gradient})`,
            "&::after": {
              content: '""',
              position: "absolute",
              inset: 39,
              borderRadius: "50%",
              bgcolor: "background.paper",
            },
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 19, fontWeight: 800 }}>
                {money(total)}
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                MMK total
              </Typography>
            </Box>
          </Box>
        </Box>
        <Stack spacing={1.6}>
          {items.length ? (
            items.map(([label, amount, percentage], index) => (
              <Box
                key={label}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "12px minmax(0, 1fr)",
                  alignItems: "start",
                  gap: 0.75,
                }}
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    mt: 0.5,
                    borderRadius: 0.5,
                    bgcolor: colors[index % colors.length],
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {label}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    sx={{ mt: 0.2, fontSize: 12 }}
                  >
                    {money(amount)} ({percentage.toFixed(1)}%)
                  </Typography>
                </Box>
              </Box>
            ))
          ) : (
            <Typography color="text.secondary" sx={{ fontSize: 13 }}>
              No data for this period.
            </Typography>
          )}
        </Stack>
      </Box>
    </ReportCard>
  );
}

function SalesSummary({ rows }) {
  return (
    <ReportCard title="Sales Summary">
      <DataGrid
        gridTemplateColumns="1.1fr 1fr .72fr .78fr 1fr 1fr"
        columns={[
          "Period",
          "Sales (MMK)",
          "Orders",
          "Items Sold",
          "Cost Price (MMK)",
          "Gross Profit (MMK)",
        ]}
        rows={rows.map((row) => [
          row.label,
          money(row.totalSales),
          money(row.orders),
          money(row.itemsSold),
          money(row.totalCostPrice),
          money(row.grossProfit),
        ])}
      />
    </ReportCard>
  );
}
function ComparisonTable({ comparison }) {
  return (
    <Box sx={{ mt: 2.25 }}>
      <ReportCard title="Sales Comparison">
        <DataGrid
          gridTemplateColumns="1.08fr 1fr 1fr .86fr .86fr"
          columns={["Metric", "This Month", "Last Month", "Change", "Growth"]}
          rows={comparison.map((row) => [
            row.metric,
            money(row.current),
            money(row.previous),
            `${row.change > 0 ? "+" : ""}${money(row.change)}`,
            growthText(row),
          ])}
          growthMetrics={comparison}
        />
      </ReportCard>
    </Box>
  );
}
function DataGrid({ columns, rows, growthMetrics, gridTemplateColumns }) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            gridTemplateColumns ?? `repeat(${columns.length}, minmax(0, 1fr))`,
          minHeight: 42,
          alignItems: "center",
          px: 1,
          columnGap: 0.45,
          bgcolor: "#f7f9fc",
        }}
      >
        {columns.map((column, index) => (
          <Typography
            key={column}
            sx={{
              color: "text.secondary",
              fontSize: 12,
              lineHeight: 1.2,
              fontWeight: 600,
              textTransform: "uppercase",
              textAlign: index === 0 ? "left" : "right",
            }}
          >
            {column}
          </Typography>
        ))}
      </Box>
      {rows.map((row, rowIndex) => (
        <Box
          key={`${row[0]}-${rowIndex}`}
          sx={{
            display: "grid",
            gridTemplateColumns:
              gridTemplateColumns ?? `repeat(${columns.length}, minmax(0, 1fr))`,
            minHeight: 45,
            alignItems: "center",
            px: 1,
            columnGap: 0.45,
            borderBottom: rowIndex === rows.length - 1 ? 0 : "1px solid",
            borderColor: "divider",
          }}
        >
          {row.map((cell, index) =>
            growthMetrics && index === row.length - 1 ? (
              <Box
                key={`${row[0]}-${index}`}
                sx={{
                  justifySelf: "end",
                  display: "inline-flex",
                  alignItems: "center",
                  px: 0.65,
                  py: 0.2,
                  borderRadius: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  ...growthSx(growthMetrics[rowIndex]),
                }}
              >
                {growthMetrics[rowIndex]?.percentage > 0
                  ? "↑ "
                  : growthMetrics[rowIndex]?.percentage < 0
                    ? "↓ "
                    : ""}
                {cell}
              </Box>
            ) : (
              <Typography
                key={`${row[0]}-${index}`}
                sx={{
                  color: "text.primary",
                  fontSize: 13.5,
                  lineHeight: 1.25,
                  fontWeight: index === 0 ? 600 : 500,
                  textAlign: index === 0 ? "left" : "right",
                  whiteSpace: "nowrap",
                }}
              >
                {cell}
              </Typography>
            ),
          )}
        </Box>
      ))}
    </Box>
  );
}
function ReportCard({ title, action, children }) {
  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mb: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 17, fontWeight: 600 }}>
            {title}
          </Typography>
          {action}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}
function Legend({ color, label, value }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.7 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: color }} />
      <Typography sx={{ color: "#334155", fontSize: 13, fontWeight: 500 }}>
        {label}
      </Typography>
      {value && (
        <Typography sx={{ color: "text.primary", fontSize: 13, fontWeight: 600 }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}
function EmptyReport() {
  return (
    <Card
      sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 2 }}
    >
      <CardContent
        sx={{
          minHeight: 250,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
            No completed sales in this period
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Complete an order or choose another date range to view analytics.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
function DatePopover({
  anchor,
  onClose,
  draftRange,
  setDraftRange,
  setRange,
  mobile = false,
}) {
  return (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{
        paper: {
          sx: {
            width: mobile ? "calc(100vw - 28px)" : 410,
            maxWidth: 410,
            p: 2,
            borderRadius: 2,
          },
        },
      }}
    >
      <Typography sx={{ fontSize: 16, fontWeight: 800, mb: 1.5 }}>
        Date and time
      </Typography>
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}
      >
        {[
          ["mtd", "This month"],
          ["today", "Today"],
          ["all", "All history"],
          ["custom", "Custom"],
        ].map(([mode, label]) => (
          <Button
            key={mode}
            variant="outlined"
            onClick={() => setDraftRange((current) => ({ ...current, mode }))}
            sx={{
              minHeight: 42,
              borderColor:
                draftRange.mode === mode ? "primary.main" : "divider",
              bgcolor: draftRange.mode === mode ? "#eaf3ff" : "transparent",
              color: draftRange.mode === mode ? "primary.main" : "text.primary",
              textTransform: "none",
              fontSize: 12,
            }}
          >
            {label}
          </Button>
        ))}
      </Box>
      {draftRange.mode === "custom" && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            mt: 1.5,
          }}
        >
          <TextField
            type="date"
            label="From"
            size="small"
            value={draftRange.from}
            onChange={(event) =>
              setDraftRange((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label="To"
            size="small"
            value={draftRange.to}
            onChange={(event) =>
              setDraftRange((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      )}
      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        sx={{ mt: 1.5 }}
      >
        <Button
          onClick={() => {
            const next = allHistoryRange();
            setDraftRange(next);
            setRange(next);
          }}
          sx={{ textTransform: "uppercase" }}
        >
          Reset
        </Button>
        <Button
          variant="contained"
          disabled={
            draftRange.mode === "custom" &&
            (!draftRange.from ||
              !draftRange.to ||
              draftRange.from > draftRange.to)
          }
          onClick={() => {
            setRange(draftRange);
            onClose();
          }}
          sx={{ textTransform: "uppercase" }}
        >
          Apply
        </Button>
      </Stack>
    </Popover>
  );
}
const cardSx = {
  minWidth: 0,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  boxShadow: "0 2px 9px rgba(15,23,42,.05)",
};
const toolbarButtonSx = {
  minHeight: 42,
  borderColor: "divider",
  color: "text.primary",
  borderRadius: 1.5,
  textTransform: "none",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
