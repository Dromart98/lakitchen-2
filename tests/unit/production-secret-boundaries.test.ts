import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function filesIn(path: string): string[] {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

const sourceFiles = filesIn("app").concat(filesIn("components"), filesIn("lib"), filesIn("modules"));
const clientFiles = sourceFiles.filter((path) => source(path).startsWith('"use client"'));
const openAiFiles = filesIn("lib/openai");

describe("production secret boundary contracts", () => {
  it("keeps server-only credentials and modules out of client components", () => {
    for (const path of clientFiles) {
      const contents = source(path);
      expect(contents, path).not.toContain("OPENAI_API_KEY");
      expect(contents, path).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(contents, path).not.toContain("NEXT_PUBLIC_OPENAI_API_KEY");
      expect(contents, path).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
      expect(contents, path).not.toMatch(/from ["'][^"']*lib\/openai\//);
      expect(contents, path).not.toMatch(/from ["'][^"']*lib\/supabase\/server/);
      expect(contents, path).not.toMatch(/from ["']next\/(headers|cookies)/);
    }
  });

  it("keeps OpenAI calls server-side, private, and non-persistent", () => {
    for (const path of openAiFiles) {
      const contents = source(path);
      expect(contents, path).toContain("store: false");
      expect(contents, path).not.toMatch(/console\.(?:log|warn|error|debug)\([^\n]*(?:apiKey|Authorization|output_text|responseBody|data:image)/);
    }

    for (const path of ["app/macros/actions.ts", "app/plan/actions.ts", "app/recipes/actions.ts", "app/inventory/actions.ts", "app/shopping-list/actions.ts"]) {
      expect(source(path), path).toMatch(/^"use server"/);
    }
  });

  it("does not persist photos, data URLs, or raw OpenAI responses", () => {
    const photoAction = source("app/macros/actions.ts");
    const persistenceSources = [photoAction, source("app/plan/actions.ts"), source("app/recipes/actions.ts")].join("\n");
    expect(photoAction).toContain("data:image/jpeg;base64");
    expect(persistenceSources).not.toMatch(/(?:insert|upsert|update)\([^)]*(?:imageDataUrl|data:image|output_text|responseBody|raw_response)/s);
    expect(sourceFiles.map(source).join("\n")).not.toMatch(/console\.(?:log|warn|error|debug)\([^\n]*data:image/);
  });

  it("keeps local environment files and Vercel state ignored", () => {
    const gitignore = source(".gitignore");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env*.local");
    expect(gitignore).toContain(".vercel");
  });

  it("documents public Supabase configuration separately from server-only OpenAI configuration", () => {
    const envExample = source(".env.example");
    expect(envExample).toContain("Public browser configuration");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL=");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=");
    expect(envExample).toContain("Server-only OpenAI configuration");
    expect(envExample).toContain("OPENAI_API_KEY=");
    expect(envExample).toContain("OPENAI_VOICE_INVENTORY_BATCH_MODEL=");
    expect(envExample).toContain("Optional private server-only model override");
    expect(envExample).not.toContain("NEXT_PUBLIC_OPENAI_API_KEY=");
  });

  it("does not version obvious credential formats", () => {
    const credentialPattern = /sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}/;
    for (const path of filesIn("app").concat(filesIn("components"), filesIn("lib"), filesIn("modules"), [".env.example", "vercel.json", "next.config.mjs"])) {
      expect(source(path).match(credentialPattern) ? `Posible secreto detectado en ${path}` : null).toBeNull();
    }
  });
});
