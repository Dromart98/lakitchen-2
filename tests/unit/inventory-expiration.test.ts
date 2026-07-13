import { describe, expect, it } from "vitest";

import {
  formatInventoryExpirationLabel,
  getInventoryExpirationAlertItems,
  getInventoryExpirationDayDifference,
} from "@/modules/inventory/inventory-expiration";
import type { InventoryItemRecord } from "@/modules/inventory/inventory.types";

function item(id: string, expires_at: string | null): InventoryItemRecord {
  return {
    id,
    name: `Producto ${id}`,
    location: "pantry",
    category: null,
    quantity: 1,
    unit: "ud",
    expires_at,
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

describe("inventory expiration helpers", () => {
  const todayKey = "2026-07-13";

  it("includes expired, today, tomorrow, and seven-day items while excluding eight-day and undated items", () => {
    const alertItems = getInventoryExpirationAlertItems([
      item("eight-days", "2026-07-21"),
      item("tomorrow", "2026-07-14"),
      item("undated", null),
      item("expired", "2026-07-11"),
      item("seven-days", "2026-07-20"),
      item("today", "2026-07-13"),
    ], todayKey);

    expect(alertItems.map((alertItem) => alertItem.id)).toEqual([
      "expired",
      "today",
      "tomorrow",
      "seven-days",
    ]);
  });

  it("formats expired items", () => {
    expect(formatInventoryExpirationLabel("2026-07-12", todayKey)).toBe("Caducado");
  });

  it("formats items that expire today", () => {
    expect(formatInventoryExpirationLabel("2026-07-13", todayKey)).toBe("Caduca hoy");
  });

  it("formats the one-day singular label", () => {
    expect(formatInventoryExpirationLabel("2026-07-14", todayKey)).toBe("Caduca en 1 día");
  });

  it("formats plural day labels", () => {
    expect(formatInventoryExpirationLabel("2026-07-16", todayKey)).toBe("Caduca en 3 días");
  });

  it("calculates day differences from UTC date keys independently from local timezone", () => {
    expect(getInventoryExpirationDayDifference("2026-03-30", "2026-03-29")).toBe(1);
    expect(getInventoryExpirationDayDifference("2026-10-26", "2026-10-25")).toBe(1);
  });
});
