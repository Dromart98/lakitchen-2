import { describe, expect, it } from "vitest";
import { canCookSavedPlanOnDate, formatPlanDateLabel, getPlanDateOptions, isValidDateKey } from "@/modules/plans/plan-date";

describe("plan date helpers", () => {
  const today = "2026-12-29";
  it("validates real date keys", () => {
    expect(isValidDateKey("2026-07-19")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-07-01T00:00:00Z")).toBe(false);
  });
  it("always creates seven chronological options", () => {
    expect(getPlanDateOptions(today)).toEqual(["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04"]);
    expect(formatPlanDateLabel(today, today)).toMatch(/^Hoy,/);
    expect(formatPlanDateLabel("2026-12-30", today)).toMatch(/^Mañana,/);
  });
  it("only allows cooking today or in the past", () => {
    expect(canCookSavedPlanOnDate(today, today)).toBe(true);
    expect(canCookSavedPlanOnDate("2026-12-28", today)).toBe(true);
    expect(canCookSavedPlanOnDate("2026-12-30", today)).toBe(false);
    expect(canCookSavedPlanOnDate("2027-01-04", today)).toBe(false);
    expect(canCookSavedPlanOnDate("invalid", today)).toBe(false);
  });
});
