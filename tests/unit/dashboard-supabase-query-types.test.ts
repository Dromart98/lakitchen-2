import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const dashboardPath = resolve(process.cwd(), "app/dashboard/page.tsx");
const mealEditPath = resolve(process.cwd(), "app/dashboard/meals/[id]/edit/page.tsx");
const supabaseServerPath = resolve(process.cwd(), "lib/supabase/server.ts");
const execFileAsync = promisify(execFile);

async function readSource(path: string) {
  return readFile(path, "utf8");
}

describe("dashboard Supabase query contracts", () => {
  it("keeps dashboard queries and removes unsafe client casts", async () => {
    const source = await readSource(dashboardPath);

    expect(source).not.toMatch(/supabase as any|as unknown as|eslint-disable/);
    expect(source).toContain('.from("user_nutrition_profiles")');
    expect(source).toContain('.select("target_calories, target_protein_g, target_carbs_g, target_fat_g")');
    expect(source).toContain('.from("daily_meal_logs")');
    expect(source).toContain('.select("id, name, calories, protein_g, carbs_g, fat_g, created_at, meal_type")');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('.maybeSingle()');
    expect(source).toContain('.eq("consumed_on", today)');
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain('.from("inventory_items")');
    expect(source).toContain('.select("id, name, location, category, nutrition_basis, calories, protein_g, carbs_g, fat_g, quantity, unit, expires_at, created_at")');
    expect(source).toContain('.gt("quantity", 0)');
    expect(source).toContain('.order("created_at", { ascending: true })');
    expect(source.match(/\.from\(/g)).toHaveLength(3);
    expect(source.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(3);
  });

  it("keeps the meal edit query scoped to its id, user, and date", async () => {
    const source = await readSource(mealEditPath);

    expect(source).not.toMatch(/supabase as any|as unknown as|eslint-disable/);
    expect(source).toContain('.from("daily_meal_logs")');
    expect(source).toContain('.select("id, name, meal_type, calories, protein_g, carbs_g, fat_g")');
    expect(source).toContain('.eq("id", id)');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('.eq("consumed_on", today)');
    expect(source).toContain('.maybeSingle()');
    expect(source.match(/\.from\(/g)).toHaveLength(1);
    expect(source.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(1);
  });

  it("does not modify the Supabase server client", async () => {
    await expect(execFileAsync("git", ["diff", "--quiet", "HEAD", "--", supabaseServerPath])).resolves.toBeDefined();
  });
});
