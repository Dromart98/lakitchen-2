"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  message?: string;
};

function getCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Introduce tu email y contraseña." };
  }

  return { email, password };
}

export async function signInAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const credentials = getCredentials(formData);

  if ("error" in credentials) {
    return { error: credentials.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return { error: "No se ha podido iniciar sesión. Revisa el email y la contraseña." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
  throw new Error("Login redirect did not complete.");
}

export async function signUpAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const credentials = getCredentials(formData);

  if ("error" in credentials) {
    return { error: credentials.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(credentials);

  if (error) {
    return { error: "No se ha podido crear la cuenta. Revisa los datos e inténtalo de nuevo." };
  }

  revalidatePath("/", "layout");

  if (data.session) {
    redirect("/dashboard");
    throw new Error("Signup redirect did not complete.");
  }

  return { message: "Cuenta creada. Revisa tu email si Supabase requiere confirmación antes de entrar." };
}
