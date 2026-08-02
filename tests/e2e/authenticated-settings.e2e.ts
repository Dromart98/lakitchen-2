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

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("SETTINGS-LIFECYCLE: tema inmediato, persistencia y confirmación de borrado", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Haz LaKitchen tuya" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Apariencia" })).toBeVisible();

  const light = page.locator("#theme-light");
  const dark = page.locator("#theme-dark");
  const system = page.locator("#theme-system");

  await dark.check();
  await expect(dark).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("status")).toContainText("Tema aplicado ahora: Oscuro");

  await page.reload();
  await expect(dark).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await light.check();
  await expect(light).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("status")).toContainText("Tema aplicado ahora: Claro");

  await page.emulateMedia({ colorScheme: "dark" });
  await system.check();
  await expect(system).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("status")).toContainText("Tema aplicado ahora: Claro");

  await page.reload();
  await expect(system).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeVisible();
  await expect(page.getByText("Tu cuenta y todos tus datos de LaKitchen se eliminarán definitivamente.")).toBeVisible();
  const confirmation = page.locator('input[name="delete_confirmation"]');
  await expect(confirmation).not.toBeChecked();
  expect(await confirmation.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(false);
  await expect(page.getByRole("button", { name: "Eliminar mi cuenta" })).toBeVisible();
});
