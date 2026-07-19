import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const button = source("components/forms/PendingSubmitButton.tsx");
const recorder = source("components/macros/MacroMealRecorder.tsx");
const preview = source("components/macros/AiMealEstimationPreview.tsx");
const reconciliation = source("components/macros/AiMealInventoryReconciliation.tsx");
const builder = source("components/meals/InventoryMealBuilder.tsx");

describe("pending meal submit buttons", () => {
  it("implements the shared submit control from the closest form status", () => {
    expect(button).toContain('"use client"');
    expect(button).toContain('import { useFormStatus } from "react-dom"');
    expect(button).toContain("const { pending } = useFormStatus()");
    expect(button).toContain("const isDisabled = disabled || pending");
    expect(button).toContain('type="submit"');
    expect(button).toContain("disabled={isDisabled}");
    expect(button).toContain("aria-disabled={isDisabled}");
    expect(button).toContain("pending ? pendingLabel : idleLabel");
  });

  it("uses the shared button for manual macro-only recording without a manual pending state", () => {
    expect(recorder).toContain('import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton"');
    expect(recorder).toContain('idleLabel="Guardar solo macros" pendingLabel="Guardando macros…"');
    expect(recorder).not.toMatch(/useState<[^>]*pending|\[pending,\s*setPending\]/);
  });

  it("keeps the AI macro-only form independent and uses its own shared submit control", () => {
    expect(preview).toContain('action={addMealLogAction}');
    expect(preview).toContain('idleLabel="Registrar solo macros" pendingLabel="Registrando macros…"');
    expect(preview).toContain("<AiMealInventoryReconciliation");
    expect(preview).not.toMatch(/useState<[^>]*pending|\[pending,\s*setPending\]/);
  });

  it("keeps reconciliation validation as the explicit disabled condition", () => {
    expect(reconciliation).toContain('action={consumeAiMealInventoryAction}');
    expect(reconciliation).toContain("disabled={!ready}");
    expect(reconciliation).toContain('idleLabel="Registrar y descontar inventario" pendingLabel="Registrando y descontando…"');
  });

  it("keeps meal-builder validation while adding the pending state", () => {
    expect(builder).toContain('action={consumeMealBuilderAndLogMealAction}');
    expect(builder).toContain("disabled={!canSubmitMeal}");
    expect(builder).toContain('"Registrar comida y descontar inventario"');
    expect(builder).toContain('"Registrando y descontando…"');
    expect(builder).toContain('"Registrar comida"');
    expect(builder).toContain('"Registrando comida…"');
  });
});
