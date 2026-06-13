# Lakitchen: plan técnico para app de macros, inventario y recetas

## 1. Resumen del producto

Lakitchen es una aplicación mobile-first para gestionar nutrición diaria e inventario doméstico de alimentos. El usuario registra comidas, controla calorías y macros, mantiene productos organizados por despensa, nevera y congelador, y recibe recetas diarias generadas a partir de lo que ya tiene disponible.

El objetivo principal del producto es reducir fricción en tres momentos diarios:

- Decidir qué comer según objetivos nutricionales.
- Evitar desperdicio usando productos próximos a caducar.
- Registrar comidas e inventario sin duplicar trabajo.

La propuesta combina seguimiento nutricional, inventario y planificación de recetas en un solo flujo: cuando una receta se marca como preparada, sus macros se registran en el día y sus ingredientes se descuentan del inventario.

## 2. Propuesta de MVP

El MVP debe ser una PWA responsive instalable en móvil, con backend API y base de datos relacional. Esta opción permite validar rápido sin duplicar código nativo iOS/Android y mantiene la posibilidad de empaquetar más adelante con Capacitor o migrar pantallas críticas a React Native.

Alcance del MVP:

- Autenticación por email y contraseña.
- Perfil nutricional básico y calculadora de macros.
- Dashboard diario con macros consumidos, restantes, alertas de caducidad y receta sugerida.
- CRUD de alimentos de inventario separado por ubicación.
- Registro diario de comidas manual y desde receta preparada.
- Generador de recetas basado en reglas usando inventario disponible.
- Historial diario y semanal.
- Guardado de alimentos frecuentes.

Fuera del MVP inicial:

- Escaneo de código de barras.
- Integraciones con supermercados.
- IA generativa en producción.
- Planificador semanal avanzado.
- Comunidad, retos o funciones sociales.
- Wearables.

## 3. Funcionalidades principales

### Seguimiento de macros

- Registrar comidas por día y tipo: desayuno, comida, cena y snacks.
- Añadir alimentos manuales, alimentos frecuentes o recetas preparadas.
- Calcular calorías, proteínas, carbohidratos y grasas consumidos.
- Comparar consumos contra objetivos diarios personalizados.
- Mostrar progreso visual por macro.
- Consultar historial diario, semanal y mensual.
- Guardar alimentos frecuentes para reutilización rápida.

### Inventario de alimentos

- Gestionar productos por ubicación: despensa, nevera y congelador.
- Registrar nombre, cantidad, unidad, fecha de caducidad, categoría y macros por 100 g o por ración.
- Buscar y filtrar por ubicación, categoría, caducidad y disponibilidad.
- Alertar productos próximos a caducar.
- Descontar cantidades manualmente o al preparar recetas.
- Marcar productos agotados, descartados o consumidos.

### Generador de recetas diarias

- Crear recetas usando alimentos disponibles.
- Priorizar ingredientes con caducidad más próxima.
- Ajustar receta a macros restantes del día.
- Generar sugerencias para desayuno, comida, cena y snacks.
- Mostrar ingredientes, cantidades, pasos, macros totales y por ración.
- Proponer sustituciones por categoría o macro equivalente.
- Marcar receta como preparada para registrar comida y descontar inventario.

### Calculadora de macros

- Calcular recomendaciones con edad, sexo, peso, altura, actividad y objetivo.
- Permitir objetivo: perder grasa, mantener peso o ganar músculo.
- Ajustar manualmente porcentajes de proteínas, carbohidratos y grasas.
- Guardar resultados en el perfil.

### Perfil de usuario

- Datos personales necesarios para cálculo de macros.
- Preferencias alimentarias.
- Alergias e ingredientes a evitar.
- Número de comidas al día.
- Objetivo físico.
- Unidades preferidas.

## 4. Flujos de usuario

### Onboarding y cálculo inicial

