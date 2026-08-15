import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const actionsPath = resolve(process.cwd(), "app/dashboard/actions.ts");
const supabaseServerPath = resolve(process.cwd(), "lib/supabase/server.ts");
const execFileAsync = promisify(execFile);

describe("dashboard meal action Supabase contracts", () => {
  it("uses the typed client directly while preserving meal writes and update isolation", async () => {
    const source = await readFile(actionsPath, "utf8");

    expect(source).not.toMatch(/supabase as any|as unknown as|eslint-disable/);
    expect(source).toContain('await requireAuthenticatedUser(supabase, "dashboard meal log")');
    expect(source).toContain('const user = await requireAuthenticatedUser(supabase, "dashboard meal update")');
    expect(source.match(/\.from\("daily_meal_logs"\)/g)).toHaveLength(2);

    expect(source).toContain('.rpc("create_macro_meal_log_idempotently", {');
    expect(source).toContain('p_request_id: requestId,');
    expect(source).toContain('.update({\n      name,');
    expect(source).toContain('.eq("id", id)\n    .eq("user_id", user.id)\n    .eq("consumed_on", today)');
    expect(source).toContain('.delete()\n    .eq("id", id)\n    .eq("user_id", user.id)');

    expect(source).toContain(`name,
      meal_type: mealType,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,`);

    expect(source).toContain('revalidatePath(DASHBOARD_PATH);');
    expect(source).toContain('revalidatePath("/meal-history");');
    expect(source).toContain('redirect(`${DASHBOARD_PATH}?mealSuccess=meal-updated`);');
  });

  it("does not modify the Supabase server client", async () => {
    await expect(execFileAsync("git", ["diff", "--quiet", "HEAD", "--", supabaseServerPath])).resolves.toBeDefined();
  });
});
