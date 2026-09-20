import { expect, test, type Page } from "@playwright/test";

import {
  submitInventoryForm,
  submitInventoryServerAction,
  waitForInventoryFormReady,
} from "./helpers/inventory-form";

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

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("INVENTORY-LIFECYCLE: vacío, alta, edición, error, consumo y eliminación", async ({ page }) => {
  const originalName = `E2E inventario ${Date.now()}`;
  const editedName = `${originalName} editado`;

  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Tu inventario está vacío" })).toBeVisible();

  await page.getByRole("button", { name: "Añadir producto" }).click();
  const addForm = await waitForInventoryFormReady(page);
  await page.locator("#inventory-name").fill(originalName);
  await page.locator("#inventory-location").selectOption("pantry");
  await page.locator("#inventory-quantity").fill("500");
  await page.locator("#inventory-unit").selectOption("g");
  await submitInventoryForm(page, addForm);

  await page.goto(`/inventory?query=${encodeURIComponent(originalName)}`);
  let product = page.locator(".inventory-product", { hasText: originalName });
  await expect(product).toBeVisible();
  await expect(product).toContainText("500 g");

  await product.getByText("Gestionar").click();
  await product.getByText("Editar", { exact: true }).click();
  const editButton = product.getByRole("button", { name: "Guardar cambios" });
  const editForm = editButton.locator("xpath=ancestor::form");
  await editForm.locator('input[name="name"]').fill(editedName);
  await editForm.locator('input[name="quantity"]').fill("450");
  await submitInventoryServerAction(page, editForm, "Guardar cambios");

  await page.goto(`/inventory?query=${encodeURIComponent(editedName)}`);
  product = page.locator(".inventory-product", { hasText: editedName });
  await expect(product).toBeVisible();
  await expect(product).toContainText("450 g");

  await product.getByText("Gestionar").click();
  await product.getByText("Descontar cantidad").click();
  let consumedQuantity = product.getByLabel("Cantidad consumida");
  await consumedQuantity.fill("451");
  await expect(product.getByText("La cantidad supera el stock disponible.")).toBeVisible();
  let consumeButton = product.getByRole("button", { name: "Confirmar consumo" });
  let consumeForm = consumeButton.locator("xpath=ancestor::form");
  await submitInventoryServerAction(page, consumeForm, "Confirmar consumo");
  await expect(page).toHaveURL(/inventoryError=consume-too-much/);

  await page.goto(`/inventory?query=${encodeURIComponent(editedName)}`);
  product = page.locator(".inventory-product", { hasText: editedName });
  await expect(product).toContainText("450 g");
  await product.getByText("Gestionar").click();
  await product.getByText("Descontar cantidad").click();
  consumedQuantity = product.getByLabel("Cantidad consumida");
  await consumedQuantity.fill("50");
  consumeButton = product.getByRole("button", { name: "Confirmar consumo" });
  consumeForm = consumeButton.locator("xpath=ancestor::form");
  await submitInventoryServerAction(page, consumeForm, "Confirmar consumo");
  await expect(page).toHaveURL(/inventorySuccess=item-consumed/);

  await page.goto(`/inventory?query=${encodeURIComponent(editedName)}`);
  product = page.locator(".inventory-product", { hasText: editedName });
  await expect(product).toContainText("400 g");

  await page.goto(`/inventory?query=${encodeURIComponent(`${editedName} no existe`)}`);
  await expect(page.getByText("No hay productos que coincidan con estos filtros.")).toBeVisible();

  await page.goto(`/inventory?query=${encodeURIComponent(editedName)}`);
  product = page.locator(".inventory-product", { hasText: editedName });
  await product.getByText("Gestionar").click();
  const deleteButton = product.getByRole("button", { name: "Eliminar" });
  const deleteForm = deleteButton.locator("xpath=ancestor::form");
  await submitInventoryServerAction(page, deleteForm, "Eliminar");

  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Tu inventario está vacío" })).toBeVisible();
  await expect(page.locator(".inventory-product", { hasText: editedName })).toHaveCount(0);
});
