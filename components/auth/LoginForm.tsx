"use client";

import { useRef, useState, useTransition } from "react";

import type { AuthActionState } from "@/app/login/actions";
import { signInAction, signUpAction } from "@/app/login/actions";

export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<AuthActionState>({});
  const [isPending, startTransition] = useTransition();

  function runAction(action: (formData: FormData) => Promise<AuthActionState>) {
    const form = formRef.current;

    if (!form) return;

    const formData = new FormData(form);

    startTransition(async () => {
      const nextState = await action(formData);
      setState(nextState);
    });
  }

  return (
    <form ref={formRef} className="card auth-form" onSubmit={(event) => event.preventDefault()}>
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
        <button className="button" type="button" disabled={isPending} onClick={() => runAction(signInAction)}>
          {isPending ? "Procesando..." : "Iniciar sesión"}
        </button>
        <button className="button secondary" type="button" disabled={isPending} onClick={() => runAction(signUpAction)}>
          Crear cuenta
        </button>
      </div>
    </form>
  );
}
