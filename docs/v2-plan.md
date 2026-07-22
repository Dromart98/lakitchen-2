# Lakitchenapp V2 plan

## Objetivo

Este repositorio (`Dromart98/lakitchen2`) será la base de **Lakitchenapp V2**: una versión limpia, progresiva y estable de la app para gestionar la cocina desde el móvil.

La V2 se construirá por commits pequeños, priorizando primero autenticación, datos por usuario y funcionalidades básicas antes de recuperar módulos avanzados como recetas, IA, escáner de tickets o pagos.

## Stack elegido

El stack base para la V2 será:

- **Next.js** con App Router.
- **React**.
- **TypeScript** en modo estricto.
- **Supabase Auth** para autenticación.
- **Supabase Database** sobre PostgreSQL para persistencia.
- **Row Level Security (RLS)** para separar datos por usuario.
- **Vitest** para pruebas unitarias.
- **Vercel** para despliegue.

## Decisión sobre Prisma

El repositorio contiene actualmente un esquema Prisma/PostgreSQL. No se eliminará en este primer commit porque puede servir como referencia de dominio, especialmente para inventario, comidas, recetas y perfiles nutricionales.

Sin embargo, para el MVP inicial de la V2 la decisión técnica es:

- **No usar Prisma como capa principal de datos.**
- Usar **Supabase Auth + Supabase Database + RLS** como base principal.
- Crear migraciones SQL de Supabase cuando se introduzcan tablas reales.
- Mantener Prisma temporalmente como referencia legacy hasta decidir si se elimina o se adapta más adelante.

Motivo: Supabase permite resolver autenticación, sesión, base de datos y aislamiento por usuario con menos complejidad inicial para una app mobile-first desplegada en Vercel.

## Funcionalidades del MVP inicial

El MVP inicial debe incluir solo lo necesario para una app estable y usable:

1. Login email/password con Supabase.
2. Datos separados por usuario mediante RLS.
3. Perfil nutricional básico del usuario.
4. Calculadora de macros del usuario.
5. Inventario básico:
   - despensa,
   - nevera,
   - congelador,
   - cantidad,
   - unidad,
   - fecha de caducidad opcional.
6. Lista de la compra básica:
   - añadir productos,
   - marcar como comprados,
   - eliminar productos.
7. Diseño simple usable en móvil.
8. Build funcionando en Vercel.

## Funcionalidades para fases futuras

Quedan fuera del MVP inicial:

1. Tracking diario completo.
2. Recetas generadas o sugeridas.
3. IA para recetas, dieta o macros automáticos.
4. Escáner de tickets.
5. Login con Google.
6. Login con Apple.
7. SaaS, pagos o planes premium.
8. PWA avanzada, IndexedDB y cola offline.
9. Automatizaciones complejas de inventario.

## Módulos actuales legacy/referencia

El repositorio contiene módulos demo o adelantados que no se usarán todavía como producto final:

- `modules/nutrition/*`: lógica de cálculo de macros.
- `modules/recipes/*`: generación de recetas por reglas.
- `modules/meals/*`: resumen de comidas y macros diarios.
- `components/nutrition/*`: componentes de UI de macros.
- `components/dashboard/RecipeSuggestion.tsx`: sugerencia de recetas.
- `lib/demo-data.ts`: datos mock para dashboard y endpoints demo.
- `prisma/schema.prisma`: esquema amplio de referencia para dominio.

Regla para la V2: no borrar estos módulos en la preparación inicial, pero tampoco construir el MVP encima de datos demo ni flujos avanzados.

## Orden de implementación por commits

### Commit 1: preparación limpia

- Documentar plan de V2.
- Añadir variables de entorno de Supabase en `.env.example`.
- Corregir configuración de tests si hace falta.
- No instalar Supabase todavía salvo necesidad estricta.
- No cambiar el dashboard de forma masiva.

### Commit 2: base Supabase

- Instalar dependencias de Supabase.
- Crear clientes Supabase para server/client.
- Añadir documentación de variables de entorno.
- Preparar middleware si es necesario para sesión.
- Mantener UI mínima.

### Commit 3: login email/password

- Crear pantalla `/login`.
- Crear formulario de login/registro.
- Proteger rutas privadas.
- Redirigir según sesión.

### Commit 4: perfil nutricional

- Crear tabla de perfil de usuario con RLS.
- Añadir formulario básico de perfil.
- Guardar datos por `auth.uid()`.

### Commit 5: calculadora de macros

