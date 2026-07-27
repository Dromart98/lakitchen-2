# LaKitchen

LaKitchen es una aplicación web mobile-first para gestionar inventario doméstico, seguimiento nutricional, recetas, planificación de comidas y lista de la compra desde un único flujo.

## Capacidades principales

- Inventario por despensa, nevera y congelador, con cantidades, categorías, caducidad, nutrición, filtros, edición y consumo.
- Registro de comidas y macros de forma manual o mediante flujos asistidos de texto, foto e ingredientes del inventario.
- Perfil nutricional, objetivos diarios, progreso e historial.
- Recetas y planes que tienen en cuenta disponibilidad, cantidades, caducidades y datos nutricionales guardados.
- Lista de la compra con transferencia de artículos al inventario.
- Flujos revisables de voz, foto y código de barras cuando el navegador o los datos disponibles lo permiten.
- Tema claro, oscuro o del sistema.

Las estimaciones asistidas se presentan para revisión antes de confirmar datos cuando existe ambigüedad. La aplicación prioriza lenguaje cotidiano y no expone detalles internos de proveedores o modelos en la interfaz.

## Stack principal

- Next.js 15 y React 19.
- TypeScript.
- Supabase Auth y PostgreSQL con RLS para datos personales.
- Zod para validación.
- Vitest para pruebas.
- Vercel para despliegue web.

Consulta `package.json` para las versiones y dependencias vigentes.

## Desarrollo

```bash
npm install
npm run dev
```

Validaciones disponibles:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Fuentes de verdad

- `PRODUCT.md`: propósito, usuarios, capacidades y principios de producto.
- `DESIGN.md`: sistema visual, componentes, accesibilidad y reglas de diseño.
- `AGENTS.md`: instrucciones específicas del repositorio para agentes de desarrollo.
- Código de `main`: estado funcional real.

El README resume el producto y la puesta en marcha. No mantiene una lista paralela de funcionalidades pendientes ni sustituye al código como fuente del estado implementado.