1. El usuario crea cuenta.
2. Introduce edad, sexo, peso, altura, actividad y objetivo.
3. La app calcula calorías y macros recomendados.
4. El usuario ajusta porcentajes si lo desea.
5. Se guardan objetivos diarios en el perfil.
6. La app muestra el dashboard del día.

### Añadir producto al inventario

1. El usuario pulsa `Añadir producto`.
2. Selecciona ubicación: despensa, nevera o congelador.
3. Introduce nombre, cantidad, unidad, categoría, caducidad y macros.
4. La app valida campos mínimos.
5. El producto aparece en inventario y en alertas si caduca pronto.

### Registrar comida manual

1. El usuario pulsa `Añadir comida`.
2. Selecciona tipo de comida.
3. Busca alimento frecuente o introduce alimento manual.
4. Define cantidad consumida.
5. La app calcula macros y actualiza el progreso diario.

### Generar y preparar receta

1. El usuario abre `Recetas` o elige la sugerencia del dashboard.
2. Selecciona tipo de comida y raciones.
3. La app analiza inventario, caducidad, preferencias y macros restantes.
4. Muestra una receta con ingredientes, pasos y macros.
5. El usuario sustituye ingredientes si es necesario.
6. El usuario marca `Preparada`.
7. La app descuenta inventario y registra la comida del día.

### Revisar historial

1. El usuario abre `Historial`.
2. Selecciona día, semana o mes.
3. Consulta totales, medias y desviaciones contra objetivos.
4. Puede abrir días concretos para revisar comidas registradas.

## 5. Pantallas necesarias

- `Auth`: inicio de sesión, registro y recuperación de contraseña.
- `Onboarding`: datos físicos, objetivo, actividad, preferencias y alergias.
- `Dashboard`: macros de hoy, restantes, productos próximos a caducar y receta sugerida.
- `Añadir comida`: formulario rápido de comida y selector de frecuentes.
- `Historial`: vista diaria, semanal y mensual.
- `Inventario`: listado con tabs por despensa, nevera y congelador.
- `Detalle de producto`: editar cantidad, caducidad, macros y ubicación.
- `Añadir producto`: alta rápida de inventario.
- `Recetas`: generador por tipo de comida, filtros y recetas sugeridas.
- `Detalle de receta`: ingredientes, pasos, sustituciones, macros y acción preparar.
- `Calculadora de macros`: cálculo y ajuste manual.
- `Perfil`: datos personales, preferencias, alergias, unidades y objetivos.
- `Ajustes`: cuenta, exportación de datos, privacidad y notificaciones.

## 6. Modelo de datos

### Entidades principales

#### users

- `id`: UUID, clave primaria.
- `email`: texto único.
- `password_hash`: texto, si se usa auth propia.
- `created_at`: fecha.
- `updated_at`: fecha.

#### user_profiles

- `id`: UUID.
- `user_id`: FK a `users`.
- `birth_date`: fecha.
- `sex`: `male`, `female`, `other`.
- `height_cm`: número.
- `weight_kg`: número.
- `activity_level`: `sedentary`, `light`, `moderate`, `active`, `very_active`.
- `goal`: `fat_loss`, `maintenance`, `muscle_gain`.
- `meals_per_day`: número.
- `preferred_units`: JSON.
- `dietary_preferences`: JSON.
- `allergies`: JSON.
- `ingredients_to_avoid`: JSON.

#### macro_goals

- `id`: UUID.
- `user_id`: FK.
- `calories`: número.
- `protein_g`: número.
- `carbs_g`: número.
- `fat_g`: número.
- `protein_pct`: número.
- `carbs_pct`: número.
- `fat_pct`: número.
- `effective_from`: fecha.

#### foods

- `id`: UUID.
- `user_id`: FK nullable, `null` para alimentos base globales.
- `name`: texto.
- `category`: texto.
- `serving_size`: número.
- `serving_unit`: texto.
- `calories_per_100g`: número.
- `protein_per_100g`: número.
- `carbs_per_100g`: número.
- `fat_per_100g`: número.
- `is_frequent`: booleano.