- Reutilizar o adaptar la lógica existente de macros.
- Conectar resultados al perfil del usuario.
- Añadir tests para casos principales.

### Commit 6: inventario básico

- Crear tabla `inventory_items` con RLS.
- Crear pantalla de inventario.
- Añadir CRUD mínimo.

### Commit 7: lista de la compra

- Crear tabla `shopping_list_items` con RLS.
- Crear pantalla de lista de compra.
- Añadir crear, marcar y eliminar.

### Commits posteriores

- Tracking diario.
- Recetas.
- IA.
- Escáner de tickets.
- OAuth Google/Apple.
- SaaS/pagos.

## Próxima fase priorizada: estabilización de Inventario y Macros

Esta fase debe ejecutarse mediante cambios pequeños, comprobables y separados. Primero se resolverán los fallos funcionales; después se reorganizará la pantalla de Inventario y, por último, se aplicará el pulido visual.

### P0 — Corrección funcional

1. **Corregir el dictado por voz de Inventario.**
   - El flujo debe añadir realmente los productos confirmados al inventario.
   - Validar persistencia, mensajes de éxito y tratamiento de errores antes de continuar con nuevas mejoras del dictado.

### P1 — Funcionalidad principal

2. **Añadir cálculo automático de macros al dictado por voz de Inventario.**
   - Calcular o completar calorías, proteínas, carbohidratos y grasas antes del guardado.
   - Permitir revisión del resultado antes de confirmar el alta cuando la estimación sea generada por IA.

3. **Mostrar las comidas registradas al final de la página de Macros.**
   - El historial visible debe confirmar qué comidas se han registrado y sus macros.
   - Debe actualizarse tras registrar una comida sin duplicar registros.

### P1 — Reorganización de Inventario

4. **Hacer que “Tus productos” sea el contenido principal de la pantalla.**
   - El listado del inventario debe aparecer antes que las herramientas secundarias.

5. **Mover “Encuentra rápido” a un desplegable.**
   - Debe permanecer accesible sin ocupar espacio vertical cuando no se utiliza.

6. **Mover el lector de código de barras a un desplegable.**
   - Mantener intacta su funcionalidad, permisos y flujo de guardado.

7. **Subir el botón “Añadir al inventario”.**
   - Colocarlo inmediatamente después de la opción de alta manual.
   - Reducir la distancia necesaria para completar el flujo principal.

### P2 — Optimización visual y densidad

8. **Mostrar la fecha de caducidad únicamente cuando exista.**
   - No mostrar el texto “Sin fecha de caducidad”.

9. **Reducir el tamaño de las tarjetas de gestión y equivalentes.**
   - Conservar legibilidad, accesibilidad, controles táctiles y jerarquía visual.
   - Evitar que las herramientas secundarias dominen la pantalla.

10. **Mejorar el cuadro de Texto IA / Dictado por voz.**
    - Aumentar el área útil de escritura y dictado.
    - Mejorar su presentación visual sin cambiar la lógica funcional.

### Dependencias de ejecución

- No implementar el cálculo automático de macros hasta confirmar que el dictado guarda productos correctamente.
- No realizar el pulido visual final antes de fijar la nueva jerarquía y el orden de las secciones de Inventario.
- Cada cambio debe conservar autenticación, RLS, inventario existente, cálculo de macros, navegación móvil y tema claro/oscuro.

## Riesgos técnicos principales

1. **Mezclar Prisma y Supabase sin una decisión clara.**
   - Mitigación: para el MVP inicial, Supabase será la fuente principal de autenticación y datos.

2. **Construir sobre datos demo.**
   - Mitigación: `lib/demo-data.ts` queda como referencia temporal, no como base del MVP real.

3. **Aumentar demasiado el alcance.**
   - Mitigación: cada commit debe introducir una sola capa funcional clara.

4. **RLS mal configurado.**
   - Mitigación: toda tabla con datos de usuario debe tener `user_id`, RLS activo y políticas basadas en `auth.uid()`.

5. **Romper el dashboard actual antes de tener reemplazo.**
   - Mitigación: no hacer cambios masivos de UI hasta que login y datos reales estén listos.

6. **Fallo de build en Vercel por variables de entorno.**
   - Mitigación: mantener `.env.example` actualizado y documentar variables requeridas.

## Estado tras este commit

Tras este commit, el proyecto debe seguir siendo la misma app funcional de demo, pero con una dirección clara para evolucionar hacia Lakitchenapp V2 sin introducir todavía funcionalidades grandes.
