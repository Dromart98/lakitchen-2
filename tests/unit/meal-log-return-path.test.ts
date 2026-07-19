import { describe, expect, it } from "vitest";

import { getMealLogReturnPath } from "@/modules/meals/macro-meal-mode";

describe("meal log return paths", () => {
  it("returns Text AI confirmations to the Text AI panel", () => {
    expect(getMealLogReturnPath("/macros", "text-ai")).toBe("/macros?mealMode=text-ai");
  });

  it("does not allow an arbitrary mode to alter the destination", () => {
    expect(getMealLogReturnPath("/macros", "ingredients")).toBe("/macros");
    expect(getMealLogReturnPath("/other", "text-ai")).toBe("/dashboard");
  });
});
