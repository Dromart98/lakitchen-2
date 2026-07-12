import { describe, expect, it } from "vitest";

import {
  formatSpanishUtcWeekRange,
  getNextUtcWeek,
  getPreviousUtcWeek,
  getUtcWeekDates,
  getUtcWeekMonday,
  getUtcWeekSunday,
  isUtcWeekAfterCurrentWeek,
  resolveWeeklySummaryDate,
} from "@/modules/meals/meal-week";

describe("weekly meal dates", () => {
  it("returns the same date for a Monday", () => {
    expect(getUtcWeekMonday("2026-07-06")).toBe("2026-07-06");
  });

  it("returns the previous Monday for a Sunday", () => {
    expect(getUtcWeekMonday("2026-07-12")).toBe("2026-07-06");
  });

  it("calculates the correct Sunday", () => {
    expect(getUtcWeekSunday("2026-07-08")).toBe("2026-07-12");
  });

  it("handles a week across two months", () => {
    expect(getUtcWeekMonday("2026-08-01")).toBe("2026-07-27");
    expect(getUtcWeekSunday("2026-08-01")).toBe("2026-08-02");
  });

  it("handles a week across two years", () => {
    expect(getUtcWeekMonday("2026-01-01")).toBe("2025-12-29");
    expect(getUtcWeekSunday("2026-01-01")).toBe("2026-01-04");
  });

  it("generates exactly seven dates from Monday to Sunday", () => {
    expect(getUtcWeekDates("2026-07-09")).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("calculates the previous week", () => {
    expect(getPreviousUtcWeek("2026-07-09")).toBe("2026-06-29");
  });

  it("calculates the next week", () => {
    expect(getNextUtcWeek("2026-07-09")).toBe("2026-07-13");
  });

  it("detects a future week", () => {
    expect(isUtcWeekAfterCurrentWeek("2026-07-13", "2026-07-12")).toBe(true);
    expect(isUtcWeekAfterCurrentWeek("2026-07-06", "2026-07-12")).toBe(false);
  });

  it("resolves invalid parameters to the current week", () => {
    expect(resolveWeeklySummaryDate("2026-02-31", "2026-07-12")).toEqual({
      selectedDate: "2026-07-12",
      weekStart: "2026-07-06",
      weekEnd: "2026-07-12",
      hasInvalidWeek: true,
    });
    expect(resolveWeeklySummaryDate("2026-07-13", "2026-07-12").hasInvalidWeek).toBe(true);
  });

  it("formats the weekly interval in Spanish", () => {
    expect(formatSpanishUtcWeekRange("2026-07-06", "2026-07-12")).toBe("Del 6 al 12 de julio de 2026");
    expect(formatSpanishUtcWeekRange("2026-06-29", "2026-07-05")).toBe("Del 29 de junio al 5 de julio de 2026");
    expect(formatSpanishUtcWeekRange("2025-12-29", "2026-01-04")).toBe("Del 29 de diciembre de 2025 al 4 de enero de 2026");
  });

  it("is independent from the local time zone", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";

    expect(getUtcWeekMonday("2026-03-30")).toBe("2026-03-30");
    expect(getUtcWeekSunday("2026-03-30")).toBe("2026-04-05");

    process.env.TZ = previousTimeZone;
  });
});
