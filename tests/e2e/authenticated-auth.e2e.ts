import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

function requireCredentials() {
  expect(email, "E2E_EMAIL must be provided by the runner").toBeTruthy();
  expect(password, "E2E_PASSWORD must be provided by the runner").toBeTruthy();
}

async function fillLogin(page: Page, candidatePassword: string) {
  await page.getByLabel("Email").fill(email!);
  await page.locator('input[name="password"]').fill(candidatePassword);
}

async function logIn(page: Page) {
  await page.goto("/login");
  await fillLogin(page, password!);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
}

test("AUTH-LIFECYCLE: protección, login, logout y eliminación definitiva de cuenta", async ({ page }) => {
  requireCredentials();

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);

  await fillLogin(page, `${password!}incorrecta`);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo completar la autenticación");
  await expect(page).toHaveURL(/\/login$/);

  await fillLogin(page, password!);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

  await Promise.all([
    page.waitForURL("**/login"),
    page.getByRole("button", { name: "Cerrar sesión" }).click(),
  ]);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeVisible();

  const confirmation = page.locator('input[name="delete_confirmation"]');
  await confirmation.check();
  await Promise.all([
    page.waitForURL(/\/login\?accountDeleted=true$/),
    page.getByRole("button", { name: "Eliminar mi cuenta" }).click(),
  ]);

  await fillLogin(page, password!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo completar la autenticación");
  await expect(page).toHaveURL(/\/login\?accountDeleted=true$/);
});