#### inventory_items

- `id`: UUID.
- `user_id`: FK.
- `food_id`: FK nullable.
- `name`: texto.
- `location`: `pantry`, `fridge`, `freezer`.
- `category`: texto.
- `quantity`: número.
- `unit`: texto.
- `expiration_date`: fecha nullable.
- `calories_per_100g`: número nullable.
- `protein_per_100g`: número nullable.
- `carbs_per_100g`: número nullable.
- `fat_per_100g`: número nullable.
- `status`: `available`, `low`, `consumed`, `discarded`.
- `created_at`: fecha.
- `updated_at`: fecha.

#### meal_logs

- `id`: UUID.
- `user_id`: FK.
- `date`: fecha.
- `meal_type`: `breakfast`, `lunch`, `dinner`, `snack`.
- `source`: `manual`, `food`, `recipe`.
- `recipe_id`: FK nullable.
- `notes`: texto nullable.
- `created_at`: fecha.

#### meal_log_items

- `id`: UUID.
- `meal_log_id`: FK.
- `food_id`: FK nullable.
- `inventory_item_id`: FK nullable.
- `name`: texto.
- `quantity`: número.
- `unit`: texto.
- `calories`: número.
- `protein_g`: número.
- `carbs_g`: número.
- `fat_g`: número.

#### recipes

- `id`: UUID.
- `user_id`: FK nullable.
- `name`: texto.
- `meal_type`: texto.
- `servings`: número.
- `instructions`: JSON array.
- `calories_total`: número.
- `protein_total_g`: número.
- `carbs_total_g`: número.
- `fat_total_g`: número.
- `generated`: booleano.
- `created_at`: fecha.

#### recipe_ingredients

- `id`: UUID.
- `recipe_id`: FK.
- `inventory_item_id`: FK nullable.
- `food_id`: FK nullable.
- `name`: texto.
- `quantity`: número.
- `unit`: texto.
- `substitution_group`: texto nullable.

#### inventory_transactions

- `id`: UUID.
- `inventory_item_id`: FK.
- `user_id`: FK.
- `type`: `add`, `consume`, `discard`, `adjust`.
- `quantity_delta`: número.
- `unit`: texto.
- `reason`: texto.
- `meal_log_id`: FK nullable.
- `recipe_id`: FK nullable.
- `created_at`: fecha.

### Relaciones clave

- Un usuario tiene un perfil, múltiples objetivos de macros, muchos productos de inventario y muchos registros de comidas.
- Un registro de comida tiene múltiples alimentos o ingredientes consumidos.
- Una receta tiene múltiples ingredientes.
- Preparar una receta crea un `meal_log`, varios `meal_log_items` y varias `inventory_transactions`.

## 7. Arquitectura recomendada

Arquitectura modular con frontend PWA, backend API y base de datos PostgreSQL.

```text
Cliente PWA
  ├─ UI mobile-first
  ├─ estado local y cache offline
  ├─ formularios rápidos
  └─ sincronización con API

Backend API
  ├─ autenticación y autorización
  ├─ macros y perfiles
  ├─ inventario
  ├─ comidas e historial
  ├─ recetas y generación por reglas
  └─ notificaciones/alertas

Base de datos
  ├─ usuarios
  ├─ inventario
  ├─ comidas
  ├─ recetas
  └─ transacciones
```

Principios:

- Separar lógica de dominio de componentes UI.
- Usar servicios por módulo: `nutrition`, `inventory`, `recipes`, `users`.
- Mantener una fuente de verdad en backend y cache local para offline.
- Registrar transacciones de inventario para trazabilidad.
- Empezar con generación de recetas por reglas antes de integrar IA.

## 8. Stack tecnológico recomendado

### Opción recomendada para MVP

