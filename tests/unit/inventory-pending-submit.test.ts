import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const inventoryPage = readFileSync("app/inventory/page.tsx", "utf8");

function getInventoryAddFormSource() {
  const start = inventoryPage.indexOf(
    '<form action={addInventoryItemAction} className="meal-log-form">',
  );
  const end = inventoryPage.indexOf("</form>", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return inventoryPage.slice(start, end + "</form>".length);
}

describe("inventory pending submit", () => {
  it("uses the shared pending submit control in the manual add form", () => {
    const addForm = getInventoryAddFormSource();

    expect(inventoryPage).toContain(
      'import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";',
    );
    expect(addForm).toContain("action={addInventoryItemAction}");
    expect(addForm).toContain("<PendingSubmitButton");
    expect(addForm).toContain('className="button"');
    expect(addForm).toContain('idleLabel="Guardar producto"');
    expect(addForm).toContain('pendingLabel="Guardando…"');
    expect(addForm).not.toMatch(
      /<button className="button" type="submit">\s+Guardar producto\s+<\/button>/,
    );
  });

  it("keeps the pending control isolated from inventory editing", () => {
    const addForm = getInventoryAddFormSource();

    expect(addForm.match(/<PendingSubmitButton/g) ?? []).toHaveLength(1);
    expect(inventoryPage).toContain("Guardar cambios");
    expect(inventoryPage).toMatch(
      /<button className="button" type="submit">\s+Guardar cambios\s+<\/button>/,
    );
  });
});
