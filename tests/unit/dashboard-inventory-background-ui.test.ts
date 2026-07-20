import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const inventoryPage = readFileSync("app/inventory/page.tsx", "utf8");
const voiceInventoryInput = readFileSync(
  "components/inventory/VoiceInventoryBatchInput.tsx",
  "utf8",
);
const voiceShoppingInput = readFileSync(
  "components/shopping/VoiceShoppingBatchInput.tsx",
  "utf8",
);
const styles = readFileSync("app/styles.css", "utf8");
const previousVoiceLabel = ["Añadir", "varios", "por voz"].join(" ");

describe("dashboard inventory and application background UI", () => {
  it("adds the inventory link to the contextual next-step actions", () => {
    const quickActions = dashboard.match(
      /<section className="card dashboard-quick-actions"[\s\S]*?<\/section>/,
    )?.[0];

    expect(quickActions).toContain('href="/inventory"');
    expect(quickActions).toContain("Revisar inventario");
    expect(quickActions).toContain('className="button dashboard-action-button"');
  });

  it("uses the shorter voice-add label everywhere it is shown", () => {
    expect(inventoryPage).toContain("Añadir por voz");
    expect(voiceInventoryInput).toContain("Añadir por voz");
    expect(voiceShoppingInput).toContain("Añadir por voz");
    expect(`${inventoryPage}${voiceInventoryInput}${voiceShoppingInput}`).not.toContain(previousVoiceLabel);
  });

  it("uses solid semantic application backgrounds for light and dark themes", () => {
    const bodyRule = styles.match(/body \{[\s\S]*?\n\}/)?.[0];
    const darkThemeRule = styles.match(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0];

    expect(styles).toContain("--app-background: #f4f0e6");
    expect(darkThemeRule).toContain("--app-background: #101a1b");
    expect(bodyRule).toContain("background: var(--app-background)");
    expect(bodyRule).not.toMatch(/linear-gradient|radial-gradient|background-image/);
    expect(styles).not.toContain('[data-theme="dark"] body');
  });
});
