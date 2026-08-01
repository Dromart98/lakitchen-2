import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("the isolated E2E account can access macros", async ({ page }) => {
  expect(email, "E2E_EMAIL must be provided by the runner").toBeTruthy();
  expect(password, "E2E_PASSWORD must be provided by the runner").toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.locator('input[name="password"]').fill(password!);

  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);

  await page.goto("/macros");

  await expect(page).toHaveURL(/\/macros(?:[?#]|$)/);
  await expect(page.getByRole("heading", { name: "Tu alimentación de hoy" })).toBeVisible();
});
