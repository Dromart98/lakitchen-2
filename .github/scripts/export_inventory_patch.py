from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
from urllib.request import Request, urlopen

REPOSITORY = "Dromart98/lakitchen-2"
BASE_REF = "bb39010384517c61b8c3256391db84ca68bb797b"


def fetch_text(path: str) -> str:
    url = f"https://api.github.com/repos/{REPOSITORY}/contents/{path}?ref={BASE_REF}"
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urlopen(request) as response:
        payload = json.load(response)
    return base64.b64decode(payload["content"]).decode("utf-8")


page = fetch_text("app/inventory/page.tsx")
import_anchor = 'import Link from "next/link";\n'
pending_import = 'import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";\n'
if pending_import not in page:
    page = page.replace(import_anchor, import_anchor + pending_import, 1)

old_button = '''              <button className="button" type="submit">
                Guardar producto
              </button>'''
new_button = '''              <PendingSubmitButton
                className="button"
                idleLabel="Guardar producto"
                pendingLabel="Guardando…"
              />'''
if old_button not in page:
    raise SystemExit("plain inventory submit button not found")
page = page.replace(old_button, new_button, 1)

ux_test = fetch_text("tests/unit/inventory-ux-cleanup.test.ts")
old_assertion = '    expect(inventoryPage).toMatch(/<button className="button" type="submit">\\s+Guardar producto\\s+<\\/button>/);'
new_assertions = '''    expect(inventoryPage).toContain("<PendingSubmitButton");
    expect(inventoryPage).toContain('idleLabel="Guardar producto"');
    expect(inventoryPage).toContain('pendingLabel="Guardando…"');'''
if old_assertion not in ux_test:
    raise SystemExit("legacy inventory submit assertion not found")
ux_test = ux_test.replace(old_assertion, new_assertions, 1)

focused_test = '''import { readFileSync } from "node:fs";

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
'''

files = {
    "app/inventory/page.tsx": page,
    "tests/unit/inventory-pending-submit.test.ts": focused_test,
    "tests/unit/inventory-ux-cleanup.test.ts": ux_test,
}
payload = json.dumps(
    files,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
).encode("utf-8")
archive_bytes = gzip.compress(payload, mtime=0)
encoded = base64.b64encode(archive_bytes).decode("ascii")
chunk_count = int(os.environ["CHUNK_COUNT"])
chunk_index = int(os.environ["CHUNK_INDEX"])
chunk_size = (len(encoded) + chunk_count - 1) // chunk_count
chunk = encoded[chunk_index * chunk_size : (chunk_index + 1) * chunk_size]
print(
    "INVENTORY_EXPORT_CHUNK="
    + str(chunk_index)
    + ":"
    + str(chunk_count)
    + ":"
    + str(len(archive_bytes))
    + ":"
    + hashlib.sha256(archive_bytes).hexdigest()
    + ":"
    + chunk
)
