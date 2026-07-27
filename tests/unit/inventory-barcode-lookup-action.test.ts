import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookupOff: vi.fn(),
  createClient: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "user-a" })),
}));

vi.mock("@/lib/nutrition/open-food-facts", () => ({ lookupOpenFoodFactsProduct: mocks.lookupOff }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthenticatedUser: mocks.requireUser }));

import { lookupBarcodeProductAction } from "@/app/inventory/actions";

const barcode = "4006381333931";
const remembered = { barcode, name: "Corregido", default_quantity: 2, default_unit: "ud", default_location: "pantry", default_category: null, nutrition_basis: "per_unit", calories: 90, protein_g: 3, carbs_g: 10, fat_g: 4 };

function supabaseLookup(data: typeof remembered | null, error: { message: string } | null = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }));
  const eqBarcode = vi.fn(() => ({ maybeSingle }));
  const eqUser = vi.fn(() => ({ eq: eqBarcode }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const from = vi.fn(() => ({ select }));
  mocks.createClient.mockResolvedValue({ from });
  return { from, eqUser, eqBarcode };
}

function externalProduct(packageData: { quantity: number; unit: "g" | "ml" } | null, basis: "per_100g" | "per_100ml" | null = packageData?.unit === "ml" ? "per_100ml" : "per_100g") {
  return { status: "found", product: { barcode, name: "Producto externo", package: packageData, nutrition: basis ? { basis, calories: 123.4, proteinG: 5.6, carbsG: 7.8, fatG: 9.1 } : null } };
}

describe("inventory barcode lookup action", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "user-a" }); });

  it("uses the user's remembered correction and never calls the external client", async () => {
    const query = supabaseLookup(remembered);
    await expect(lookupBarcodeProductAction(barcode)).resolves.toMatchObject({ status: "found", product: { name: "Corregido", default_quantity: 2 } });
    expect(mocks.lookupOff).not.toHaveBeenCalled();
    expect(query.eqUser).toHaveBeenCalledWith("user_id", "user-a");
    expect(query.eqBarcode).toHaveBeenCalledWith("barcode", barcode);
  });

  it.each([
    [{ quantity: 500, unit: "g" } as const, "per_100g", 500, "g"],
    [{ quantity: 1000, unit: "ml" } as const, "per_100ml", 1000, "ml"],
    [{ quantity: 450, unit: "g" } as const, "per_100g", 450, "g"],
  ])("keeps observed package %# independent from nutrition basis", async (packageData, basis, quantity, unit) => {
    supabaseLookup(null);
    mocks.lookupOff.mockResolvedValue(externalProduct(packageData, basis as "per_100g" | "per_100ml"));
    await expect(lookupBarcodeProductAction(barcode)).resolves.toMatchObject({ status: "found", product: { default_quantity: quantity, default_unit: unit, nutrition_basis: basis, calories: 123.4 } });
  });

  it("does not invent 100 when package quantity is absent and preserves known metadata", async () => {
    supabaseLookup(null);
    mocks.lookupOff.mockResolvedValue(externalProduct(null, null));
    await expect(lookupBarcodeProductAction(barcode)).resolves.toMatchObject({ status: "found", product: { name: "Producto externo", default_quantity: null, default_unit: null, calories: null } });
  });

  it("keeps actual not-found separate from temporary provider failure", async () => {
    supabaseLookup(null);
    mocks.lookupOff.mockResolvedValueOnce({ status: "not-found" }).mockResolvedValueOnce({ status: "provider-error" });
    await expect(lookupBarcodeProductAction(barcode)).resolves.toMatchObject({ status: "unknown", barcode });
    await expect(lookupBarcodeProductAction(barcode)).resolves.toMatchObject({ status: "error" });
  });
});
