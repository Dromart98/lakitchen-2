import { describe, expect, it } from "vitest";

import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";

describe("meal macro summary", () => {
  it("returns zero consumed macros when there are no meal logs", () => {
    expect(sumMacros([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("sums meal logs and calculates remaining macros", () => {
    const consumed = sumMacros([
      { calories: 600, proteinG: 45, carbsG: 70, fatG: 12 },
      { calories: 150, proteinG: 10, carbsG: 20, fatG: 4 },
    ]);

    expect(consumed).toEqual({ calories: 750, proteinG: 55, carbsG: 90, fatG: 16 });
    expect(remainingMacros({ calories: 2290, proteinG: 160, carbsG: 280, fatG: 64 }, consumed)).toEqual({
      calories: 1540,
      proteinG: 105,
      carbsG: 190,
      fatG: 48,
    });
  });

  it("does not return negative remaining macros when consumed totals exceed the goal", () => {
    expect(remainingMacros(
      { calories: 500, proteinG: 30, carbsG: 40, fatG: 20 },
      { calories: 700, proteinG: 45, carbsG: 60, fatG: 25 },
    )).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});
