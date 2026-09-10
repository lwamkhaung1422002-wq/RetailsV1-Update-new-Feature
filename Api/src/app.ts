import cors from "cors";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler } from "./middleware/error.middleware.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { publicDemoRouter } from "./routes/public-demo.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { inventoryRouter } from "./routes/inventory.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { paymentsRouter } from "./routes/payments.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { purchasesRouter } from "./routes/purchases.routes.js";
import { shopSettingsRouter } from "./routes/shop-settings.routes.js";
import { shopsRouter } from "./routes/shops.routes.js";
import { storeConfigRouter } from "./routes/store-config.routes.js";
import { capabilityInventoryRouter } from "./routes/capability-inventory.routes.js";
import { advancedCapabilitiesRouter } from "./routes/advanced-capabilities.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { pricingRouter } from "./routes/pricing.routes.js";
import { productReportsRouter } from "./routes/product-reports.routes.js";
import { requestContext } from "./middleware/request-context.middleware.js";
import { enforceShopPermission } from "./middleware/shop-permission.middleware.js";
import { workspaceAlertsRouter } from "./routes/workspace-alerts.routes.js";
import { staffAccessRouter } from "./routes/staff-access.routes.js";

export const app = express();
app.set("trust proxy", 1);

const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const localOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? configuredOrigins
    : [...configuredOrigins, ...localOrigins];

function isAllowedDevelopmentOrigin(origin: string | undefined) {
  return Boolean(
    origin &&
      process.env.NODE_ENV !== "production" &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),
  );
}

function forbidden(message: string): Error {
  const error = new Error(message);
  error.name = "ForbiddenError";
  return error;
}

app.use(helmet());
app.use(requestContext);
app.use(
  pinoHttp({
    // Railway retains request logs. Keep timing and routing evidence while never
    // persisting credentials or provider proxy tokens in those logs.
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-nf-netlify-proxy']",
      "res.headers['set-cookie']",
    ],
  }),
);
app.use(compression());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(forbidden("Not allowed by CORS."));
    },
  }),
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Commerce API is running" });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/shops", publicDemoRouter);
app.use("/shops", requireAuth, enforceShopPermission);
app.use("/shops", shopsRouter);
app.use("/shops", staffAccessRouter);
app.use("/shops", storeConfigRouter);
app.use("/shops", capabilityInventoryRouter);
app.use("/shops", advancedCapabilitiesRouter);
app.use("/shops", auditRouter);
app.use("/shops", workspaceAlertsRouter);
app.use("/shops", pricingRouter);
app.use("/shops", productReportsRouter);
app.use("/shops", shopSettingsRouter);
app.use("/shops", customersRouter);
app.use("/shops", categoriesRouter);
app.use("/shops", productsRouter);
app.use("/shops", purchasesRouter);
app.use("/shops", inventoryRouter);
app.use("/shops", ordersRouter);
app.use("/shops", paymentsRouter);
app.use("/shops", expensesRouter);
app.use("/shops", dashboardRouter);

app.use(errorHandler);
