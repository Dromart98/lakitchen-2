import { expect, type Locator, type Page, type Request } from "@playwright/test";

const INVENTORY_POST_START_TIMEOUT_MS = 5_000;

type InvalidControl = {
  identifier: string;
  message: string;
  value: string;
};

function inventoryPost(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/inventory";
}

async function formDiagnostics(form: Locator, button: Locator): Promise<string> {
  const formState = await form.evaluate((element) => {
    const inventoryForm = element as HTMLFormElement;
    return {
      valid: inventoryForm.checkValidity(),
      invalidControls: Array.from(inventoryForm.elements)
        .filter((control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
        .filter((control) => !control.validity.valid)
        .map((control) => ({
          identifier: control.name || control.id || control.tagName.toLowerCase(),
          message: control.validationMessage,
          value: control.value,
        })),
    };
  });
  const buttonState = await button.evaluate((element) => {
    const submitButton = element as HTMLButtonElement;
    return {
      disabled: submitButton.disabled,
      ariaDisabled: submitButton.getAttribute("aria-disabled"),
      text: submitButton.textContent?.trim() ?? "",
    };
  });

  return JSON.stringify({ form: formState, button: buttonState });
}

export async function waitForInventoryFormReady(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Guardar producto" });
  const form = button.locator("xpath=ancestor::form");
  await expect(form).toBeVisible();
  await expect(button).toBeEnabled();

  // React adds its current props to a DOM node when that node is hydrated. Waiting
  // for this marker prevents a click on server-rendered markup before the Server
  // Action submit handler is attached.
  await page.waitForFunction((element) =>
    Object.keys(element as HTMLButtonElement).some((key) => key.startsWith("__reactProps$")), await button.elementHandle());

  return form;
}

export async function submitInventoryForm(page: Page, form: Locator): Promise<void> {
  const button = form.getByRole("button", { name: "Guardar producto" });
  const invalidControls = await form.evaluate((element): InvalidControl[] =>
    Array.from((element as HTMLFormElement).elements)
      .filter((control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
      .filter((control) => !control.validity.valid)
      .map((control) => ({
        identifier: control.name || control.id || control.tagName.toLowerCase(),
        message: control.validationMessage,
        value: control.value,
      })),
  );
  expect(invalidControls, `El formulario de inventario no es válido: ${JSON.stringify(invalidControls)}`).toEqual([]);

  const requestPromise = page.waitForRequest(inventoryPost, { timeout: INVENTORY_POST_START_TIMEOUT_MS });
  await button.click();

  let request: Request;
  try {
    request = await requestPromise;
  } catch (error) {
    throw new Error(
      `No comenzó el POST /inventory tras pulsar "Guardar producto". Estado: ${await formDiagnostics(form, button)}`,
      { cause: error },
    );
  }

  const response = await request.response();
  expect(response, "El POST /inventory comenzó pero no produjo respuesta HTTP").not.toBeNull();
  expect(response!.status(), "El POST /inventory debe responder sin error").toBeLessThan(400);
}
