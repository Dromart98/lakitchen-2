import type { InventoryItemRecord } from "./inventory.types";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const expirationFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function getCurrentInventoryExpirationDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getUtcDateKeyTimestamp(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

function normalizeDateKey(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString().slice(0, 10);
}

export function getInventoryExpirationDayDifference(expiresAt: string, todayKey: string): number {
  const expirationKey = normalizeDateKey(expiresAt);

  return Math.round((getUtcDateKeyTimestamp(expirationKey) - getUtcDateKeyTimestamp(todayKey)) / millisecondsPerDay);
}

export function formatInventoryExpirationLabel(expiresAt: string | null, todayKey: string): string {
  if (!expiresAt) return "Sin fecha de caducidad";

  const dayDifference = getInventoryExpirationDayDifference(expiresAt, todayKey);

  if (dayDifference < 0) return "Caducado";
  if (dayDifference === 0) return "Caduca hoy";
  if (dayDifference === 1) return "Caduca en 1 día";
  if (dayDifference <= 7) return `Caduca en ${dayDifference} días`;

  return expirationFormatter.format(new Date(`${expiresAt}T00:00:00.000Z`));
}

export function getInventoryExpirationAlertItems(
  items: InventoryItemRecord[],
  todayKey: string,
  windowDays = 7,
): InventoryItemRecord[] {
  return items
    .filter((item) => {
      if (!item.expires_at) return false;

      const dayDifference = getInventoryExpirationDayDifference(item.expires_at, todayKey);

      return dayDifference <= windowDays;
    })
    .sort((firstItem, secondItem) => {
      return getUtcDateKeyTimestamp(firstItem.expires_at ?? "") - getUtcDateKeyTimestamp(secondItem.expires_at ?? "");
    });
}
