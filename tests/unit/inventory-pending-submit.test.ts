import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const inventoryPage = readFileSync(
  resolve(process.cwd(), "app/inventory/page.tsx"),
  "utf8",
);

const createForm = inventoryPage.match(
  /<form action=\{addInventoryItemAction\} className="meal-log-form">([\s\S]*?)<\/form>/,
)?.[0];

const editForm = inventoryPage.match(
  /<form\s+action=\{updateInventoryItemAction\}\s+className="meal-log-form"\s*>([\s\S]*?)<\/form>/,
)?.[0];

describe("inventory add form pending submit button", () => {
  it("uses the shared pending submit control only for manual inventory creation", () => {
    expect(inventoryPage).toContain(
      'import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton"',
    );
    expect(createForm).toBeDefined();
    expect(createForm).toContain("<BarcodeCatalogControls");
    expect(createForm).toContain("<PendingSubmitButton");
    expect(createForm).toContain('className="button"');
    expect(createForm).toContain('idleLabel="Guardar producto"');
    expect(createForm).toContain('pendingLabel="Guardando…"');
    expect(createForm).not.toMatch(
      /<button className="button" type="submit">\s*Guardar producto\s*<\/button>/,
    );
    expect((inventoryPage.match(/<PendingSubmitButton/g) ?? [])).toHaveLength(1);
  });

  it("leaves the product edit form and its submit button unchanged", () => {
    expect(editForm).toContain('<button className="button" type="submit">');
    expect(editForm).toContain("Guardar cambios");
    expect(editForm).not.toContain("<PendingSubmitButton");
  });
});
