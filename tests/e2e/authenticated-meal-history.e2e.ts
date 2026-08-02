import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const seedDate = process.env.E2E_HISTORY_SEED_DATE;
const seedName = process.env.E2E_HISTORY_SEED_NAME;
const seedCalories = process.env.E2E_HISTORY_SEED_CALORIES;
const seedProtein = process.env.E2E_HISTORY_SEED_PROTEIN;
const seedCarbs = process.env.E2E_HISTORY_SEED_CARBS;
const seedFat = process.env.E2E_HISTORY_SEED_FAT;

async function logIn(page: Page) {
  expect(email, "E2E_EMAIL must be provided by the runner").toBeTruthy();
  expect(password, "E2E_PASSWORD must be provided by the runner").toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
}

function requireSeedEnv() {
  expect(seedDate, "E2E_HISTORY_SEED_DATE must be provided by the runner").toBeTruthy();
  expect(seedName, "E2E_HISTORY_SEED_NAME must be provided by the runner").toBeTruthy();
  expect(seedCalories, "E2E_HISTORY_SEED_CALORIES must be provided by the runner").toBeTruthy();
  expect(seedProtein, "E2E_HISTORY_SEED_PROTEIN must be provided by the runner").toBeTruthy();
  expect(seedCarbs, "E2E_HISTORY_SEED_CARBS must be provided by the runner").toBeTruthy();
  expect(seedFat, "E2E_HISTORY_SEED_FAT must be provided by the runner").toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("MEAL-HISTORY-LIFECYCLE: revisar un día anterior, repetir hoy y conservar el original", async ({ page }) => {
  test.setTimeout(90_000);
  requireSeedEnv();

  await page.goto(`/meal-history?date=${seedDate}`);
  await expect(page.locator("#history-date")).toHaveValue(seedDate!);
  await expect(page.locator("#meal-history-summary-heading strong")).toHaveText(seedCalories!);
  await expect(page.getByText("1 comida registrada", { exact: true })).toBeVisible();

  const sourceMeal = page.locator(".meal-history-meal", { hasText: seedName! });
  await expect(sourceMeal).toBeVisible();
  await expect(sourceMeal).toContainText(`${seedCalories} kcal`);
  await expect(sourceMeal).toContainText(`Proteína ${seedProtein}g`);
  await expect(sourceMeal).toContainText(`Carbohidratos ${seedCarbs}g`);
  await expect(sourceMeal).toContainText(`Grasas ${seedFat}g`);
  await expect(page.getByRole("heading", { name: "Comida", exact: true })).toBeVisible();
  await expect(sourceMeal.getByRole("button", { name: "Repetir hoy" })).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/dashboard\?mealSuccess=meal-repeated$/),
    sourceMeal.getByRole("button", { name: "Repetir hoy" }).click(),
  ]);

  let repeatedMeal = page.locator(".dashboard-meal-item", { hasText: seedName! });
  await expect(repeatedMeal).toBeVisible();
  await expect(repeatedMeal).toContainText(`${seedCalories} kcal`);
  await page.reload();
  repeatedMeal = page.locator(".dashboard-meal-item", { hasText: seedName! });
  await expect(repeatedMeal).toBeVisible();

  await page.goto("/macros");
  await expect(page.locator(".macros-today-meal", { hasText: seedName! })).toContainText(
    `${seedCalories} kcal · P ${seedProtein} g · C ${seedCarbs} g · G ${seedFat} g`,
  );

  await page.goto("/meal-history");
  const todayMeal = page.locator(".meal-history-meal", { hasText: seedName! });
  await expect(todayMeal).toBeVisible();
  await expect(todayMeal.getByRole("button", { name: "Repetir hoy" })).toHaveCount(0);

  await page.goto(`/meal-history?date=${seedDate}`);
  await expect(page.locator(".meal-history-meal", { hasText: seedName! })).toBeVisible();
  await expect(page.getByText("1 comida registrada", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Día siguiente" }).click();
  await expect(page.locator("#history-date")).not.toHaveValue(seedDate!);
  await expect(page.locator(".meal-history-meal", { hasText: seedName! })).toBeVisible();
});
