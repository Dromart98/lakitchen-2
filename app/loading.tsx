import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";

export default function Loading() {
  return (
    <main className="app-state-page">
      <section className="app-state-panel" aria-labelledby="app-state-loading-title">
        <LaKitchenLogo
          className="app-state-logo"
          variant="horizontal"
          theme="light"
          title="LaKitchen"
        />
        <p className="app-state-eyebrow">Un momento</p>
        <h1 className="app-state-title" id="app-state-loading-title">
          Preparando tu cocina
        </h1>
        <p className="app-state-description">
          Estamos cargando la información para que todo esté listo.
        </p>
        <div className="app-state-loading" role="status" aria-live="polite">
          <span className="app-state-loading-indicator" aria-hidden="true">
            <span className="app-state-loading-dot" />
            <span className="app-state-loading-dot" />
            <span className="app-state-loading-dot" />
          </span>
          <span className="app-state-loading-text">Cargando información</span>
        </div>
      </section>
    </main>
  );
}
