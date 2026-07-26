import { describe, expect, it } from "vitest";

import { detectVoiceInventoryLocationEvidence, reconcileVoiceInventoryLocations } from "@/modules/inventory/voice-inventory-location-sections";

const item = (name: string, location: "pantry" | "fridge" | "freezer" | null = null) => ({
  name, quantity: null, unit: null, location, category: null, food_state: "unknown" as const,
  nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null,
  confidence: "low" as const, nutrition_assumptions: "Pendiente", package_count: null,
  package_size: null, package_size_unit: null, total_size: null, total_size_unit: null,
  issues: ["quantity-missing", "unit-missing", "location-unconfirmed"] as Array<"quantity-missing" | "unit-missing" | "location-unconfirmed">,
});

const locations = (text: string, names: string[], providerLocation: "pantry" | "fridge" | "freezer" | null = null) =>
  reconcileVoiceInventoryLocations(text, names.map((name) => ({ ...item(name, providerLocation), issues: [...item(name, providerLocation).issues] }))).map(({ location }) => location);

describe("voice inventory location sections", () => {
  it("inherits and changes three simple sections", () => {
    expect(locations("En la nevera tengo pollo. En el congelador tengo pimiento. En la despensa tengo atún.", ["Pollo", "Pimiento", "Atún"])).toEqual(["fridge", "freezer", "pantry"]);
  });

  it("inherits multiple products separated by punctuation", () => {
    const text = "Nevera: pollo, huevos, leche y queso. Congelador: pescado, pan y pimiento. Despensa: arroz, pasta y aceite.";
    expect(locations(text, ["pollo", "huevos", "leche", "queso", "pescado", "pan", "pimiento", "arroz", "pasta", "aceite"]))
      .toEqual(["fridge", "fridge", "fridge", "fridge", "freezer", "freezer", "freezer", "pantry", "pantry", "pantry"]);
  });

  it("supports synonyms, accents and line breaks", () => {
    expect(locations("En el frigorífico tengo pollo. En el refrigerador también tengo leche.", ["pollo", "leche"])).toEqual(["fridge", "fridge"]);
    expect(locations("Nevera:\npollo\nleche\nhuevos\n\nCongelador:\npescado\npan\n\nDespensa:\narroz\natún", ["pollo", "leche", "huevos", "pescado", "pan", "arroz", "atún"]))
      .toEqual(["fridge", "fridge", "fridge", "freezer", "freezer", "pantry", "pantry"]);
  });

  it("gives an unequivocal product location priority over inherited context", () => {
    expect(locations("En la nevera tengo pollo y huevos, pero el pan está en el congelador.", ["pollo", "huevos", "pan"])).toEqual(["fridge", "fridge", "freezer"]);
  });

  it("clears unsupported provider locations when the text has no location", () => {
    const reconciled = reconcileVoiceInventoryLocations("Tengo pollo, arroz y aceite.", [item("pollo", "pantry"), item("arroz", "fridge"), item("aceite", null)]);
    expect(reconciled.map(({ location }) => location)).toEqual([null, null, null]);
    expect(reconciled.every(({ issues }) => issues.includes("location-unconfirmed"))).toBe(true);
  });

  it("does not overwrite an ambiguous repeated product", () => {
    expect(locations("Nevera: pan. Quizá luego, congelador: pan.", ["pan"], "pantry")).toEqual(["pantry"]);
  });

  it("matches a small safe provider normalization without fuzzy spelling", () => {
    expect(locations("En la nevera tengo pollo. En la despensa tengo arroz.", ["Pechuga de pollo", "Arroz integral"])).toEqual(["fridge", "pantry"]);
    expect(locations("En la nevera tengo pollo.", ["Polo"], "pantry")).toEqual(["pantry"]);
  });

  it("detects del congelador and comma-separated headings", () => {
    expect(detectVoiceInventoryLocationEvidence("De la nevera tengo leche, del congelador tengo pescado, y en la despensa arroz").map(({ location }) => location))
      .toEqual(["fridge", "freezer", "pantry"]);
  });
});
