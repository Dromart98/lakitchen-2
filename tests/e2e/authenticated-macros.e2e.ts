import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

const blockedAiMessages = /no está disponible ahora|tardó demasiado|no se pudo calcular la estimación|ocurrió un error inesperado/i;

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

async function addInventoryItem(
  page: Page,
  item: {
    name: string;
    quantity: string;
    nutrition?: { calories: string; protein?: string; carbs?: string; fat?: string };
  },
) {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Añadir producto" }).click();
  await page.locator("#inventory-name").fill(item.name);
  await page.locator("#inventory-quantity").fill(item.quantity);
  await page.locator("#inventory-unit").selectOption("g");
  if (item.nutrition) {
    await page.locator("#inventory-nutrition-basis").selectOption("per_100g");
    await page.locator("#inventory-calories").fill(item.nutrition.calories);
    if (item.nutrition.protein !== undefined) await page.locator("#inventory-protein-g").fill(item.nutrition.protein);
    if (item.nutrition.carbs !== undefined) await page.locator("#inventory-carbs-g").fill(item.nutrition.carbs);
    if (item.nutrition.fat !== undefined) await page.locator("#inventory-fat-g").fill(item.nutrition.fat);
  }
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("status")).toContainText("Producto añadido al inventario correctamente");
}

async function skipIfAiIsUnavailable(panel: Locator) {
  const alert = panel.getByRole("alert").first();
  if (await alert.isVisible().catch(() => false)) {
    const message = (await alert.textContent()) ?? "";
    test.skip(blockedAiMessages.test(message), `BLOCKED: servicio de análisis no disponible: ${message}`);
  }
}

async function expectPhotoReview(panel: Locator) {
  const heading = panel.getByRole("heading", { name: "Revisa los ingredientes detectados" });
  if (await heading.isVisible().catch(() => false)) return;

  const alert = panel.getByRole("alert").first();
  if (await alert.isVisible().catch(() => false)) {
    const message = ((await alert.textContent()) ?? "").trim();
    throw new Error(`El análisis de foto no produjo una revisión confirmable. Estado visible: ${message || "alerta vacía"}`);
  }

  await expect(heading).toBeVisible();
}

