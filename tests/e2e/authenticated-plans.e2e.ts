import { expect, test, type Locator, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const blockedAiMessages = /no está configurada|ha tardado demasiado|no se pudo generar el plan ahora|proveedor/i;

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

async function configureNutritionProfile(page: Page) {
  await page.goto("/nutrition-profile");
  await page.locator("#age").fill("30");
  await page.locator("#height_cm").fill("175");
  await page.locator("#weight_kg").fill("75");
  await page.locator("#sex").selectOption("male");
  await page.locator("#goal").selectOption("maintain");
  await page.locator("#activity_level").selectOption("medium");
  await page.locator("#target_calories").fill("2400");
  await page.locator("#target_protein_g").fill("150");
  await page.locator("#target_carbs_g").fill("300");
  await page.locator("#target_fat_g").fill("70");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toContainText("Perfil nutricional guardado correctamente.");
}

async function addInventoryItem(
  page: Page,
  item: { name: string; calories: string; protein: string; carbs: string; fat: string },
) {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Añadir producto" }).click();
  await page.locator("#inventory-name").fill(item.name);
  await page.locator("#inventory-quantity").fill("1000");
  await page.locator("#inventory-unit").selectOption("g");
  await page.locator("#inventory-nutrition-basis").selectOption("per_100g");
  await page.locator("#inventory-calories").fill(item.calories);
  await page.locator("#inventory-protein-g").fill(item.protein);
  await page.locator("#inventory-carbs-g").fill(item.carbs);
  await page.locator("#inventory-fat-g").fill(item.fat);
  const saveResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/inventory",
  );
  await page.getByRole("button", { name: "Guardar producto" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
  await page.goto(`/inventory?query=${encodeURIComponent(item.name)}`);
  await expect(page.locator(".inventory-product", { hasText: item.name })).toBeVisible();
}

async function skipIfPlanAiIsUnavailable(section: Locator) {
  const alert = section.getByRole("alert").first();
  if (!(await alert.isVisible().catch(() => false))) return;
  const message = ((await alert.textContent()) ?? "").trim();
  test.skip(blockedAiMessages.test(message), `BLOCKED: generación de planes no disponible: ${message}`);
  throw new Error(`La generación del plan no produjo una vista previa válida. Estado visible: ${message || "alerta vacía"}`);
}

function parseIngredient(text: string): { name: string; grams: number } {
  const match = text.trim().match(/^([\d.,]+)\s*(g|kg)\s*·\s*(.+)$/i);
  if (!match) throw new Error(`Ingrediente de plan E2E no interpretable: ${text}`);
  const quantity = Number(match[1].replace(/\./g, "").replace(",", "."));
  const grams = match[2].toLowerCase() === "kg" ? quantity * 1000 : quantity;
  if (!Number.isFinite(grams) || grams <= 0) throw new Error(`Cantidad de plan E2E inválida: ${text}`);
  return { name: match[3].trim(), grams };
}

async function expectInventoryQuantity(page: Page, name: string, grams: number) {
  await page.goto(`/inventory?query=${encodeURIComponent(name)}`);
  const item = page.locator(".inventory-product", { hasText: name });
  await expect(item).toBeVisible();
  const formatted = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(grams);
  await expect(item).toContainText(`${formatted} g`);
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("PLANS-LIFECYCLE: perfil, generación, guardado sin consumo y cocinado de una comida", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Completa tus objetivos nutricionales" })).toBeVisible();
  await expect(page.getByText("No se llamará a la IA hasta que el perfil esté completo.")).toBeVisible();

  await configureNutritionProfile(page);

  const stamp = Date.now();
  const items = [
    { name: `E2E pollo plan ${stamp}`, calories: "165", protein: "31", carbs: "0", fat: "3.6" },
    { name: `E2E arroz plan ${stamp}`, calories: "360", protein: "7", carbs: "79", fat: "0.6" },
    { name: `E2E brocoli plan ${stamp}`, calories: "34", protein: "2.8", carbs: "6.6", fat: "0.4" },
    { name: `E2E yogur plan ${stamp}`, calories: "63", protein: "5", carbs: "7", fat: "1.5" },
  ];
  for (const item of items) await addInventoryItem(page, item);

  await page.goto("/plan");
  const generator = page.locator(".plan-generator");
  await expect(generator.getByText("4 productos utilizables")).toBeVisible();
  await generator.getByLabel("Prioridad").selectOption("balanced");
  await generator.getByLabel("Tiempo máximo por comida").selectOption("30");
  await generator.getByRole("button", { name: "Generar plan" }).click();
  await expect(generator.getByText("Generando tu plan…")).toBeHidden({ timeout: 75_000 });
  await skipIfPlanAiIsUnavailable(generator);

  const result = generator.locator(".plan-result");
  await expect(result).toBeVisible();
  await expect(result.getByText("Objetivo diario")).toBeVisible();
  await expect(result.getByText("Total generado")).toBeVisible();
  const mealCards = result.locator(".plan-meal");
  await expect(mealCards).toHaveCount(4);

  await result.getByRole("button", { name: "Guardar plan" }).click();
  await expect(generator.getByRole("status")).toContainText("Plan guardado.");

  await page.getByRole("tab", { name: "Guardados" }).click();
  let savedPlan = page.locator(".saved-plan").first();
  await expect(savedPlan).toBeVisible();
  await expect(savedPlan).toContainText("0 de 4");
  await savedPlan.locator("summary").click();
  let firstMeal = savedPlan.locator(".saved-plan-meal").first();
  const mealTitle = ((await firstMeal.locator("h4").textContent()) ?? "").trim();
  expect(mealTitle).not.toBe("");
  const ingredients = (await firstMeal.locator("ul > li").allTextContents()).map(parseIngredient);
  expect(ingredients.length).toBeGreaterThanOrEqual(1);
  for (const ingredient of ingredients) {
    expect(items.map((item) => item.name)).toContain(ingredient.name);
    await expectInventoryQuantity(page, ingredient.name, 1000);
  }

  await page.goto("/plan");
  await page.getByRole("tab", { name: "Guardados" }).click();
  savedPlan = page.locator(".saved-plan").first();
  await savedPlan.locator("summary").click();
  firstMeal = savedPlan.locator(".saved-plan-meal").first();
  await firstMeal.getByRole("button", { name: "Cocinar y registrar" }).click();
  await expect(firstMeal.getByText("Comida registrada", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(savedPlan).toContainText("1 de 4", { timeout: 15_000 });

  for (const ingredient of ingredients) {
    await expectInventoryQuantity(page, ingredient.name, 1000 - ingredient.grams);
  }

  await page.goto("/macros");
  await expect(page.locator(".macros-today-meal", { hasText: mealTitle })).toBeVisible();
  await page.goto("/meal-history");
  await expect(page.locator(".meal-history-meal", { hasText: mealTitle })).toBeVisible();
});
