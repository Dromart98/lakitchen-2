import Link from "next/link";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-panel" aria-labelledby="not-found-title">
        <div className="not-found-content">
          <LaKitchenLogo
            className="not-found-logo"
            variant="horizontal"
            theme="light"
            title="LaKitchen"
          />
          <p className="not-found-eyebrow">Error 404</p>
          <h1 className="not-found-title" id="not-found-title">
            Esta página no está en tu cocina
          </h1>
          <p className="not-found-description">
            Puede que el enlace haya cambiado o que la dirección no sea correcta.
          </p>
          <div className="not-found-actions">
            <Link className="not-found-action not-found-action--primary" href="/">
              Volver al inicio
            </Link>
            <Link className="not-found-action not-found-action--secondary" href="/login">
              Iniciar sesión
            </Link>
          </div>
        </div>
        <div className="not-found-visual">
          <span className="not-found-code" aria-hidden="true">
            404
          </span>
        </div>
      </section>
    </main>
  );
}
