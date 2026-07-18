import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page">
      <div className="auth-page__layout">
        <section className="auth-intro" aria-labelledby="auth-intro-title">
          <div className="auth-intro__content">
            <p className="auth-intro__eyebrow">Tu cocina, organizada</p>
            <h2 id="auth-intro-title">Todo lo que necesitas para comer mejor</h2>
            <p className="auth-intro__summary">
              LaKitchen te ayuda a controlar el inventario, entender tus macros y organizar recetas y planificación diaria.
            </p>
          </div>

          <div className="auth-intro__benefits" aria-label="Ventajas de LaKitchen">
            <article className="auth-intro__benefit">
              <span aria-hidden="true">01</span>
              <div>
                <h3>Inventario al día</h3>
                <p>Ten claro qué hay en tu cocina y qué necesitas reponer.</p>
              </div>
            </article>
            <article className="auth-intro__benefit">
              <span aria-hidden="true">02</span>
              <div>
                <h3>Macros claros</h3>
                <p>Consulta tus objetivos y el progreso de cada día.</p>
              </div>
            </article>
            <article className="auth-intro__benefit">
              <span aria-hidden="true">03</span>
              <div>
                <h3>Recetas con lo que tienes</h3>
                <p>Aprovecha mejor tus ingredientes al planificar tus comidas.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-panel" aria-label="Acceso a LaKitchen">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
