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

function getUtcDateOffset(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function suiteFilename(suite) {
  return suite.split(/[\\/]/).pop();
}

function isAuthSuite(suite) {
  return suiteFilename(suite) === "authenticated-auth.e2e.ts";
}

async function insertMealSeed(userId, consumedOn, name) {
  const seed = {
    name,
    meal_type: "lunch",
    calories: 420,
    protein_g: 32,
    carbs_g: 48,
    fat_g: 11,
    consumed_on: consumedOn,
  };

  const { error } = await admin.from("daily_meal_logs").insert({
    user_id: userId,
    ...seed,
  });
  if (error) throw new Error(`Meal seed failed: ${error.message}`);
  return seed;
}

async function buildSuiteSeedEnv(suite, userId) {
  const filename = suiteFilename(suite);

  if (filename === "authenticated-meal-history.e2e.ts") {
    const seed = await insertMealSeed(userId, getUtcDateOffset(-1), `E2E historial ${randomUUID()}`);
    return {
      E2E_HISTORY_SEED_DATE: seed.consumed_on,
      E2E_HISTORY_SEED_NAME: seed.name,
      E2E_HISTORY_SEED_CALORIES: String(seed.calories),
      E2E_HISTORY_SEED_PROTEIN: String(seed.protein_g),
      E2E_HISTORY_SEED_CARBS: String(seed.carbs_g),
      E2E_HISTORY_SEED_FAT: String(seed.fat_g),
    };
  }

  if (filename === "authenticated-auth.e2e.ts") {
    const seed = await insertMealSeed(userId, getUtcDateOffset(0), `E2E auth cascade ${randomUUID()}`);
    return { E2E_AUTH_SEED_NAME: seed.name };
  }

  return {};
}

async function getTemporaryUser(userId) {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user ?? null;
}

async function verifyDeletedAccount(userId) {
  const user = await getTemporaryUser(userId);
  if (user) throw new Error("Account deletion verification failed: Auth user still exists.");

  const { count, error } = await admin
    .from("daily_meal_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Account cascade verification failed: ${error.message}`);
  if ((count ?? 0) !== 0) throw new Error("Account cascade verification failed: dependent meal data still exists.");

  console.log("[PASS] AUTH-ADMIN-VERIFICATION: usuario eliminado y datos dependientes en cascada");
}

async function cleanupTemporaryUser(userId, suite) {
  const user = await getTemporaryUser(userId);
  if (!user) return null;
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return `Failed to delete temporary E2E user for ${suite}: ${error.message}`;
  return null;
}

for (const suite of suites) {
  let userId = null;
  let suiteFailed = false;
  const authSuite = isAuthSuite(suite);
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
    const suiteSeedEnv = await buildSuiteSeedEnv(suite, userId);

    console.log(`\n=== Running isolated suite: ${suite} ===`);
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", suite],
      {
        stdio: "inherit",
        env: {
          ...playwrightBaseEnv,
          ...suiteSeedEnv,
          E2E_EMAIL: email,
          E2E_PASSWORD: password,
          E2E_USER_ID: userId,
        },
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      suiteFailed = true;
    } else if (authSuite) {
      await verifyDeletedAccount(userId);
    }
  } catch (error) {
    suiteFailed = true;
    console.error(`Isolated suite failed to run: ${suite}`);
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (userId) {
      const cleanupError = await cleanupTemporaryUser(userId, suite);
      if (cleanupError) {
        suiteFailed = true;
        console.error(cleanupError);
      }
    }
  }

  if (suiteFailed) failed = true;
}

process.exitCode = failed ? 1 : 0;