- Frontend: Next.js con React y TypeScript.
- UI: Tailwind CSS y shadcn/ui.
- Backend: API routes/server actions de Next.js para el MVP.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Autenticación: Auth.js o Supabase Auth.
- Estado cliente: TanStack Query para cache y sincronización.
- Formularios: React Hook Form y Zod.
- PWA/offline: next-pwa, Service Worker e IndexedDB.
- Testing: Vitest, React Testing Library y Playwright.
- Deploy: Vercel para app y Supabase/Neon para PostgreSQL.

### Justificación

Next.js permite construir web, PWA y API en un único repositorio, reduciendo coste de MVP. PostgreSQL y Prisma facilitan relaciones, consultas por fecha y transacciones de inventario. TanStack Query simplifica cache, reintentos y sincronización. La PWA cubre instalación móvil sin el coste inicial de apps nativas.

### Evolución futura

- Empaquetar con Capacitor si se necesitan notificaciones nativas o distribución en stores.
- Extraer backend a NestJS si crece el equipo o aparecen integraciones complejas.
- Integrar API nutricional externa para búsqueda de alimentos.
- Integrar IA generativa para recetas con guardrails nutricionales.

## 9. Estructura de carpetas

```text
lakitchen/
  app/
    (auth)/
      login/
      register/
    (app)/
      dashboard/
      inventory/
      meals/
      recipes/
      history/
      profile/
      macro-calculator/
    api/
      auth/
      inventory/
      meals/
      recipes/
      macro-goals/
  components/
    common/
    dashboard/
    inventory/
    meals/
    recipes/
    nutrition/
  lib/
    auth/
    db/
    validations/
    units/
    dates/
  modules/
    nutrition/
      nutrition.service.ts
      macro-calculator.ts
      nutrition.types.ts
    inventory/
      inventory.service.ts
      inventory.rules.ts
      inventory.types.ts
    recipes/
      recipe-generator.service.ts
      recipe-scoring.ts
      substitutions.ts
      recipes.types.ts
    meals/
      meal-log.service.ts
      meal-summary.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
  public/
    icons/
    manifest.json
  tests/
    unit/
    integration/
    e2e/
```

## 10. Endpoints, servicios o módulos

### Autenticación y perfil

- `POST /api/auth/register`: crear cuenta.
- `POST /api/auth/login`: iniciar sesión.
- `GET /api/profile`: obtener perfil.
- `PUT /api/profile`: actualizar perfil, preferencias y alergias.

### Objetivos y calculadora

- `POST /api/macro-goals/calculate`: calcular macros recomendados.
- `GET /api/macro-goals/current`: obtener objetivo vigente.
- `POST /api/macro-goals`: guardar objetivo ajustado.

### Inventario

- `GET /api/inventory`: listar con filtros.
- `POST /api/inventory`: crear producto.
- `GET /api/inventory/:id`: detalle.
- `PUT /api/inventory/:id`: editar producto.
- `DELETE /api/inventory/:id`: eliminar o marcar descartado.
- `POST /api/inventory/:id/adjust`: ajustar cantidad.
- `GET /api/inventory/expiring`: productos próximos a caducar.

### Comidas e historial

- `GET /api/meals?date=YYYY-MM-DD`: comidas de un día.
- `POST /api/meals`: crear comida.
- `PUT /api/meals/:id`: editar comida.
- `DELETE /api/meals/:id`: eliminar comida.
- `GET /api/nutrition/summary?period=day|week|month`: resumen nutricional.

### Recetas

- `POST /api/recipes/generate`: generar receta según inventario y macros.
- `GET /api/recipes/:id`: detalle de receta.
- `POST /api/recipes/:id/prepare`: marcar preparada, descontar inventario y registrar comida.
- `POST /api/recipes/:id/substitute`: sugerir sustituciones.

### Servicios internos

