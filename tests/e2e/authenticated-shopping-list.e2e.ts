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

function shoppingItem(page: Page, name: string) {
  return page.locator(".shopping-list-item", { hasText: name });
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("SHOPPING-LIST-LIFECYCLE: crear, editar, comprar, transferir y eliminar", async ({ page }) => {
  await page.goto("/shopping-list");
  await expect(page.getByRole("heading", { name: "Tu lista de la compra está vacía" })).toBeVisible();

  await page.locator("#shopping-list-name").fill("Arroz");
  await page.locator("#shopping-list-quantity").fill("750");
  await page.locator("#shopping-list-unit").selectOption("g");
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-created$/),
    page.getByRole("button", { name: "Añadir a la lista" }).click(),
  ]);
  await expect(page.getByRole("status")).toHaveText("Producto añadido a la lista correctamente.");

  let item = shoppingItem(page, "Arroz");
  await expect(item).toContainText("750 g");
  await expect(item).toContainText("Pendiente");
  await page.reload();
  item = shoppingItem(page, "Arroz");
  await expect(item).toBeVisible();

  await item.getByText("Editar", { exact: true }).click();
  const editForm = item.locator(".shopping-list-item__edit-form");
  await editForm.getByLabel("Nombre").fill("Arroz integral");
  await editForm.getByLabel("Cantidad").fill("1.5");
  await editForm.getByLabel("Unidad").selectOption("kg");
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-updated$/),
    editForm.getByRole("button", { name: "Guardar cambios" }).click(),
  ]);

  item = shoppingItem(page, "Arroz integral");
  await expect(item).toContainText("1.5 kg");
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-purchased$/),
    item.getByRole("button", { name: "Marcar como comprado" }).click(),
  ]);
  item = shoppingItem(page, "Arroz integral");
  await expect(item).toContainText("Comprado");

  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-pending$/),
    item.getByRole("button", { name: "Volver a pendientes" }).click(),
  ]);
  item = shoppingItem(page, "Arroz integral");
  await expect(item).toContainText("Pendiente");

  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-purchased$/),
    item.getByRole("button", { name: "Marcar como comprado" }).click(),
  ]);
  item = shoppingItem(page, "Arroz integral");
  await item.getByText("Pasar al inventario", { exact: true }).click();
  const transferForm = item.locator(".shopping-list-item__transfer-form");
  await transferForm.getByLabel("Ubicación").selectOption("freezer");
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-transferred(?:-with-nutrition|-macros-pending)?$/, { timeout: 45_000 }),
    transferForm.getByRole("button", { name: "Añadir al inventario y calcular macros" }).click(),
  ]);
  await expect(shoppingItem(page, "Arroz integral")).toHaveCount(0);

  await page.goto("/inventory");
  const freezerGroup = page.locator(".inventory-group", { has: page.locator("#inventory-group-freezer") });
  const inventoryItem = freezerGroup.locator(".inventory-product", { hasText: "Arroz integral" });
  await expect(inventoryItem).toBeVisible();
  await expect(inventoryItem).toContainText("1.5 kg");

  await page.goto("/shopping-list");
  await page.locator("#shopping-list-name").fill("Producto para eliminar");
  await page.locator("#shopping-list-quantity").fill("2");
  await page.locator("#shopping-list-unit").selectOption("ud");
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-created$/),
    page.getByRole("button", { name: "Añadir a la lista" }).click(),
  ]);

  const deletableItem = shoppingItem(page, "Producto para eliminar");
  await expect(deletableItem).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/shopping-list\?shoppingListSuccess=item-deleted$/),
    deletableItem.getByRole("button", { name: "Eliminar" }).click(),
  ]);
  await expect(shoppingItem(page, "Producto para eliminar")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tu lista de la compra está vacía" })).toBeVisible();
});