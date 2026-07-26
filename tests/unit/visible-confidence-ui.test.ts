import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const visibleConfidenceLabel = /Confianza (?:alta|media|baja)|(?:Alta|Media|Baja) confianza|confidence (?:score|level)|(?:high|medium|low) confidence/i;

describe("user-facing AI estimation guidance", () => {
  it("keeps manual inventory estimation practical while retaining internal confidence contracts", () => {
    const controls = source("components/inventory/InventoryNutritionAiControls.tsx");
    const domain = source("modules/inventory/inventory-ai-nutrition.ts");

    expect(controls).toContain("Estimación realizada. Revisa los valores antes de guardar.");
    expect(controls).not.toMatch(visibleConfidenceLabel);
    expect(domain).toContain('confidence: z.enum(["low", "medium", "high"])');
    expect(domain).toContain("calibrateInventoryNutritionAiConfidence");
  });

  it("keeps low-confidence inventory dictation review without exposing its technical label", () => {
    const preview = source("components/inventory/VoiceInventoryBatchPreview.tsx");
    const domain = source("modules/inventory/voice-inventory-batch.ts");

    expect(preview).toContain('"low-confidence": "Revisa los valores estimados"');
    expect(preview).not.toMatch(visibleConfidenceLabel);
    expect(domain).toContain('["low-confidence", normalizedItem.confidence === "low"]');
  });

  it("does not expose confidence levels in text or photo meal review", () => {
    const preview = source("components/macros/AiMealEstimationPreview.tsx");
    const textEstimator = source("components/macros/TextAiMealEstimator.tsx");
    const photoEstimator = source("components/macros/PhotoAiMealEstimator.tsx");
    const reconciliation = source("components/macros/AiMealInventoryReconciliation.tsx");

    expect(preview).toContain("Estimación orientativa");
    for (const component of [preview, textEstimator, photoEstimator, reconciliation]) {
      expect(component).not.toMatch(visibleConfidenceLabel);
    }
    expect(photoEstimator).toContain('confidence: "low" as const');
  });

  it("uses review guidance for low-confidence shopping dictation and preserves confirmation", () => {
    const preview = source("components/shopping/VoiceShoppingBatchPreview.tsx");
    const domain = source("modules/shopping/voice-shopping-batch.ts");

    expect(preview).toContain('"low-confidence": "Revisa los valores estimados"');
    expect(preview).toContain("He revisado este producto");
    expect(preview).not.toMatch(visibleConfidenceLabel);
    expect(domain).toContain('["low-confidence", item.confidence === "low"]');
  });
});
