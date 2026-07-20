import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateMealLogInput } from "@/modules/meals/meal-validation";

const migration = readFileSync(
  "supabase/migrations/20260720134858_allow_decimal_daily_meal_log_macros.sql",
  "utf8",
);

describe("daily meal log decimal storage", () => {
  it("stores calories and macros with one decimal place", () => {
    for (const column of ["calories", "protein_g", "carbs_g", "fat_g"]) {
      expect(migration).toContain(
        `alter column ${column} type numeric(10,1) using ${column}::numeric(10,1)`,
      );
    }
  });

  it("preserves validated decimal values before persistence", () => {
    const formData = new FormData();
    formData.set("name", "Comida estimada");
    formData.set("meal_type", "lunch");
    formData.set("calories", "121.8");
    formData.set("protein_g", "31.2");
    formData.set("carbs_g", "14.7");
    formData.set("fat_g", "5.3");

    expect(validateMealLogInput(formData)).toEqual({
      value: {
        name: "Comida estimada",
        mealType: "lunch",
        calories: 121.8,
        proteinG: 31.2,
        carbsG: 14.7,
        fatG: 5.3,
      },
    });
  });
});
