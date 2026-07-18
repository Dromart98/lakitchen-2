"use client";

import Link from "next/link";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="app-state-page">
      <section className="app-state-panel" aria-labelledby="app-state-error-title">
        <LaKitchenLogo
          className="app-state-logo"
          variant="horizontal"
          theme="light"
          title="LaKitchen"
        />
        <p className="app-state-eyebrow">No hemos podido continuar</p>
        <h1 className="app-state-title" id="app-state-error-title">
          Algo no ha salido bien
        </h1>
        <p className="app-state-description">
          Ha ocurrido un imprevisto. Puedes volver a intentarlo o regresar al inicio.
        </p>
        <div className="app-state-actions">
          <button className="app-state-action app-state-action-primary" type="button" onClick={reset}>
            Intentar de nuevo
          </button>
          <Link className="app-state-action app-state-action-secondary" href="/">
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
