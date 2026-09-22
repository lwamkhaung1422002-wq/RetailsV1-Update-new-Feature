export function calculateOrderTotals(items, deliveryFee = 0) {
  const quantity = items.reduce((total, item) => total + item.quantity, 0);
  const itemsTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const discount = items.reduce((total, item) => total + (item.promotion.type === "discount" ? item.promotion.value : 0), 0);
  return { quantity, itemsTotal, discount, deliveryFee, total: itemsTotal - discount + deliveryFee };
}

export function checkoutCustomerError(paymentMethod, otherPayment, customerId) {
  return paymentMethod === "other" && ["unpaid", "partial"].includes(otherPayment) && !customerId
    ? "Please select a customer for unpaid or partial orders."
    : "";
}

export function checkoutOrderFields(selectedCustomer, deliveryFee) {
  return { deliveryFee, ...(selectedCustomer?.id ? { customerId: selectedCustomer.id } : {}) };
}

export function filterCustomerOptions(options, inputValue) {
  const query = inputValue.trim().toLowerCase();
  if (!query) return options;
  return options
    .filter((customer) => [customer.name, customer.phone].filter(Boolean).some((field) => String(field).toLowerCase().includes(query)))
    .sort((left, right) => {
      const leftStarts = [left.name, left.phone].filter(Boolean).some((field) => String(field).toLowerCase().startsWith(query));
      const rightStarts = [right.name, right.phone].filter(Boolean).some((field) => String(field).toLowerCase().startsWith(query));
      return Number(rightStarts) - Number(leftStarts) || left.name.localeCompare(right.name);
    });
}
