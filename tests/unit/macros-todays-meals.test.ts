import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const pagePath = resolve(process.cwd(), "app/macros/page.tsx");

describe("macros today's meals", () => {
  it("loads only the authenticated user's meals for the application's current UTC day", async () => {
    const source = await readFile(pagePath, "utf8");
    const mealQuery = source.match(/\(supabase as any\)\.from\("daily_meal_logs"\)[\s\S]*?\.order\("created_at", \{ ascending: false \}\)/)?.[0];

    expect(mealQuery).toBeDefined();
    expect(source).toContain('import { getTodayUtcDate } from "@/modules/meals/meal-date";');
    expect(mealQuery).toContain('.select("id, name, meal_type, calories, protein_g, carbs_g, fat_g")');
    expect(mealQuery).toContain('.eq("user_id", user.id)');
    expect(mealQuery).toContain('.eq("consumed_on", today)');
    expect(mealQuery).toContain('.order("created_at", { ascending: false })');
  });

  it("renders the list after the registration tools with loaded, empty, and error states", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source.indexOf('className="macros-lower-grid"')).toBeLessThan(source.indexOf('className="card macros-today-meals"'));
    expect(source).toContain("Comidas registradas hoy");
    expect(source).toContain("Todavía no has registrado ninguna comida hoy.");
    expect(source).toContain("No se pudieron cargar las comidas registradas hoy. Inténtalo de nuevo.");
    expect(source).toContain("MEAL_TYPE_LABELS[normalizeMealType(meal.meal_type)]");
    expect(source).toContain("formatMealLogItemNutritionValue(meal.calories, 20)");
    expect(source).toContain("formatMealLogItemNutritionValue(meal.protein_g, 20)");
    expect(source).toContain("formatMealLogItemNutritionValue(meal.carbs_g, 20)");
    expect(source).toContain("formatMealLogItemNutritionValue(meal.fat_g, 20)");
  });
});
