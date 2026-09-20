import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("provides a keyboard skip link to focusable content after repeated navigation", () => {
  const shell = readFileSync("components/layout/AppShell.tsx", "utf8");
  expect(shell).toContain('href="#main-content"');
  expect(shell).toMatch(/id="main-content"[^>]*tabIndex=\{-1\}/);
  expect(shell.indexOf('id="main-content"')).toBeGreaterThan(shell.indexOf("</header>"));
});