async function confirmAiMacros(page: Page, panel: Locator) {
  await expect(panel.getByText("Estimación orientativa")).toBeVisible();
  const form = panel.locator("form.text-ai-confirm");
  await expect(form).toBeVisible();

  const values = {
    name: await form.locator('input[name="name"]').inputValue(),
    calories: await form.locator('input[name="calories"]').inputValue(),
    protein: await form.locator('input[name="protein_g"]').inputValue(),
    carbs: await form.locator('input[name="carbs_g"]').inputValue(),
    fat: await form.locator('input[name="fat_g"]').inputValue(),
  };
  for (const value of Object.values(values)) expect(value).not.toBe("");

  await form.locator('select[name="meal_type"]').selectOption("other");
  await form.getByRole("button", { name: "Registrar solo macros" }).click();
  await expect(page.getByRole("status")).toContainText("Comida registrada correctamente");

  const meal = page.locator(".macros-today-meal", { hasText: values.name });
  await expect(meal).toBeVisible();
  const format = (value: string) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 20 }).format(Number(value));
  await expect(meal).toContainText(`${format(values.calories)} kcal · P ${format(values.protein)} g · C ${format(values.carbs)} g · G ${format(values.fat)} g`);
  await page.reload();
  await expect(page.locator(".macros-today-meal", { hasText: values.name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("MACROS-TEXT-AI: análisis revisable, guardado y persistencia", async ({ page }) => {
  await page.goto("/macros");
  await page.getByRole("button", { name: "Texto IA" }).click();
  const panel = page.locator("#meal-panel-text-ai");
  await panel.getByLabel("Describe lo que has comido").fill("100 g de plátano crudo y 150 g de yogur natural sin azúcar");
  await panel.getByRole("button", { name: "Calcular estimación" }).click();
  await expect(panel.getByText("Calculando estimación…")).toBeHidden({ timeout: 45_000 });
  await skipIfAiIsUnavailable(panel);
  await expect(panel.getByRole("heading", { name: /Plátano|Yogur|Revisa/i }).first()).toBeVisible();
  await confirmAiMacros(page, panel);
});

test("MACROS-PHOTO-AI: fixture, análisis revisable, guardado y persistencia", async ({ page }) => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "lakitchen-e2e-"));
  const temporaryPng = join(fixtureDirectory, "meal-bowl.png");

  try {
    const encodedFixture = await readFile("tests/e2e/fixtures/meal-bowl.png.b64", "utf8");
    await writeFile(temporaryPng, Buffer.from(encodedFixture, "base64"));

    await page.goto("/macros");
    await page.getByRole("button", { name: "Foto", exact: true }).click();
    const panel = page.locator("#meal-panel-photo-ai");
    await panel.getByLabel("Fotografía de la comida").setInputFiles(temporaryPng);
    await expect(panel.getByText("Fotografía lista para analizar.")).toBeVisible();
    await panel.getByLabel("Información adicional").fill("Fixture E2E: bol con arroz blanco, pollo a la plancha y brócoli; sin salsa.");
    await panel.getByRole("button", { name: "Analizar fotografía" }).click();
    await expect(panel.getByText("Analizando comida…")).toBeHidden({ timeout: 45_000 });
    await skipIfAiIsUnavailable(panel);
    await expectPhotoReview(panel);
    await confirmAiMacros(page, panel);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

test("MACROS-INVENTORY: descuento exacto, macros y persistencia", async ({ page }) => {
  const productName = `E2E completo ${Date.now()}`;
  const mealName = `E2E consumo ${Date.now()}`;
  await addInventoryItem(page, {
    name: productName,
    quantity: "500",
    nutrition: { calories: "200", protein: "20", carbs: "30", fat: "8" },
  });

  await page.goto("/macros");
  await page.getByRole("button", { name: "Desde inventario" }).click();
  const panel = page.locator("#meal-panel-ingredients");
  await panel.getByLabel("Producto").selectOption({ label: productName });
  await panel.getByLabel("Cantidad", { exact: true }).fill("125");
  await expect(panel.getByText("250 kcal")).toBeVisible();
  await expect(panel.getByText("25 g proteína · 37.5 g carbohidratos · 10 g grasas")).toBeVisible();
  await panel.getByLabel("Nombre de la comida").fill(mealName);
  await panel.getByLabel("Tipo de comida").selectOption("other");
  await panel.getByRole("button", { name: "Registrar comida y descontar inventario" }).click();
  await expect(page.getByRole("status")).toContainText("Comida registrada y productos descontados correctamente.");

  const meal = page.locator(".macros-today-meal", { hasText: mealName });
  await expect(meal).toContainText("250 kcal · P 25 g · C 37,5 g · G 10 g");
  await page.reload();
  await expect(page.locator(".macros-today-meal", { hasText: mealName })).toContainText("250 kcal · P 25 g · C 37,5 g · G 10 g");
  await page.goto(`/inventory?query=${encodeURIComponent(productName)}`);
  await expect(page.locator(".inventory-product", { hasText: productName })).toContainText("375 g");
  await page.reload();
  await expect(page.locator(".inventory-product", { hasText: productName })).toContainText("375 g");
});

test("MACROS-INCOMPLETE-NUTRITION: no inventa nutrientes y exige revisión", async ({ page }) => {
  const productName = `E2E incompleto ${Date.now()}`;
  await addInventoryItem(page, { name: productName, quantity: "300", nutrition: { calories: "123" } });
  const product = page.locator(".inventory-product", { hasText: productName });
  await expect(product).toContainText("Completar macros");
  await expect(product).toContainText("123 kcal");
  await product.getByText("Gestionar").click();
  await product.getByText("Descontar cantidad").click();
  await product.getByLabel("Cantidad consumida").fill("100");
  await expect(product.getByText("Completa las calorías y todos los macros para registrar este consumo como comida.")).toBeVisible();
  await expect(product.getByRole("button", { name: "Consumir y registrar como comida" })).toBeDisabled();
  await expect(product).not.toContainText(/g proteína|g carbohidratos|g grasas/);

  await page.goto("/macros");
  await page.getByRole("button", { name: "Desde inventario" }).click();
  await expect(page.locator("#meal-panel-ingredients")).not.toContainText(productName);
});

test("MACROS-LIGHT-THEME: elementos principales y preferencia persistente", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Oscuro").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Claro").check();
  await expect(page.evaluate(() => localStorage.getItem("lakitchen.theme.preference"))).resolves.toBe("light");
  await page.goto("/macros");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "Tu alimentación de hoy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Añadir comida" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comidas registradas hoy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Objetivos diarios", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.evaluate(() => localStorage.getItem("lakitchen.theme.preference"))).resolves.toBe("light");
});
