import { describe, expect, it } from "vitest";

import {
  formatSpanishUtcDate,
  getNextUtcDate,
  getPreviousUtcDate,
  isPastMealHistoryDate,
  isRealUtcDate,
  isValidMealHistoryDate,
  resolveMealHistoryDate,
} from "@/modules/meals/meal-date";

describe("meal history dates", () => {
  it("accepts a valid date that is not in the future", () => {
    expect(isValidMealHistoryDate("2026-07-12", "2026-07-12")).toBe(true);
  });

  it("rejects an invalid format", () => {
    expect(isValidMealHistoryDate("12-07-2026", "2026-07-12")).toBe(false);
  });

  it("rejects a nonexistent date", () => {
    expect(isRealUtcDate("2026-02-31")).toBe(false);
    expect(resolveMealHistoryDate("2026-02-31", "2026-07-12")).toEqual({
      selectedDate: "2026-07-12",
      hasInvalidDate: true,
    });
  });

  it("rejects a future date", () => {
    expect(isValidMealHistoryDate("2026-07-13", "2026-07-12")).toBe(false);
  });

  it("accepts only real dates before today for repeating meals", () => {
    expect(isPastMealHistoryDate("2026-07-11", "2026-07-12")).toBe(true);
    expect(isPastMealHistoryDate("2026-07-12", "2026-07-12")).toBe(false);
    expect(isPastMealHistoryDate("2026-07-13", "2026-07-12")).toBe(false);
    expect(isPastMealHistoryDate("2026-02-31", "2026-07-12")).toBe(false);
    expect(isPastMealHistoryDate("12-07-2026", "2026-07-12")).toBe(false);
  });

  it("detects past meal history dates across month boundaries", () => {
    expect(isPastMealHistoryDate("2026-02-28", "2026-03-01")).toBe(true);
    expect(isPastMealHistoryDate("2026-03-01", "2026-03-01")).toBe(false);
  });

  it("detects past meal history dates across year boundaries", () => {
    expect(isPastMealHistoryDate("2025-12-31", "2026-01-01")).toBe(true);
    expect(isPastMealHistoryDate("2026-01-01", "2026-01-01")).toBe(false);
  });

  it("calculates the previous UTC day", () => {
    expect(getPreviousUtcDate("2026-07-12")).toBe("2026-07-11");
  });

  it("calculates the next UTC day", () => {
    expect(getNextUtcDate("2026-07-12")).toBe("2026-07-13");
  });

  it("handles month boundaries", () => {
    expect(getPreviousUtcDate("2026-03-01")).toBe("2026-02-28");
    expect(getNextUtcDate("2026-02-28")).toBe("2026-03-01");
  });

  it("handles year boundaries", () => {
    expect(getPreviousUtcDate("2026-01-01")).toBe("2025-12-31");
    expect(getNextUtcDate("2026-12-31")).toBe("2027-01-01");
  });

  it("formats dates independently from the local time zone", () => {
    expect(formatSpanishUtcDate("2026-01-01")).toContain("2026");
    expect(getPreviousUtcDate("2026-01-01")).toBe("2025-12-31");
  });
});
