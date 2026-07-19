import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMealBuilderCompatibilityDestination } from "@/modules/meals/meal-builder";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = source("app/dashboard/page.tsx");
const compatibilityPage = source("app/meal-builder/page.tsx");
const macrosActions = source("app/macros/actions.ts");
const preview = source("components/macros/AiMealEstimationPreview.tsx");
const reconciliation = source("components/macros/AiMealInventoryReconciliation.tsx");
const textEstimator = source("components/macros/TextAiMealEstimator.tsx");
const photoEstimator = source("components/macros/PhotoAiMealEstimator.tsx");
const appShell = source("components/layout/AppShell.tsx");
const navigation = source("components/navigation/navigation-items.ts");

describe("critical meal flow regression contracts", () => {
  it("keeps the dashboard CTA as the sole meal-registration entry point", () => {
    expect(dashboard).toContain('href="/macros?mealMode=ingredients#registrar-comida"');
    expect(dashboard).not.toContain("Registro manual rápido");
    expect(dashboard).not.toContain("Componer comida");
    expect(dashboard).not.toContain('action={addMealLogAction}');
  });

  it("keeps authenticated navigation on supported sections without a meal-builder section", () => {
    expect(appShell).toContain('href="/dashboard"');
    expect(navigation).toContain('href: "/dashboard"');
    expect(dashboard).toContain('href="/recipes?mode=all"');
    expect(navigation).toContain('href: "/plan"');
    expect(navigation).toContain('href: "/inventory"');
    expect(navigation).toContain('href: "/macros"');
    expect(navigation).not.toContain('href: "/meal-builder"');
  });

  it("redirects legacy meal-builder URLs to a fixed internal path and allowlists query fields", () => {
    expect(buildMealBuilderCompatibilityDestination({
      repeatMeal: "11111111-1111-4111-8111-111111111111",
      mealError: "invalid-lines",
      mealSuccess: "meal-created",
      next: "https://example.test",
      mealMode: "manual",
      return_to: "/dashboard",
    })).toBe("/macros?mealMode=ingredients&repeatMeal=11111111-1111-4111-8111-111111111111&mealError=invalid-lines&mealSuccess=meal-created#registrar-comida");
    expect(buildMealBuilderCompatibilityDestination({
      repeatMeal: ["first", "second"],
      mealError: ["failure"],
      mealSuccess: "",
    })).toBe("/macros?mealMode=ingredients#registrar-comida");
    expect(compatibilityPage).toContain("redirect(buildMealBuilderCompatibilityDestination");
    expect(compatibilityPage).not.toContain("AppShell");
    expect(compatibilityPage).not.toContain("createClient");
    expect(compatibilityPage).not.toContain("consume_meal_builder_items_and_log_meal");
  });

  it("keeps estimation side-effect free and delegates inventory consumption only to the atomic action", () => {
    for (const estimator of [textEstimator, photoEstimator]) {
      expect(estimator).not.toContain("addMealLogAction");
      expect(estimator).not.toContain("consumeAiMealInventoryAction");
      expect(estimator).not.toContain("createClient");
    }
    expect(preview).toContain("Registrar solo macros");
    expect(preview).toContain('action={addMealLogAction}');
    expect(reconciliation).toContain('action={consumeAiMealInventoryAction}');
    expect(macrosActions).toContain('rpc("consume_meal_builder_items_and_log_meal"');
    expect(macrosActions).not.toContain("addMealLogAction");
    expect(macrosActions).not.toContain('from("daily_meal_logs")');
    expect(macrosActions).not.toContain('from("daily_meal_log_items")');
  });
});
