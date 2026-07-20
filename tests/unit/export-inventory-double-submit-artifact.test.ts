import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

function writeExportFile(root: string, relativePath: string, content: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

describe("temporary inventory patch export", () => {
  it("prints the validated three-file archive for transfer", () => {
    const pagePath = "app/inventory/page.tsx";
    let page = readFileSync(pagePath, "utf8");

    const importAnchor = 'import Link from "next/link";\n';
    const pendingImport =
      'import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";\n';

    expect(page).toContain(importAnchor);
    expect(page).not.toContain(pendingImport);
    page = page.replace(importAnchor, importAnchor + pendingImport);

    const oldButton = `              <button className="button" type="submit">
                Guardar producto
              </button>`;
    const newButton = `              <PendingSubmitButton
                className="button"
                idleLabel="Guardar producto"
                pendingLabel="Guardando…"
              />`;

    expect(page).toContain(oldButton);
    page = page.replace(oldButton, newButton);

    const uxPath = "tests/unit/inventory-ux-cleanup.test.ts";
    let uxTest = readFileSync(uxPath, "utf8");
    const oldAssertion =
      '    expect(inventoryPage).toMatch(/<button className="button" type="submit">\\s+Guardar producto\\s+<\\/button>/);';
    const newAssertions = `    expect(inventoryPage).toContain("<PendingSubmitButton");
    expect(inventoryPage).toContain('idleLabel="Guardar producto"');
    expect(inventoryPage).toContain('pendingLabel="Guardando…"');`;

    expect(uxTest).toContain(oldAssertion);
    uxTest = uxTest.replace(oldAssertion, newAssertions);

    const focusedTest = `import { readFileSync } from "node:fs";

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
      /<button className="button" type="submit">\\s+Guardar producto\\s+<\\/button>/,
    );
  });

  it("keeps the pending control isolated from inventory editing", () => {
    const addForm = getInventoryAddFormSource();

    expect(addForm.match(/<PendingSubmitButton/g) ?? []).toHaveLength(1);
    expect(inventoryPage).toContain("Guardar cambios");
    expect(inventoryPage).toMatch(
      /<button className="button" type="submit">\\s+Guardar cambios\\s+<\\/button>/,
    );
  });
});
`;

    const work = mkdtempSync(join(tmpdir(), "inventory-export-"));
    const exportRoot = join(work, "inventory-double-submit-export");
    const archive = join(work, "inventory-double-submit-export.tar.gz");

    try {
      writeExportFile(exportRoot, "app/inventory/page.tsx", page);
      writeExportFile(
        exportRoot,
        "tests/unit/inventory-pending-submit.test.ts",
        focusedTest,
      );
      writeExportFile(
        exportRoot,
        "tests/unit/inventory-ux-cleanup.test.ts",
        uxTest,
      );

      execFileSync("tar", [
        "-C",
        work,
        "-czf",
        archive,
        "inventory-double-submit-export",
      ]);

      const archiveBytes = readFileSync(archive);
      const base64 = archiveBytes.toString("base64");
      const sha256 = createHash("sha256").update(archiveBytes).digest("hex");

      console.log("INVENTORY_EXPORT_METADATA", {
        size: archiveBytes.length,
        sha256,
      });
      console.log("INVENTORY_EXPORT_BASE64_BEGIN");
      for (let index = 0; index < base64.length; index += 100) {
        console.log(base64.slice(index, index + 100));
      }
      console.log("INVENTORY_EXPORT_BASE64_END");

      expect(archiveBytes.length).toBeGreaterThan(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
