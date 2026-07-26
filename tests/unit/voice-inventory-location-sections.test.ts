import { describe, expect, it } from "vitest";

import {
  detectVoiceInventoryLocationEvidence,
  reconcileVoiceInventoryDraftLocation,
} from "@/modules/inventory/voice-inventory-location-sections";
import type { VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";

type Draft = Omit<VoiceInventoryDraftItem, "client_id" | "review_acknowledged">;

const base: Draft = {
  name: "Pollo",
  quantity: 1,
  unit: "kg",
  location: "freezer",
  category: "protein",
  food_state: "raw",
  nutrition_basis: "per_100g",
  calories: 120,
  protein_g: 22,
  carbs_g: 0,
  fat_g: 3,
  confidence: "high",
  nutrition_assumptions: "Valores típicos por 100 g.",
  package_count: null,
  package_size: null,
  package_size_unit: null,
  total_size: null,
  total_size_unit: null,
  issues: [],
};

function reconcile(text: string, name: string, location: Draft["location"] = "freezer") {
  return reconcileVoiceInventoryDraftLocation(
    { ...base, name, location, issues: location ? [] : ["location-unconfirmed"] },
    detectVoiceInventoryLocationEvidence(text),
  );
}

describe("voice inventory location sections", () => {
  it("inherits three simple location sections", () => {
    const text = "En la nevera tengo pollo. En el congelador tengo pimiento. En la despensa tengo atún.";
    expect(reconcile(text, "Pollo").location).toBe("fridge");
    expect(reconcile(text, "Pimiento").location).toBe("freezer");
    expect(reconcile(text, "Atún").location).toBe("pantry");
  });

  it("inherits multiple products and accepts fridge synonyms and line breaks", () => {
    const text = `Frigorífico:\npollo\nleche\nhuevos\n\nCongelador:\npescado\npan\n\nDespensa:\narroz\natún`;
    for (const name of ["Pollo", "Leche", "Huevos"]) expect(reconcile(text, name).location).toBe("fridge");
    for (const name of ["Pescado", "Pan"]) expect(reconcile(text, name).location).toBe("freezer");
    for (const name of ["Arroz", "Atún"]) expect(reconcile(text, name).location).toBe("pantry");

    const synonymText = "En el refrigerador también tengo leche.";
    expect(reconcile(synonymText, "Leche").location).toBe("fridge");
  });

  it("lets an explicit product location override the inherited section", () => {
    const text = "En la nevera tengo pollo y huevos, pero el pan está en el congelador.";
    expect(reconcile(text, "Pollo").location).toBe("fridge");
    expect(reconcile(text, "Huevos").location).toBe("fridge");
    expect(reconcile(text, "Pan").location).toBe("freezer");
  });

  it("does not keep a provider location when the dictation contains no location evidence", () => {
    const text = "Tengo pollo, arroz y aceite.";
    for (const name of ["Pollo", "Arroz", "Aceite"]) {
      const result = reconcile(text, name, "pantry");
      expect(result.location).toBeNull();
      expect(result.issues).toContain("location-unconfirmed");
    }
  });

  it("does not arbitrarily reassign a product repeated in different sections", () => {
    const text = "En la nevera tengo pollo. En el congelador tengo pollo.";
    expect(reconcile(text, "Pollo", "fridge").location).toBe("fridge");
    const pending = reconcile(text, "Pollo", null);
    expect(pending.location).toBeNull();
    expect(pending.issues).toContain("location-unconfirmed");
  });

  it("matches conservative normalized product names without fuzzy spelling", () => {
    const text = "En la nevera tengo pollo y manzanas.";
    expect(reconcile(text, "Pechuga de pollo").location).toBe("fridge");
    expect(reconcile(text, "Manzana").location).toBe("fridge");
  });
});
