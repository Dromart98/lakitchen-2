import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function submitBody(file: string) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  return source.slice(source.indexOf("async function submit()"), source.indexOf("const success ="));
}
describe("AI inventory reconciliation reset", () => {
  it("unmounts Text AI reconciliation before each new estimation, including same, larger and smaller ingredient results", () => {
    const body = submitBody("components/macros/TextAiMealEstimator.tsx");
    expect(body.indexOf("setResult(null)")).toBeGreaterThan(body.indexOf("const version = ++requestVersion.current"));
    expect(body.indexOf("setResult(null)")).toBeLessThan(body.indexOf("estimateTextMealAction"));
  });
  it("unmounts Photo AI reconciliation before each analysis and clears it when changing photos", () => {
    const source = readFileSync(resolve(process.cwd(), "components/macros/PhotoAiMealEstimator.tsx"), "utf8");
    expect(source).toContain("function clearPhoto() { requestVersion.current += 1; setResult(null)");
    const body = submitBody("components/macros/PhotoAiMealEstimator.tsx");
    expect(body.indexOf("setResult(null)")).toBeGreaterThan(body.indexOf("const version = ++requestVersion.current"));
    expect(body.indexOf("setResult(null)")).toBeLessThan(body.indexOf("estimatePhotoMealAction"));
  });
  it("creates selected quantities and payload lines solely from the mounted result ingredients", () => {
    const source = readFileSync(resolve(process.cwd(), "components/macros/AiMealInventoryReconciliation.tsx"), "utf8");
    expect(source).toContain("useState<(string|null)[]>(()=>matches.map");
    expect(source).toContain("result.ingredients.map((ingredient,index)");
    expect(source).toContain("lines.length===result.ingredients.length");
  });
});
