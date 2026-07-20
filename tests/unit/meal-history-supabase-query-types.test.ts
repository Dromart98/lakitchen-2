import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actionsPath = resolve(process.cwd(), "app/meal-history/actions.ts");
const pagePath = resolve(process.cwd(), "app/meal-history/page.tsx");

async function readSource(path: string) {
  return readFile(path, "utf8");
}

describe("meal history Supabase query contracts", () => {
  it("uses the typed client directly and keeps the repeat action scoped to a past source meal", async () => {
    const source = await readSource(actionsPath);
    const sourceQuery = source.match(/const \{ data: sourceMeal, error: sourceMealError \} = await supabase[\s\S]*?\.maybeSingle\(\)/)?.[0];

    expect(source).not.toMatch(/supabase as any|as unknown as|eslint-disable/);
    expect(sourceQuery).toBeDefined();
    expect(sourceQuery).toContain('.from("daily_meal_logs")');
    expect(sourceQuery).toContain('.select("id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on")');
    expect(sourceQuery).toContain('.eq("id", id)');
    expect(sourceQuery).toContain('.eq("user_id", user.id)');
    expect(sourceQuery).toContain('.eq("consumed_on", sourceDate)');
    expect(sourceQuery).toContain('.lt("consumed_on", today)');
    expect(sourceQuery).toContain('.maybeSingle()');

    expect(source).toContain(`.insert({
    user_id: user.id,
    name: sourceMeal.name,
    meal_type: normalizeMealType(sourceMeal.meal_type),
    calories: sourceMeal.calories,
    protein_g: sourceMeal.protein_g,
    carbs_g: sourceMeal.carbs_g,
    fat_g: sourceMeal.fat_g,
    consumed_on: today,
  })`);
  });

  it("keeps the two meal history queries isolated with their columns, filters, and orders", async () => {
    const source = await readSource(pagePath);
    const mealLogsQuery = source.match(/const \{ data: mealLogs, error: mealLogsError \} = await supabase[\s\S]*?\.order\("created_at", \{ ascending: false \}\)/)?.[0];
    const mealItemsQuery = source.match(/const \{ data: mealItems, error \} = await supabase[\s\S]*?\.order\("source_inventory_item_id", \{ ascending: true \}\)/)?.[0];

    expect(source).not.toMatch(/supabase as any|as unknown as|eslint-disable/);
    expect(source.match(/\.from\(/g)).toHaveLength(2);
    expect(mealLogsQuery).toBeDefined();
    expect(mealLogsQuery).toContain('.from("daily_meal_logs")');
    expect(mealLogsQuery).toContain('.select("id, name, meal_type, calories, protein_g, carbs_g, fat_g, created_at, consumed_on")');
    expect(mealLogsQuery).toContain('.eq("user_id", user.id)');
    expect(mealLogsQuery).toContain('.eq("consumed_on", selectedDate)');
    expect(mealLogsQuery).toContain('.order("created_at", { ascending: false })');

    expect(mealItemsQuery).toBeDefined();
    expect(mealItemsQuery).toContain('.from("daily_meal_log_items")');
    expect(mealItemsQuery).toContain('.select("id, meal_log_id, source_inventory_item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g, created_at")');
    expect(mealItemsQuery).toContain('.in("meal_log_id", mealIds)');
    expect(mealItemsQuery).toContain('.order("product_name", { ascending: true })');
    expect(mealItemsQuery).toContain('.order("source_inventory_item_id", { ascending: true })');
  });
});
