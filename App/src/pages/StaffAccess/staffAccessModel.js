export const STAFF_ROLES = ["MANAGER", "CASHIER", "STOCK_STAFF"];

export const ROLE_META = {
  OWNER: { label: "Owner", color: "#7c3aed", background: "#f1e9ff", description: "Full access across all branches" },
  MANAGER: { label: "Manager", color: "#087cf0", background: "#e8f3ff", description: "Management and approval access" },
  CASHIER: { label: "Cashier", color: "#059669", background: "#e5f9ef", description: "Sales and basic operations" },
  STOCK_STAFF: { label: "Stock Staff", color: "#d97706", background: "#fff1dc", description: "Inventory and stock operations" },
};

export const PERMISSION_GROUPS = [
  {
    id: "sales",
    title: "Sales & Orders",
    description: "Manage sales and orders",
    color: "#087cf0",
    background: "#e8f3ff",
    permissions: [
      ["sale.create", "Create sales"],
      ["order.view", "View orders"],
      ["order.fulfill", "Complete orders"],
      ["order.cancel", "Cancel orders"],
    ],
  },
  {
    id: "payments",
    title: "Payments",
    description: "Manage payment transactions",
    color: "#06a66a",
    background: "#e8faef",
    permissions: [
      ["payment.view", "View payments"],
      ["payment.receive", "Receive payments"],
      ["payment.refund", "Refund payments"],
      ["payment.void", "Void payments"],
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Manage stock and inventory",
    color: "#f07a0a",
    background: "#fff2e1",
    permissions: [
      ["stock.view", "View stock"],
      ["stock.receive", "Receive stock"],
      ["stock.adjust", "Adjust stock"],
    ],
  },
  {
    id: "products",
    title: "Products & Pricing",
    description: "Manage products and pricing",
    color: "#8b3ff2",
    background: "#f3eaff",
    permissions: [
      ["product.view", "View products"],
      ["product.manage", "Manage products"],
      ["price.view", "View prices"],
      ["price.edit", "Edit prices"],
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers & Expenses",
    description: "Manage purchasing and expenses",
    color: "#ed3973",
    background: "#ffe9f0",
    permissions: [
      ["supplier.view", "View suppliers"],
      ["supplier.manage", "Manage suppliers"],
      ["supplier.pay", "Record supplier payments"],
      ["purchase.view", "View purchases"],
      ["purchase.manage", "Manage purchases"],
      ["expense.view", "View expenses"],
      ["expense.manage", "Manage expenses"],
    ],
  },
  {
    id: "reports",
    title: "Reports",
    description: "Review business performance",
    color: "#0aa6b5",
    background: "#e5f8fa",
    permissions: [
      ["report.viewSales", "View sales reports"],
      ["report.viewCost", "View cost reports"],
      ["report.viewProfit", "View profit reports"],
    ],
  },
  {
    id: "settings",
    title: "Settings & Administration",
    description: "Manage business configuration",
    color: "#4f6695",
    background: "#edf2fa",
    permissions: [
      ["settings.manage", "Manage settings"],
      ["staff.manage", "Manage staff"],
      ["branch.manage", "Manage branches"],
    ],
  },
  {
    id: "audit",
    title: "Audit & Logs",
    description: "Review operational activity",
    color: "#7c3aed",
    background: "#f1e9ff",
    permissions: [["audit.view", "View audit logs"]],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key]) => key));

export const DEFAULT_ROLE_PERMISSIONS = {
  MANAGER: ALL_PERMISSION_KEYS.filter((permission) => !["staff.manage", "branch.manage"].includes(permission)),
  CASHIER: [
    "sale.create",
    "order.view",
    "order.fulfill",
    "payment.view",
    "payment.receive",
    "stock.view",
    "product.view",
    "price.view",
    "report.viewSales",
  ],
  STOCK_STAFF: [
    "order.view",
    "stock.view",
    "stock.receive",
    "stock.adjust",
    "product.view",
    "product.manage",
    "supplier.view",
    "purchase.view",
    "purchase.manage",
  ],
};

export const APPROVAL_RULES = [
  ["Payment refund", "Manager / Owner"],
  ["Order cancellation", "Manager / Owner"],
  ["Stock adjustment", "Manager / Owner"],
  ["Price override", "Manager / Owner"],
  ["Supplier payment reversal", "Manager / Owner"],
];

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

const avatarTones = [
  ["#e7f2ff", "#087cf0"],
  ["#e3f9ef", "#079669"],
  ["#ffe8ef", "#e31b54"],
  ["#f0e9ff", "#7137d7"],
  ["#fff0dc", "#c45f00"],
  ["#e1f6f4", "#08788c"],
];

export function avatarTone(value = "") {
  const index = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarTones.length;
  return { background: avatarTones[index][0], color: avatarTones[index][1] };
}

export function uniqueStaffRows(assignments = []) {
  const ownerIds = new Set();
  return assignments.reduce((rows, member) => {
    if (member.role === "OWNER") {
      const ownerId = member.user?.id || member.id;
      if (ownerIds.has(ownerId)) return rows;
      ownerIds.add(ownerId);
      rows.push({ ...member, id: `owner:${ownerId}`, branch: { id: "all", name: "All Branches" } });
      return rows;
    }
    rows.push(member);
    return rows;
  }, []);
}

export function samePermissions(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((permission) => rightSet.has(permission));
}
