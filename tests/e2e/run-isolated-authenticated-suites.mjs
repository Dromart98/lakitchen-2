import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const suites = process.argv.slice(2);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

if (suites.length === 0) {
  console.error("Provide at least one Playwright suite path.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const playwrightBaseEnv = { ...process.env };
delete playwrightBaseEnv.SUPABASE_SERVICE_ROLE_KEY;
let failed = false;

for (const suite of suites) {
  let userId = null;
  let suiteFailed = false;
  const email = `lakitchen-e2e-${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  process.stdout.write(`::add-mask::${password}\n`);

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("Temporary E2E user was not created.");
    userId = data.user.id;

    console.log(`\n=== Running isolated suite: ${suite} ===`);
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", suite],
      {
        stdio: "inherit",
        env: {
          ...playwrightBaseEnv,
          E2E_EMAIL: email,
          E2E_PASSWORD: password,
          E2E_USER_ID: userId,
        },
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) suiteFailed = true;
  } catch (error) {
    suiteFailed = true;
    console.error(`Isolated suite failed to run: ${suite}`);
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        suiteFailed = true;
        console.error(`Failed to delete temporary E2E user for ${suite}: ${error.message}`);
      }
    }
  }

  if (suiteFailed) failed = true;
}

process.exitCode = failed ? 1 : 0;
