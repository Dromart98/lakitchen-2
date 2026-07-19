import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const dashboard = source("app/dashboard/page.tsx");
const macros = source("components/macros/MacroMealRecorder.tsx");
const history = source("app/meal-history/page.tsx");
const compatibilityPage = source("app/meal-builder/page.tsx");

describe("meal registration consolidation", () => {
  it("makes Macros the dashboard registration entrypoint without a duplicate form", () => {
    expect(dashboard).toContain('href="/macros?mealMode=ingredients#registrar-comida"');
    expect(dashboard).not.toContain("Componer comida");
    expect(dashboard).not.toContain("Registro manual rápido");
    expect(dashboard).not.toContain('action={addMealLogAction}');
    expect(dashboard).toContain('href="/recipes?mode=all"');
    expect(dashboard).toContain('href="/plan"');
    expect(dashboard).toContain("Eliminar comida");
  });

  it("keeps the manual value but communicates safe inventory behavior and embeds the builder", () => {
    expect(macros).toContain('id="registrar-comida"');
    expect(macros).toContain('mode === "manual"');
    expect(macros).toContain("Solo macros");
    expect(macros).toContain("Desde inventario");
    expect(macros).toContain("Este modo no utiliza ni descuenta productos del inventario.");
    expect(macros).toContain("se registrará la comida y se descontará el inventario.");
    expect(macros).toContain('returnPath="/macros"');
  });

  it("repeats snapshot meals in Macros and makes the old route redirect only", () => {
    expect(history).toContain('/macros?mealMode=ingredients&repeatMeal=${meal.id}#registrar-comida');
    expect(history).toContain("Revisar y repetir");
    expect(history).not.toContain("Repetir en el compositor");
    expect(compatibilityPage).toContain("redirect(buildMealBuilderCompatibilityDestination");
    expect(compatibilityPage).not.toContain("InventoryMealBuilder");
    expect(compatibilityPage).not.toContain("AppShell");
  });
});
