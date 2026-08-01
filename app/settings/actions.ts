"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const SETTINGS_PATH = "/settings";

export async function deleteAccountAction(formData: FormData) {
  if (formData.get("delete_confirmation") !== "confirmed") {
    redirect(`${SETTINGS_PATH}?accountError=confirmation-required`);
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "account deletion");

  let deletionFailed = false;

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    deletionFailed = Boolean(error);
  } catch {
    deletionFailed = true;
  }

  if (deletionFailed) {
    console.warn("Account deletion could not be completed safely.");
    redirect(`${SETTINGS_PATH}?accountError=delete-failed`);
  }

  // The account no longer exists. Clear its browser session even if remote
  // revocation can no longer find it, then return to the public entry point.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?accountDeleted=true");
}
