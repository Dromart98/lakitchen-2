import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/plan/page.tsx", "utf8");
const generator = readFileSync(
  "components/plan/DailyPlanGenerator.tsx",
  "utf8",
);
const tabs = readFileSync("components/plan/PlanViewTabs.tsx", "utf8");
const saved = readFileSync("components/plan/SavedDailyPlans.tsx", "utf8");
const styles = readFileSync("app/styles.css", "utf8");

describe("daily plan visual hierarchy", () => {
  it("uses the compact diet header and keeps the inventory meal action secondary", () => {
    expect(page).toContain("Dieta con tu inventario");
    expect(page).not.toContain("Planifica tus próximos días");
    expect(page).toContain("/macros?mealMode=ingredients#registrar-comida");
    expect(page).toContain("target.calories");
  });

  it("provides mounted, keyboard-accessible generate and saved panels", () => {
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain('aria-controls="plan-generate-panel"');
    expect(tabs).toContain('aria-controls="plan-saved-panel"');
    expect(tabs).toContain('hidden={activeTab !== "generate"}');
    expect(tabs).toContain('hidden={activeTab !== "saved"}');
    expect(tabs).toContain('event.key === "ArrowRight"');
    expect(tabs).toContain('event.key === "ArrowLeft"');
  });

  it("keeps the generator first, with compact inventory preparation and preview controls", () => {
    expect(generator).toContain("Configura tu plan");
    expect(generator).toContain("Generar plan");
    expect(generator).toContain("Generando plan…");
    expect(generator).toContain("Ver productos que necesitan revisión");
    expect(generator).toContain("Vista previa sin guardar");
    expect(generator).toMatch(
      /type="button"[\s\S]*onClick=\{invalidatePreview\}/,
    );
    expect(generator.indexOf('className="plan-options"')).toBeLessThan(
      generator.indexOf('className="plan-readiness"'),
    );
  });

  it("keeps saved plans as a separate, compact view", () => {
    expect(saved).toContain("Planes guardados");
    expect(saved).toContain("Próximos siete días");
    expect(saved).toContain("Eliminar plan");
    expect(saved).toMatch(/Ve a Generar para crear el[\s\S]*primero/);
  });

  it("uses a single-column-first layout without a desktop generator sidebar", () => {
    expect(styles).not.toContain(
      "grid-template-columns: minmax(280px, 0.65fr) minmax(0, 1.35fr)",
    );
    expect(styles).toContain('.plan-tabs__tab[aria-selected="true"]');
    expect(styles).toContain(".plan-readiness details");
  });
});
