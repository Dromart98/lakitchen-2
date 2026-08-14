"use client";

import { useState, type FormEvent } from "react";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";
import { createClient } from "@/lib/supabase/client";
import { getSafeAuthErrorMessage } from "@/modules/auth/safe-auth-error";

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
      setState({ error: getSafeAuthErrorMessage(error) });
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
    <form onSubmit={handleSubmit} className="auth-form" aria-labelledby="auth-form-title">
      <div className="auth-form__header">
        <LaKitchenLogo className="auth-form__logo" variant="horizontal" theme="light" title="LaKitchen" />
        <p className="auth-form__eyebrow">Acceso seguro</p>
        <h1 id="auth-form-title">Accede a tu cocina</h1>
        <p>Inicia sesión o crea una cuenta con email y contraseña.</p>
      </div>

      <div className="auth-form__fields">
        <label className="auth-form__field" htmlFor="email">
          <span>Email</span>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@email.com" />
        </label>

        <label className="auth-form__field" htmlFor="password">
          <span>Contraseña</span>
          <span className="auth-password">
            <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} placeholder="Mínimo 6 caracteres" />
            <button
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              className="auth-password__toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </span>
        </label>
      </div>

      <div className="auth-form__messages" aria-live="polite">
        {state.error ? <p className="auth-form__message auth-form__message--error" role="alert"><strong>Error</strong>{state.error}</p> : null}
        {state.message ? <p className="auth-form__message auth-form__message--success" role="status"><strong>Información</strong>{state.message}</p> : null}
      </div>

      <div>
        <p className="auth-form__helper">Puedes entrar con una cuenta existente o crear una nueva con los mismos datos.</p>
        <div className="auth-form__actions">
          <button className="auth-form__primary" type="submit" name="authMode" value="sign-in" disabled={isPending}>
            {pendingMode === "sign-in" ? "Procesando..." : "Iniciar sesión"}
          </button>
          <button className="auth-form__secondary" type="submit" name="authMode" value="sign-up" disabled={isPending}>
            {pendingMode === "sign-up" ? "Procesando..." : "Crear cuenta"}
          </button>
        </div>
      </div>
    </form>
  );
}
