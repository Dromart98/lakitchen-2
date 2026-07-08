"use client";

import { useActionState } from "react";

import type { AuthActionState } from "@/app/login/actions";
import { signInAction, signUpAction } from "@/app/login/actions";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [signInState, signInFormAction, isSignInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction, isSignUpPending] = useActionState(signUpAction, initialState);
  const state = signInState.error || signInState.message ? signInState : signUpState;
  const isPending = isSignInPending || isSignUpPending;

  return (
    <form action={signInFormAction} className="card auth-form">
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
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? "Procesando..." : "Iniciar sesión"}
        </button>
        <button className="button secondary" type="submit" disabled={isPending} formAction={signUpFormAction}>
          Crear cuenta
        </button>
      </div>
    </form>
  );
}
