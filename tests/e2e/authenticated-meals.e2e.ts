import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

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

async function readWeeklyCalories(page: Page) {
  await page.goto("/weekly-summary");
  const raw = await page.locator("#weekly-summary-overview-heading strong").textContent();
  const value = Number((raw ?? "").trim().replace(",", "."));
  expect(Number.isFinite(value), `Invalid weekly calorie total: ${raw ?? "empty"}`).toBe(true);
  return value;
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("MEALS-LIFECYCLE: crear, editar, persistir, propagar y eliminar", async ({ page }) => {
  const stamp = Date.now();
  const initialName = `E2E comida inicial ${stamp}`;
  const editedName = `E2E comida editada ${stamp}`;
  const baselineWeeklyCalories = await readWeeklyCalories(page);

  await page.goto("/macros");
  const manualPanel = page.locator("#meal-panel-manual");
  await manualPanel.getByLabel("Nombre").fill(initialName);
  await manualPanel.getByLabel("Tipo de comida").selectOption("lunch");
  await manualPanel.getByLabel("Calorías").fill("320");
  await manualPanel.getByLabel("Proteína (g)").fill("24");
  await manualPanel.getByLabel("Carbohidratos (g)").fill("40");
  await manualPanel.getByLabel("Grasas (g)").fill("8");
  await manualPanel.getByRole("button", { name: "Guardar solo macros" }).click();
  await expect(manualPanel.getByRole("status")).toContainText("Comida registrada correctamente.");

  let macrosMeal = page.locator(".macros-today-meal", { hasText: initialName });
  await expect(macrosMeal).toContainText("320 kcal · P 24 g · C 40 g · G 8 g");
  await page.reload();
  macrosMeal = page.locator(".macros-today-meal", { hasText: initialName });
  await expect(macrosMeal).toBeVisible();

  expect(await readWeeklyCalories(page)).toBeCloseTo(baselineWeeklyCalories + 320, 5);

  await page.goto("/dashboard");
  const initialItem = page.locator(".dashboard-meal-item", { hasText: initialName });
  await expect(initialItem).toContainText("320 kcal");
  await initialItem.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar comida" })).toBeVisible();

  await page.getByLabel("Nombre").fill(editedName);
  await page.getByLabel("Tipo de comida").selectOption("dinner");
  await page.getByLabel("Calorías").fill("333");
  await page.getByLabel("Proteína (g)").fill("30");
  await page.getByLabel("Carbohidratos (g)").fill("41");
  await page.getByLabel("Grasas (g)").fill("9");
  await Promise.all([
    page.waitForURL(/\/dashboard\?mealSuccess=meal-updated$/),
    page.getByRole("button", { name: "Guardar cambios" }).click(),
  ]);

  const editedItem = page.locator(".dashboard-meal-item", { hasText: editedName });
  await expect(editedItem).toContainText("333 kcal");
  await expect(editedItem).toContainText("Proteína 30 g · Carbohidratos 41 g · Grasas 9 g");
  await expect(page.locator(".dashboard-meal-item", { hasText: initialName })).toHaveCount(0);

  await page.goto("/macros");
  await expect(page.locator(".macros-today-meal", { hasText: editedName })).toContainText("333 kcal · P 30 g · C 41 g · G 9 g");
  await expect(page.locator(".macros-today-meal", { hasText: initialName })).toHaveCount(0);

  await page.goto("/meal-history");
  const historyMeal = page.locator(".meal-history-meal", { hasText: editedName });
  await expect(historyMeal).toBeVisible();
  await expect(historyMeal).toContainText("333 kcal");
  await expect(page.locator(".meal-history-meal", { hasText: initialName })).toHaveCount(0);

  expect(await readWeeklyCalories(page)).toBeCloseTo(baselineWeeklyCalories + 333, 5);

  await page.goto("/dashboard");
  const itemToDelete = page.locator(".dashboard-meal-item", { hasText: editedName });
  await Promise.all([
    page.waitForURL(/\/dashboard\?mealSuccess=meal-deleted$/),
    itemToDelete.getByRole("button", { name: "Eliminar comida" }).click(),
  ]);
  await expect(page.locator(".dashboard-meal-item", { hasText: editedName })).toHaveCount(0);

  await page.goto("/macros");
  await expect(page.locator(".macros-today-meal", { hasText: editedName })).toHaveCount(0);
  await page.goto("/meal-history");
  await expect(page.locator(".meal-history-meal", { hasText: editedName })).toHaveCount(0);
  expect(await readWeeklyCalories(page)).toBeCloseTo(baselineWeeklyCalories, 5);
});

test("MEALS-DATE-BOUNDARIES: rechaza fechas futuras en historial y resumen semanal", async ({ page }) => {
  await page.goto("/meal-history?date=2999-01-01");
  await expect(page.getByRole("alert")).toContainText("Selecciona una fecha válida que no sea futura.");
  await expect(page.locator("#history-date")).not.toHaveValue("2999-01-01");
  await expect(page.getByText("Día siguiente · No disponible")).toBeVisible();

  await page.goto("/weekly-summary?week=2999-01-01");
  await expect(page.getByRole("alert")).toContainText("Selecciona una semana válida que no sea futura.");
  await expect(page.locator("#weekly-summary-week")).not.toHaveValue("2999-01-01");
  await expect(page.getByText("Semana siguiente · No disponible")).toBeVisible();
});
