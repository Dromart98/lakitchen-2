import type { InventoryItem } from "./inventory.types";

export function daysUntilExpiration(item: Pick<InventoryItem, "expirationDate">, today = new Date()): number | null {
  if (!item.expirationDate) return null;
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const exp = new Date(item.expirationDate);
  const target = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  return Math.ceil((target - current) / 86_400_000);
}

export function getExpiringItems(items: InventoryItem[], windowDays = 3, today = new Date()): InventoryItem[] {
  return items.filter((item) => {
    const days = daysUntilExpiration(item, today);
    return item.status === "available" && days !== null && days >= 0 && days <= windowDays;
  }).sort((a, b) => (daysUntilExpiration(a, today) ?? 999) - (daysUntilExpiration(b, today) ?? 999));
}

export function consumeInventory(item: InventoryItem, quantity: number): InventoryItem {
  if (quantity <= 0) throw new Error("La cantidad a consumir debe ser positiva.");
  if (item.quantity < quantity) throw new Error("Inventario insuficiente.");
  const nextQuantity = Number((item.quantity - quantity).toFixed(2));
  return { ...item, quantity: nextQuantity, status: nextQuantity === 0 ? "consumed" : nextQuantity <= 1 ? "low" : item.status };
}
