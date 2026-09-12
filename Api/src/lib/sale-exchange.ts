import { Prisma } from "../generated/prisma/client.js";

type HistoricalOrderItem = {
  id: string;
  quantity: number;
  baseQuantity?: Prisma.Decimal | null;
  lineTotal: number;
};

type HistoricalOrder = {
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  items: HistoricalOrderItem[];
};

type ReturnedItem = { orderItemId: string; quantity: number };

export function historicalReturnedValue(order: HistoricalOrder, returnedItems: ReturnedItem[]): number {
  const selectedGross = returnedItems.reduce((sum, returned) => {
    const item = order.items.find((entry) => entry.id === returned.orderItemId);
    if (!item) throw new Error("Order item not found.");
    const soldQuantity = new Prisma.Decimal(item.baseQuantity ?? item.quantity);
    if (!soldQuantity.greaterThan(0)) throw new Error("Historical sold quantity is invalid.");
    return sum.plus(new Prisma.Decimal(item.lineTotal).mul(returned.quantity).div(soldQuantity));
  }, new Prisma.Decimal(0));

  if (order.subtotal <= 0) return 0;
  const netMerchandise = Math.max(0, order.subtotal - order.discount);
  return selectedGross
    .mul(netMerchandise)
    .div(order.subtotal)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function exchangeDifference(returnedValue: number, replacementValue: number): number {
  return replacementValue - returnedValue;
}
