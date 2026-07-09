"use client";

import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

type AuthState = {
  error?: string;
  message?: string;
};

type AuthMode = "sign-in" | "sign-up";

export function LoginForm() {
  const [state, setState] = useState<AuthState>({});
  const [pendingMode, setPendingMode] = useState<AuthMode | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isPending = pendingMode !== null;

  async function handleAuth(mode: AuthMode, formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setState({ error: "Email y contraseña son obligatorios." });
      return;
    }

    setPendingMode(mode);
    setState({});

    const supabase = createClient();
    const { data, error } = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      setState({ error: error.message });
      setPendingMode(null);
      return;
    }

    if (data.session) {
      window.location.assign("/dashboard");
      return;
    }

    setState({ message: "Revisa tu email para confirmar la cuenta antes de iniciar sesión." });
    setPendingMode(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value === "sign-up" ? "sign-up" : "sign-in";
    await handleAuth(mode, new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="card auth-form">
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
        <span className="password-field">
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} placeholder="Mínimo 6 caracteres" />
          <button
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            className="password-toggle"
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </span>
      </label>

      {state.error ? <p className="auth-message error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="auth-message success" role="status">{state.message}</p> : null}

      <div className="auth-actions">
        <button className="button" type="submit" name="authMode" value="sign-in" disabled={isPending}>
          {pendingMode === "sign-in" ? "Procesando..." : "Iniciar sesión"}
        </button>
        <button className="button secondary" type="submit" name="authMode" value="sign-up" disabled={isPending}>
          {pendingMode === "sign-up" ? "Procesando..." : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}
