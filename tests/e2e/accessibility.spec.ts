import { test, expect, type Page } from "@playwright/test";
import axe from "axe-core";

declare global {
  interface Window { axe: typeof axe }
}

async function audit(page: Page) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
  })).violations);
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) }))).toEqual([]);
}

async function reflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.getByRole("button").all()) {
    if (!await button.isVisible()) continue;
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  }
}

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 640, 320]) {
    test(`login: axe, targets and reflow ${theme} ${width}`, async ({ page }) => {
      await page.addInitScript(t => localStorage.setItem("lakitchen.theme.preference", t), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
      await audit(page);
      await reflow(page);
    });
  }
}

test("login keyboard order, password toggle and native required validation", async ({ page }) => {
  await page.goto("/login");
  for (const target of [page.getByLabel("Email", { exact: true }), page.getByLabel("Contraseña", { exact: true }), page.getByRole("button", { name: "Mostrar contraseña" })]) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
    expect(await target.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  }
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "text");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
});

test("focus indicator has 3:1 contrast against its surrounding white surface", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const color = await page.getByLabel("Email", { exact: true }).evaluate(el => getComputedStyle(el).outlineColor);
  const channels = color.match(/\d+/g)!.slice(0, 3).map(Number).map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  expect(1.05 / (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 + 0.05)).toBeGreaterThanOrEqual(3);
});

test("authentication failure is announced and associated with credentials", async ({ page }) => {
  await page.route("**/auth/v1/token?**", route => route.fulfill({
    status: 400, contentType: "application/json",
    body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
  }));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("accessibility@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo completar" })).toBeVisible();
  for (const name of ["Email", "Contraseña"]) {
    await expect(page.getByLabel(name, { exact: true })).toHaveAccessibleDescription(/No se pudo completar/);
  }
  await audit(page);
});

test.describe("authenticated essential routes (real test session)", () => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Set E2E_STORAGE_STATE to a test account's Playwright storage state; never production credentials.");
  test.use({ storageState: process.env.E2E_STORAGE_STATE });
  for (const route of ["dashboard", "inventory", "shopping-list", "macros", "recipes", "plan", "nutrition-profile", "settings", "meal-history", "weekly-summary"]) {
    test(route, async ({ page }) => {
      await page.goto(`/${route}`);
      await expect(page).not.toHaveURL(/\/login/);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
      for (const width of [1280, 640, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await audit(page);
        await reflow(page);
      }
    });
  }
});