- `MacroCalculatorService`: BMR, TDEE y distribución de macros.
- `InventoryService`: CRUD, filtros, caducidad y transacciones.
- `MealLogService`: registro de comidas y resúmenes.
- `RecipeGeneratorService`: scoring, selección de ingredientes y pasos.
- `NotificationService`: alertas de caducidad y recordatorios.

## 11. Lógica de cálculo de macros

### Fórmula base

Usar Mifflin-St Jeor para estimar metabolismo basal:

- Hombre: `BMR = 10 * peso_kg + 6.25 * altura_cm - 5 * edad + 5`.
- Mujer: `BMR = 10 * peso_kg + 6.25 * altura_cm - 5 * edad - 161`.
- Otro/no especificado: calcular media entre ambas o pedir preferencia metabólica.

### Multiplicadores de actividad

- Sedentario: `1.2`.
- Ligero: `1.375`.
- Moderado: `1.55`.
- Activo: `1.725`.
- Muy activo: `1.9`.

### Ajuste por objetivo

- Perder grasa: `TDEE - 15%` como valor inicial conservador.
- Mantener peso: `TDEE`.
- Ganar músculo: `TDEE + 10%`.

### Distribución inicial de macros

Para MVP, usar porcentajes editables:

- Perder grasa: 35% proteína, 35% carbohidratos, 30% grasas.
- Mantener: 25% proteína, 45% carbohidratos, 30% grasas.
- Ganar músculo: 30% proteína, 45% carbohidratos, 25% grasas.

Conversión:

- Proteína: 4 kcal/g.
- Carbohidratos: 4 kcal/g.
- Grasas: 9 kcal/g.

Validaciones:

- Los porcentajes deben sumar 100%.
- Calorías objetivo no deben quedar por debajo de un mínimo configurable.
- Permitir edición manual final por gramos o porcentajes.

## 12. Lógica de generación de recetas

### Versión MVP basada en reglas

1. Obtener macros restantes del día.
2. Filtrar inventario disponible con cantidad mayor que cero.
3. Excluir alergias e ingredientes evitados.
4. Priorizar productos próximos a caducar.
5. Clasificar alimentos por rol nutricional:
   - Proteína principal.
   - Carbohidrato base.
   - Grasas saludables.
   - Verduras/frutas.
   - Extras o condimentos.
6. Seleccionar combinaciones según tipo de comida.
7. Calcular cantidades aproximadas para acercarse a macros restantes.
8. Puntuar recetas candidatas.
9. Devolver la receta con mayor puntuación.

### Scoring sugerido

```text
score =
  expiration_priority * 0.35 +
  macro_fit * 0.30 +
  inventory_availability * 0.15 +
  user_preferences * 0.10 +
  simplicity * 0.10
```

### Reglas de caducidad

- Caduca hoy o mañana: prioridad máxima.
- Caduca en 2-3 días: prioridad alta.
- Caduca en 4-7 días: prioridad media.
- Sin caducidad: prioridad baja, salvo básicos de despensa.

### Sustituciones

Un ingrediente puede sustituirse por otro si comparte:

- Categoría similar.
- Unidad convertible.
- Perfil nutricional cercano.
- Compatibilidad con alergias y preferencias.

Ejemplos:

- Arroz por pasta, quinoa o patata.
- Pollo por pavo, tofu o legumbres.
- Yogur por queso fresco batido o alternativa vegetal.

### Integración futura con IA

La IA debe recibir solo un contexto controlado: inventario disponible, macros restantes, alergias, preferencias y formato de salida JSON. El backend debe validar que la receta generada usa ingredientes disponibles, no viola alergias y mantiene cantidades realistas antes de mostrarla o descontar inventario.

## 13. Sistema de inventario

### Ubicaciones

- `pantry`: despensa.
- `fridge`: nevera.
- `freezer`: congelador.

### Estados

- `available`: disponible.
- `low`: bajo stock.
- `consumed`: consumido.
- `discarded`: descartado.

### Descuento de inventario

Cuando una receta se prepara:

