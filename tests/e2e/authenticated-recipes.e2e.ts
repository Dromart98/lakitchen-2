import { expect, test, type Locator, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const blockedAiMessages = /no está configurada|ha tardado demasiado|no se pudo conectar|agotó el tiempo|demasiadas solicitudes|proveedor de IA no pudo/i;

function parseSpanishNumber(value: string): number {
  return Number(value.trim().replace(/\./g, "").replace(",", "."));
}

function formatSpanishNumber(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

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
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("status")).toContainText("Producto añadido al inventario correctamente");
}

async function skipIfRecipeAiIsUnavailable(section: Locator) {
  const alert = section.getByRole("alert").first();
  if (!(await alert.isVisible().catch(() => false))) return;
  const message = ((await alert.textContent()) ?? "").trim();
  test.skip(blockedAiMessages.test(message), `BLOCKED: generación de recetas no disponible: ${message}`);
  throw new Error(`La generación de recetas no produjo una sugerencia válida. Estado visible: ${message || "alerta vacía"}`);
}

function parseIngredientLine(text: string): { name: string; grams: number } {
  const match = text.trim().match(/^(.*):\s*([\d.,]+)\s*(g|kg)$/i);
  if (!match) throw new Error(`Ingrediente E2E no interpretable: ${text}`);
  const quantity = parseSpanishNumber(match[2]);
  const grams = match[3].toLowerCase() === "kg" ? quantity * 1000 : quantity;
  if (!Number.isFinite(grams) || grams <= 0) throw new Error(`Cantidad E2E inválida: ${text}`);
  return { name: match[1].trim(), grams };
}

async function expectInventoryQuantity(page: Page, name: string, expectedGrams: number) {
  await page.goto(`/inventory?query=${encodeURIComponent(name)}`);
  const item = page.locator(".inventory-product", { hasText: name });
  if (expectedGrams <= 0.000001) {
    await expect(item).toHaveCount(0);
    return;
  }
  await expect(item).toContainText(`${formatSpanishNumber(expectedGrams)} g`);
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("RECIPES-LIFECYCLE: generar, guardar, medir, cocinar lote, conservar snapshot y consumir", async ({ page }) => {
  test.setTimeout(150_000);

  const stamp = Date.now();
  const chickenName = `E2E pollo receta ${stamp}`;
  const riceName = `E2E arroz receta ${stamp}`;

  await addInventoryItem(page, { name: chickenName, calories: "165", protein: "31", carbs: "0", fat: "3.6" });
  await addInventoryItem(page, { name: riceName, calories: "360", protein: "7", carbs: "79", fat: "0.6" });

  await page.goto("/recipes");
  const generator = page.locator(".recipe-ai");
  await generator.getByLabel("Tiempo máximo").selectOption("30");
  await generator.getByLabel("Raciones").selectOption("2");
  await generator.getByLabel("Número de sugerencias").selectOption("1");
  await generator.getByLabel("Prioridad de las recetas").selectOption("balanced");
  await generator.getByRole("button", { name: "Generar recetas" }).click();
  await expect(generator.getByText("Generando sugerencias…")).toBeHidden({ timeout: 60_000 });
  await skipIfRecipeAiIsUnavailable(generator);

  const generatedCard = generator.locator(".recipe-ai__card").first();
  await expect(generatedCard).toBeVisible();
  await expect(generatedCard.getByRole("heading", { name: "Información nutricional estimada" })).toBeVisible();
  await expect(generatedCard.getByText("Total de la receta")).toBeVisible();
  await expect(generatedCard.getByText("Por ración")).toBeVisible();
  const recipeTitle = ((await generatedCard.locator("h3").textContent()) ?? "").trim();
  expect(recipeTitle).not.toBe("");

  await generatedCard.getByRole("button", { name: "Guardar receta" }).click();
  await expect(generatedCard.getByRole("status")).toContainText(/Receta guardada|Ya estaba guardada/);

  let savedCard = page.locator(".saved-recipe", { hasText: recipeTitle });
  await expect(savedCard).toBeVisible({ timeout: 15_000 });
  await page.reload();
  savedCard = page.locator(".saved-recipe", { hasText: recipeTitle });
  await expect(savedCard).toBeVisible();

  const ingredientTexts = await savedCard.locator("details").first().locator("li").allTextContents();
  const ingredients = ingredientTexts.map(parseIngredientLine);
  expect(ingredients.length).toBeGreaterThanOrEqual(1);
  for (const ingredient of ingredients) {
    expect([chickenName, riceName]).toContain(ingredient.name);
    expect(ingredient.grams).toBeLessThanOrEqual(1000);
  }

  const rawWeight = ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);
  const cookedWeight = Math.max(1, Math.round(rawWeight * 0.8 * 10) / 10);

  const yieldDetails = savedCard.locator(".cooking-yield-preview");
  await yieldDetails.locator("summary").click();
  await yieldDetails.getByLabel("Peso antes de cocinar (g)").fill(String(rawWeight));
  await yieldDetails.getByLabel("Peso final cocinado (g)").fill(String(cookedWeight));
  await yieldDetails.getByLabel("Número de raciones").fill("2");
  await yieldDetails.getByRole("button", { name: "Ver previsualización" }).click();
  await expect(yieldDetails.getByText("Nutrición por ración")).toBeVisible();
  await yieldDetails.getByRole("button", { name: "Guardar medición" }).click();
  await expect(yieldDetails.getByRole("status")).toContainText("Medición guardada.");

  await page.reload();
  savedCard = page.locator(".saved-recipe", { hasText: recipeTitle });
  await expect(savedCard.getByRole("checkbox")).toBeVisible();
  await savedCard.getByRole("checkbox").check();
  await savedCard.getByRole("button", { name: "Cocinar y guardar lote" }).click();
  await expect(savedCard.getByRole("status")).toContainText("La receta se ha guardado como comida cocinada.");

  for (const ingredient of ingredients) {
    await expectInventoryQuantity(page, ingredient.name, 1000 - ingredient.grams);
  }

  await page.goto("/recipes");
  let batchCard = page.locator(".cooked-batch-card", { hasText: recipeTitle });
  await expect(batchCard).toBeVisible();
  await expect(batchCard).toContainText(`${formatSpanishNumber(cookedWeight)} g`);
  savedCard = page.locator(".saved-recipe", { hasText: recipeTitle });
  await savedCard.getByRole("button", { name: "Eliminar receta" }).click();
  await expect(page.locator(".saved-recipe", { hasText: recipeTitle })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".saved-recipe", { hasText: recipeTitle })).toHaveCount(0);
  batchCard = page.locator(".cooked-batch-card", { hasText: recipeTitle });
  await expect(batchCard).toBeVisible();

  await batchCard.getByLabel("Modalidad").selectOption("servings");
  await batchCard.getByLabel("Cantidad").fill("1");
  await batchCard.getByLabel("Tipo de comida").selectOption("dinner");
  await expect(batchCard.getByText("Registrarás")).toBeVisible();
  await batchCard.getByRole("button", { name: "Registrar porción" }).click();
  await expect(batchCard.getByRole("status")).toContainText("Se han registrado");

  await page.reload();
  batchCard = page.locator(".cooked-batch-card", { hasText: recipeTitle });
  await expect(batchCard).toContainText(`${formatSpanishNumber(cookedWeight / 2)} g · 1 raciones`);

  await page.goto("/macros");
  await expect(page.locator(".macros-today-meal", { hasText: recipeTitle })).toBeVisible();
  await page.goto("/meal-history");
  await expect(page.locator(".meal-history-meal", { hasText: recipeTitle })).toBeVisible();
});
