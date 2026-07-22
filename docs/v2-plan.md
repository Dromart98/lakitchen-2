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

## Fase cerrada: estabilización de Inventario y Macros

**Estado: completada y auditada el 2026-07-22.** La auditoría de cierre se hizo sobre `main` en `990876a0824acd6954c357a24b95a1000471dffc`. Los cambios se mantuvieron en entregas pequeñas; los SHA indican el cambio que resolvió cada punto cuando se pudo identificar de forma fiable en el historial local.

### Alcance completado

| Estado | Entrega | Resultado verificable | Cambio de referencia |
| --- | --- | --- | --- |
| Completado | Persistencia de alta por voz | Los borradores revisados se validan, se guardan mediante `save_voice_inventory_batch`, son idempotentes por usuario y envío, y se refresca Inventario tras una respuesta correcta. | `3ee264d` (PR #180); persistencia atómica previa en `fd95511`/`b070428` |
| Completado | Macros automáticos en alta por voz | La estimación entrega calorías y los tres macros; la vista previa permite revisarlos y no habilita el guardado hasta que el borrador sea válido. | `4734060` |
| Completado | Estado crudo por defecto | Los alimentos básicos aplicables se interpretan como crudos; una preparación explícita tiene prioridad y platos compuestos o exclusiones no reciben esa inferencia. | `7767765`, `f1a99bf` |
| Completado | Comidas del día en Macros | La página consulta solo `daily_meal_logs` del usuario autenticado y de la fecha UTC actual, y muestra estados de carga correcta, vacío y error al final de la pantalla. | `8d40295` |
| Completado | Jerarquía de Inventario | «Tus productos» precede a las herramientas de alta; «Encuentra rápido» conserva formulario GET, parámetros `query`, `location` y `expiration`, y se abre cuando hay filtros activos. | `1987c37` (PR #185) |
| Completado | Alta manual y código de barras | El guardado manual permanece antes del desplegable de código de barras y ambos siguen en el mismo formulario. Al cerrar el desplegable o desmontarlo se paran pistas, bucle y solicitudes pendientes de cámara. | `1987c37` (PR #185) |
| Completado | Caducidad y densidad de tarjetas | Las fechas reales se mantienen; los productos sin fecha no generan etiqueta ni contenedor de caducidad. Las tarjetas de producto y gestión son más compactas. | `3da12bd` (PR #186), `e4f55b3` (PR #187) |
| Completado | Texto IA y dictado | Se conservan exactamente los modos Solo macros, Texto IA, Foto y Desde inventario. Texto IA mantiene textarea y dictado, acumula transcripciones, limita a 2.000 caracteres y detiene reconocimiento al borrar, analizar, cambiar de modo o desmontar. | `d903e6c`, `0c9a85c`, `990876a` (PR #188) |
| Completado | Registro y consumo de comidas | Los macros decimales se persisten con una decimal. El consumo desde reconciliación IA usa una RPC transaccional con bloqueo e idempotencia: repetir el mismo envío no vuelve a descontar inventario ni crea otra comida. | `3ab668d` (PR #177), `1a34f36` |

### Cierre técnico de la auditoría

**Contratos comprobados.** Las pruebas focalizadas actuales cubren resultados de dominio (caducidad, validación de lotes, inferencia cruda, límites de texto y decimales), integración de acciones/RPC (alta por voz, consumo y registro idempotente) y contratos de UI. No se detectó una regresión funcional reproducible; por ello esta auditoría no modifica código de producto, RPC, migraciones ni estilos.

**Calidad de pruebas.** Predominan las pruebas de contrato estructural en los componentes de App Router (lectura del código fuente para orden, atributos y cierres). Son útiles como protección económica de la jerarquía actual, pero son más frágiles que una prueba de navegador. Las pruebas de dominio, acciones y migraciones ejercen comportamiento y son la evidencia principal para validación, idempotencia, cálculo y fechas. No se eliminó ninguna prueba: no se confirmó duplicación ni una aserción contradictoria.

**Riesgos residuales y validación manual pendiente.** La suite unitaria no puede conceder permisos de cámara ni ejecutar el reconocimiento del navegador, ni ejecutar las RPC contra una instancia Supabase migrada. Antes de una entrega deben comprobarse manualmente: permisos y cierre de cámara en móvil, dictado prolongado y cambio de pestaña, guardado/reintento de un lote de voz y de una reconciliación con inventario real, y que el listado de comidas se actualice tras cada una de las cuatro vías de registro. También conviene verificar visualmente tema claro/oscuro y tamaños táctiles de las tarjetas compactas.

### Siguiente fase recomendada: validación operativa guiada de flujos cotidianos

**No implementada en esta fase.** Priorizar una pasada manual reproducible, con datos de prueba y una instancia Supabase migrada, sobre Inventario y los cuatro modos de Macros. Debe registrar evidencia de los riesgos residuales anteriores y convertir únicamente incidencias reproducibles en pruebas de comportamiento. Tiene prioridad frente a nuevas capacidades de IA, recetas o automatizaciones porque valida los flujos diarios ya entregados (alta, consumo y registro) sin ampliar superficie funcional ni introducir complejidad prematura.

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