1. Validar que todos los ingredientes vinculados a inventario tienen cantidad suficiente.
2. Abrir transacción de base de datos.
3. Crear `meal_log` y `meal_log_items`.
4. Crear `inventory_transactions` con tipo `consume`.
5. Restar cantidades a `inventory_items`.
6. Marcar productos con cantidad cero como `consumed`.
7. Confirmar transacción.

### Unidades

Para MVP, soportar:

- Peso: `g`, `kg`.
- Volumen: `ml`, `l`.
- Conteo: `unit`.
- Ración: `serving`.

La conversión precisa entre unidades heterogéneas requiere densidad o equivalencias; en MVP se debe evitar convertir automáticamente entre peso y volumen salvo que el alimento tenga equivalencia definida.

### Alertas de caducidad

- Mostrar en dashboard productos que caducan en los próximos 3 días.
- Permitir configurar ventana futura de 1, 3 o 7 días.
- Agrupar por ubicación.
- En el futuro, enviar push notifications si la PWA está instalada.

## 14. Criterios de aceptación

### Seguimiento de macros

- El usuario puede registrar una comida con uno o más alimentos.
- La app muestra calorías, proteínas, carbohidratos y grasas consumidos en el día.
- La app calcula macros restantes contra el objetivo diario.
- El usuario puede consultar historial diario y semanal.
- El usuario puede reutilizar alimentos frecuentes.

### Inventario

- El usuario puede crear, editar y eliminar productos.
- Cada producto pertenece a despensa, nevera o congelador.
- El inventario permite filtrar por ubicación, categoría, caducidad y disponibilidad.
- El dashboard muestra productos próximos a caducar.
- Preparar una receta descuenta cantidades del inventario.

### Recetas

- El usuario puede generar una receta usando inventario disponible.
- La receta prioriza al menos un producto próximo a caducar cuando existe.
- La receta muestra ingredientes, cantidades, pasos y macros.
- El usuario puede sustituir ingredientes compatibles.
- Marcar receta como preparada registra comida y actualiza inventario en una transacción.

### Calculadora de macros

- El usuario puede introducir edad, sexo, peso, altura, actividad y objetivo.
- La app calcula calorías y gramos de macros.
- El usuario puede ajustar porcentajes manualmente.
- Los objetivos se guardan y se usan en el dashboard.

### Perfil

- El usuario puede editar preferencias, alergias, comidas al día, objetivo y unidades.
- Las recetas excluyen alergias e ingredientes a evitar.

### UX/UI

- El dashboard carga los datos principales del día en menos de 2 segundos en condiciones normales.
- Añadir comida o producto requiere pocos pasos y formularios cortos.
- La interfaz es usable en móvil desde 360 px de ancho.

## 15. Plan de desarrollo por fases

### Fase 0: Preparación

- Definir diseño visual básico y componentes UI.
- Crear proyecto Next.js con TypeScript.
- Configurar Prisma, PostgreSQL, linting, testing y CI.
- Definir variables de entorno y estrategia de despliegue.

### Fase 1: Autenticación y perfil

- Implementar registro, login y sesión.
- Crear perfil de usuario.
- Implementar calculadora de macros.
- Guardar objetivos diarios.

### Fase 2: Inventario

- Implementar CRUD de productos.
- Añadir filtros por ubicación, categoría y caducidad.
- Crear alertas de próximos a caducar.
- Registrar transacciones manuales de ajuste.

### Fase 3: Registro de comidas

- Implementar alta de comidas manuales.
- Calcular resumen diario.
- Añadir alimentos frecuentes.
- Crear historial diario y semanal.

### Fase 4: Generador de recetas MVP

- Crear algoritmo de scoring por reglas.
- Generar recetas por tipo de comida.
- Añadir sustituciones simples.
- Implementar `preparar receta` con transacción atómica.

### Fase 5: PWA y offline básico

