"use client";

import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

type AuthState = {
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

export function LoginForm() {
  const [state, setState] = useState<AuthState>({});
  const [pendingMode, setPendingMode] = useState<AuthMode | null>(null);
  const isPending = pendingMode !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter instanceof HTMLButtonElement ? nativeEvent.submitter : null;
    const mode = submitter?.value === "sign-up" ? "sign-up" : "sign-in";
    const credentials = getCredentials(new FormData(event.currentTarget));

    if ("error" in credentials) {
      setState({ error: credentials.error });
      return;
    }

    setPendingMode(mode);
    setState({});

    const supabase = createClient();
    const { data, error } = mode === "sign-up"
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);

    setPendingMode(null);

    if (error) {
      setState({
        error: mode === "sign-up"
          ? "No se ha podido crear la cuenta. Revisa los datos e inténtalo de nuevo."
          : "No se ha podido iniciar sesión. Revisa el email y la contraseña.",
      });
      return;
    }

    if (mode === "sign-up" && !data.session) {
      setState({ message: "Cuenta creada. Revisa tu email si Supabase requiere confirmación antes de entrar." });
      return;
    }

    window.location.assign("/dashboard");
  }

  return (
    <form className="card auth-form" onSubmit={handleSubmit}>
      <div>
        <p className="pill">Lakitchenapp V2</p>
        <h1>Accede a tu cocina</h1>
        <p className="muted">Inicia sesión o crea una cuenta con email y contraseña.</p>
      </div>

      <label className="field" htmlFor="email">
        <span>Email</span>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@email.com" />
      </label>

      <label className="field" htmlFor="password">
        <span>Contraseña</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} placeholder="Mínimo 6 caracteres" />
      </label>

      {state.error ? <p className="auth-message error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="auth-message success" role="status">{state.message}</p> : null}

      <div className="auth-actions">
        <button className="button" type="submit" value="sign-in" disabled={isPending}>
          {pendingMode === "sign-in" ? "Procesando..." : "Iniciar sesión"}
        </button>
        <button className="button secondary" type="submit" value="sign-up" disabled={isPending}>
          {pendingMode === "sign-up" ? "Procesando..." : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}
