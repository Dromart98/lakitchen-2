import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718000000_raise_meal_builder_item_limit_to_20.sql"),
  "utf8",
);
const action = readFileSync(resolve(process.cwd(), "app/meal-builder/actions.ts"), "utf8");
const builder = readFileSync(resolve(process.cwd(), "components/meals/InventoryMealBuilder.tsx"), "utf8");
const macroRecorder = readFileSync(resolve(process.cwd(), "components/macros/MacroMealRecorder.tsx"), "utf8");

describe("meal builder consumption RPC contract", () => {
  it("sends one atomic RPC per submission and retains each flow's allowlisted return path", () => {
    expect(action.match(/\.rpc\("consume_meal_builder_items_and_log_meal"/g)).toHaveLength(1);
    expect(action).toContain('revalidatePath("/inventory")');
    expect(action).toContain('revalidatePath("/meal-history")');
    expect(builder).toContain('name="return_to"');
    expect(builder).toContain('JSON.stringify(consumptionPayload ?? [])');
    expect(macroRecorder).toContain('returnPath="/macros"');
  });

  it("uses the authenticated user, locks inventory rows, and returns one meal UUID", () => {
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("and user_id = v_user_id");
    expect(migration).toContain("for update");
    expect(migration).toContain("return v_meal_log_id");
  });

  it("creates the meal and snapshots before atomically applying exact inventory deductions", () => {
    expect(migration).toContain("insert into public.daily_meal_logs");
    expect(migration).toContain("insert into public.daily_meal_log_items");
    expect(migration).toContain("v_remaining_quantity := v_line.available_quantity - v_line.consumed_quantity");
    expect(migration).toContain("if v_remaining_quantity = 0 then");
    expect(migration).toContain("update public.inventory_items");
  });

  it("rejects over-consumption and rolls back the transaction when a later line fails", () => {
    expect(migration).toContain("raise exception using errcode = '22003', message = 'Quantity exceeds available stock'");
    expect(migration).toContain("raise exception using errcode = 'P0002', message = 'Inventory item not found'");
  });
});
