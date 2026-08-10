import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/auth", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "authenticated-user" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: mocks.signOut } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin: { deleteUser: mocks.deleteUser } } })),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccountAction } from "@/app/settings/actions";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function confirmedDeletion() {
  const formData = new FormData();
  formData.set("delete_confirmation", "confirmed");
  return formData;
}

describe("account deletion server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("deletes only the user reconstructed from the authenticated session", async () => {
    await expect(deleteAccountAction(confirmedDeletion())).rejects.toThrow(
      "redirect:/login?accountDeleted=true",
    );

    expect(mocks.deleteUser).toHaveBeenCalledOnce();
    expect(mocks.deleteUser).toHaveBeenCalledWith("authenticated-user");
    expect(mocks.deleteUser).not.toHaveBeenCalledWith("second-user");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("requires explicit confirmation before creating an administrative client", async () => {
    await expect(deleteAccountAction(new FormData())).rejects.toThrow(
      "redirect:/settings?accountError=confirmation-required",
    );

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("fails safely without clearing the session when deletion fails", async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: "foreign key violation" } });

    await expect(deleteAccountAction(confirmedDeletion())).rejects.toThrow(
      "redirect:/settings?accountError=delete-failed",
    );

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalledWith("/login?accountDeleted=true");
  });
});

describe("account deletion contracts", () => {
  it("keeps the administrative secret server-side and does not accept a user id", () => {
    const action = source("app/settings/actions.ts");
    const admin = source("lib/supabase/admin.ts");
    const page = source("app/settings/page.tsx");

    expect(action).toMatch(/^"use server"/);
    expect(action).toContain("deleteUser(user.id)");
    expect(action).not.toMatch(/formData\.get\(["']user_id["']\)/);
    expect(admin).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(page).not.toContain("createAdminClient");
  });

  it("renders irreversible copy, required confirmation, pending state and safe errors", () => {
    const page = source("app/settings/page.tsx");

    expect(page).toContain("Eliminar cuenta");
    expect(page).toContain("se eliminarán definitivamente");
    expect(page).toMatch(/name="delete_confirmation" required type="checkbox"/);
    expect(page).toContain("Eliminando cuenta…");
    expect(page).toContain('role="alert"');
    expect(page).not.toMatch(/service_role|foreign key violation/i);
  });

  it("audits every private auth relation as cascading and dependent ownership relations as safe", () => {
    const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
    const migrations = readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => source(`supabase/migrations/${name}`))
      .join("\n");
    const authReferences = migrations.match(
      /references\s+auth\.users\s*\(id\)\s+on\s+delete\s+\w+/gi,
    );

    expect(authReferences?.length).toBe(18);
    for (const reference of authReferences ?? []) {
      expect(reference.toLowerCase()).toContain("on delete cascade");
    }
    expect(migrations).toMatch(
      /meal_log_id uuid not null references public\.daily_meal_logs\(id\) on delete cascade/i,
    );
    expect(migrations).toMatch(
      /foreign key \(recipe_id, user_id\)[\s\S]{0,100}references public\.user_saved_ai_recipes\(id, user_id\)[\s\S]{0,40}on delete cascade/i,
    );
    expect(migrations).toMatch(
      /user_text_meal_analysis_cache[\s\S]{0,200}references auth\.users\(id\) on delete cascade/i,
    );
    expect(migrations).toMatch(
      /user_photo_meal_analysis_cache[\s\S]{0,200}references auth\.users\(id\) on delete cascade/i,
    );
    expect(migrations).toMatch(
      /ai_usage_events[\s\S]{0,200}references auth\.users\(id\) on delete cascade/i,
    );
  });
});