- Añadir manifest, iconos y service worker.
- Cachear dashboard, inventario y formularios básicos.
- Guardar acciones offline pendientes en IndexedDB.
- Sincronizar cuando vuelva la conexión.

### Fase 6: Pulido y beta cerrada

- Mejorar UX de formularios rápidos.
- Añadir métricas de uso y errores.
- Ejecutar pruebas e2e.
- Invitar usuarios beta y priorizar feedback.

## 16. Pruebas recomendadas

### Unitarias

- Cálculo de BMR, TDEE y macros.
- Conversión de unidades soportadas.
- Scoring de recetas.
- Detección de productos próximos a caducar.
- Cálculo de resumen nutricional diario.

### Integración

- Crear producto y verlo en inventario filtrado.
- Registrar comida y actualizar resumen diario.
- Generar receta usando inventario disponible.
- Preparar receta y verificar descuento de inventario.
- Guardar macro goals y reflejarlos en dashboard.

### End-to-end

- Registro + onboarding + dashboard.
- Añadir producto próximo a caducar + generar receta.
- Preparar receta + ver comida registrada + inventario descontado.
- Ajustar macros manualmente + validar progreso diario.

### Pruebas de calidad

- Validación responsive en 360 px, 390 px, 768 px y desktop.
- Accesibilidad básica con etiquetas, contraste y navegación por teclado.
- Tests de permisos para asegurar aislamiento por usuario.
- Pruebas de transacciones para evitar inventario negativo.

## 17. Riesgos y mejoras futuras

### Riesgos técnicos

- Datos nutricionales incompletos: resolver con campos manuales y futura API nutricional.
- Conversión de unidades imprecisa: limitar conversiones y pedir equivalencias por alimento.
- Recetas poco útiles: empezar con reglas transparentes, medir aceptación y luego integrar IA.
- Inventario desactualizado: reducir fricción con acciones rápidas y descuentos automáticos.
- Offline conflictivo: comenzar con offline de lectura y cola simple de acciones.
- Seguridad multiusuario: aplicar autorización en todos los endpoints y tests de aislamiento.

### Mejoras futuras

- Escáner de código de barras.
- Importación desde tickets o emails de compra.
- IA generativa para recetas personalizadas.
- Planificación semanal de comidas.
- Lista de compra automática según recetas y macros.
- Notificaciones push de caducidad.
- Integración con Apple Health, Google Fit o wearables.
- Modo familiar con inventario compartido.
- Recomendaciones de batch cooking.

## 18. Primeros pasos concretos para empezar a desarrollar

1. Crear un repositorio Next.js con TypeScript, Tailwind y ESLint.
2. Añadir Prisma y definir el primer `schema.prisma` con usuarios, perfiles, objetivos, inventario y comidas.
3. Configurar PostgreSQL local con Docker o usar Supabase/Neon desde el inicio.
4. Implementar autenticación y layout base mobile-first.
5. Construir la calculadora de macros como primer módulo aislado y probado.
6. Crear el dashboard con datos mock y después conectarlo al backend.
7. Implementar CRUD de inventario.
8. Implementar registro de comidas y resumen diario.
9. Añadir el generador de recetas por reglas.
10. Implementar preparación de receta como transacción atómica.
11. Añadir tests unitarios para nutrición, inventario y recetas.
12. Desplegar una beta privada y medir uso real.

## Decisiones técnicas clave

- Construir primero PWA porque reduce coste, acelera validación y permite experiencia instalable en móvil.
- Usar PostgreSQL porque el dominio tiene relaciones fuertes, historial, fechas y transacciones.
- Usar generación de recetas por reglas en el MVP porque es explicable, testeable y más barata que IA generativa.
- Guardar transacciones de inventario porque permite auditoría y recuperación ante errores.
- Separar alimentos base, inventario y registros de comida porque un producto disponible no es lo mismo que un alimento consumido.
- Diseñar offline de forma incremental para evitar complejidad prematura.
