# Ciclo de vida y rotación de secretos

## Objetivo

Mantener las credenciales de LaKitchen identificadas, almacenadas fuera del código, revisadas periódicamente y reemplazables sin interrupción cuando el proveedor permita solapamiento.

Este documento registra **nombres, ubicaciones lógicas, propietarios y procedimientos**. Nunca debe contener valores, prefijos identificables de credenciales reales, capturas con secretos, tokens, cookies ni enlaces que incorporen credenciales.

## Inventario vigente

| Variable | Proveedor | Clasificación | Uso real | Ubicación esperada | Propietario técnico |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Secreto de privilegio alto | Cliente administrativo server-side; operaciones que requieren `service_role`; validación E2E autenticada | Vercel server-side y GitHub Actions secret | Backend / datos |
| `OPENAI_API_KEY` | OpenAI | Secreto con consumo facturable | Texto IA, Foto IA, nutrición, recetas, planes y voz cuando alcanzan al proveedor | Vercel server-side | IA / backend |
| `USDA_FDC_API_KEY` | USDA / api.data.gov | Secreto de proveedor externo | Consultas server-side de FoodData Central | Vercel server-side | Nutrición / backend |
| `SENTRY_AUTH_TOKEN` | Sentry | Secreto de build, opcional | Subida de sourcemaps durante build cuando está configurado | Vercel build environment | Operaciones / observabilidad |

No son secretos y no se deben tratar como tales:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `NEXT_PUBLIC_SENTRY_DSN`;
- `SENTRY_ORG` y `SENTRY_PROJECT`;
- nombres de modelos y límites funcionales/rate limits.

La clave pública de Supabase sigue limitada por RLS y autenticación. El DSN de Sentry identifica el destino de ingestión pero no concede permisos administrativos.

## Reglas permanentes

- Ningún secreto server-only se versiona, se pasa a componentes cliente, se devuelve en errores ni se registra en logs.
- `.env` y `.env*.local` permanecen ignorados por Git; `.env.example` contiene únicamente nombres y valores ficticios.
- Preferir las capacidades nativas de secretos de Vercel, GitHub Actions y cada proveedor frente a archivos compartidos.
- Usar una credencial separada por servicio/componente cuando el proveedor lo permita, especialmente para claves de privilegio alto.
- Registrar únicamente nombre/ID de la credencial, proveedor, fecha, operador, destino actualizado y resultado. Nunca registrar el valor.
- Ante una credencial comprometida, contener primero la causa que permitió la exposición y después completar la sustitución/revocación.
- Si la revocación inmediata es necesaria para proteger datos o gasto, la seguridad tiene prioridad sobre una degradación temporal de la función afectada.

## Cadencia

### Revisión operativa

Realizar una revisión **cada 90 días** y además antes de un lanzamiento público importante. La revisión comprueba:

- que cada credencial sigue siendo necesaria;
- que su propietario técnico sigue claro;
- que no existe una clave más privilegiada de lo necesario;
- que no hay credenciales de personas que ya no deban tener acceso;
- que Vercel/GitHub y el proveedor contienen solo las credenciales activas necesarias;
- que no han cambiado las recomendaciones del proveedor.

### Rotación preventiva

Política interna salvo que el proveedor exija una ventana más corta:

- Supabase secreto de privilegio alto: objetivo de rotación cada **180 días**.
- OpenAI project API key: objetivo de rotación cada **180 días**.
- Sentry auth token de build: objetivo de rotación cada **180 días** si está configurado.
- USDA/api.data.gov: revisión trimestral y rotación planificada al menos **anual**, o antes si cambia la propiedad de la cuenta o el proveedor facilita un mecanismo mejor.

Rotar inmediatamente ante exposición, sospecha de compromiso, pérdida de control del dispositivo/cuenta, cambio de propietario con acceso o indicación del proveedor.

## Procedimiento común sin tiempo de inactividad

Cuando el proveedor admita varias credenciales simultáneas:

1. Registrar fecha, motivo, variable afectada, destinos y nombre/ID de la credencial antigua sin copiar su valor.
2. Crear una credencial nueva con el mínimo alcance necesario.
3. Actualizar primero los destinos que consumen la credencial nueva.
4. Desplegar o reiniciar únicamente lo necesario.
5. Ejecutar la verificación específica del proveedor descrita abajo.
6. Confirmar que todas las superficies conocidas usan la credencial nueva.
7. Revocar o eliminar la credencial antigua.
8. Repetir una verificación breve después de la revocación.
9. Registrar resultado y fecha de próxima revisión.

Si el proveedor no admite solapamiento, preparar primero todos los destinos y una ventana breve de cambio. No invalidar una credencial de producción sin conocer qué componentes la consumen.

## Supabase

### Estado de LaKitchen

- El navegador y las sesiones usan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, que es pública.
- Las operaciones administrativas usan `SUPABASE_SERVICE_ROLE_KEY` exclusivamente server-side.
- El workflow `Authenticated E2E` mantiene otra copia lógica del mismo secreto como GitHub Actions secret.
- La aplicación acepta las nuevas secret keys `sb_secret_...` a través del mismo cliente administrativo; deben preferirse frente al `service_role` JWT legado.

### Rotación normal

1. En Supabase, crear una **secret API key** nueva y diferenciada para el componente cuando sea posible.
2. Actualizar `SUPABASE_SERVICE_ROLE_KEY` en Vercel sin cambiar código.
3. Actualizar también el secret homónimo de GitHub Actions si el E2E usa la misma credencial.
4. Desplegar producción.
5. Confirmar `live` y `ready` y ejecutar `Authenticated E2E`; la verificación administrativa de borrado/cascada confirma que la credencial privilegiada funciona realmente.
6. Cuando Vercel, CI y cualquier otro consumidor conocido funcionen con la nueva clave, eliminar/desactivar la anterior desde Supabase.
7. Repetir la comprobación E2E o al menos la operación administrativa crítica tras la revocación.

No rotar el JWT secret legado como sustituto de este proceso. Si todavía existe un `service_role` JWT, migrar a una secret key moderna con solapamiento y desactivar después la credencial legada.

### Emergencia

- Crear una secret key nueva y reemplazar consumidores de inmediato si el solapamiento sigue siendo seguro.
- Si existe evidencia de abuso activo de la clave privilegiada, revocar la comprometida cuanto antes aunque las operaciones administrativas queden temporalmente degradadas.
- Revisar accesos y cambios de datos relevantes antes de declarar cerrado el incidente.

## OpenAI

### Estado de LaKitchen

`OPENAI_API_KEY` se lee solo en rutas/acciones server-side antes de llamar a la API. El código no debe incluir la clave en respuestas, logs ni eventos de monitorización.

### Rotación normal

1. Crear una nueva **project API key** en el proyecto correcto de OpenAI; no usar una Admin API key para la aplicación.
2. Actualizar `OPENAI_API_KEY` en Vercel.
3. Desplegar la aplicación.
4. Ejecutar una solicitud controlada y única que obligue a contactar al proveedor, evitando un acierto de caché. Confirmar éxito y que la telemetría de IA registra una solicitud real al proveedor sin guardar contenido privado.
5. Validar al menos un flujo crítico de IA, preferentemente Texto IA; ampliar a Foto/Recetas/Planes si el cambio coincide con otra modificación de IA.
6. Eliminar la project API key anterior desde OpenAI cuando la nueva esté confirmada.
7. Volver a realizar una petición mínima tras la revocación.

### Emergencia

Si hay indicios de abuso o gasto no autorizado, eliminar la clave comprometida inmediatamente y aceptar una degradación temporal de las funciones IA mientras se despliega la sustituta. Revisar uso/costes y permisos del proyecto después.

## USDA / api.data.gov

### Estado de LaKitchen

`USDA_FDC_API_KEY` se usa únicamente en servidor para FoodData Central. El proveedor exige mantenerla privada y puede desactivar claves encontradas públicamente. La integración actual la envía como parámetro `api_key`, por lo que ninguna capa de logs debe registrar URLs completas de esas peticiones.

### Rotación normal

1. Obtener una clave nueva de api.data.gov para el propietario técnico vigente.
2. Actualizar `USDA_FDC_API_KEY` en Vercel.
3. Desplegar.
4. Realizar una consulta controlada de FoodData Central y verificar búsqueda + detalle con una respuesta nutricional válida.
5. Confirmar que las resoluciones de LaKitchen siguen degradando de forma segura si USDA no responde.
6. Desactivar la clave anterior mediante las opciones disponibles del proveedor; si la cuenta no ofrece autoservicio de revocación, solicitar su desactivación a api.data.gov/FoodData Central.

### Emergencia

Sustituir la clave y solicitar la desactivación de la expuesta. Revisar límites/uso del proveedor y comprobar que no aparece en repositorio, logs o capturas.

## Sentry

### Clasificación

- `NEXT_PUBLIC_SENTRY_DSN` **no es secreto**.
- `SENTRY_ORG` y `SENTRY_PROJECT` son identificadores de configuración.
- `SENTRY_AUTH_TOKEN` **sí es secreto** y solo es necesario durante build cuando se habilita la subida de sourcemaps.

### Rotación de `SENTRY_AUTH_TOKEN`

1. Crear un nuevo token organizativo/integración interna con el mínimo alcance requerido por el uploader actual.
2. Actualizar el secret de build en Vercel.
3. Desplegar y confirmar que el build termina correctamente y que la subida de sourcemaps continúa cuando está habilitada.
4. Revocar el token anterior desde Sentry.
5. Ejecutar un build posterior o validación equivalente para confirmar que no dependía del token revocado.

Si `SENTRY_AUTH_TOKEN` no está configurado, no crear uno únicamente para cumplir una rotación: el `next.config.mjs` actual deshabilita sourcemaps cuando falta.

## Revocación de emergencia común

Ante una exposición confirmada o probable:

1. Clasificar el alcance: datos privilegiados, gasto externo, build/observabilidad o solo clave pública.
2. Contener la fuente de exposición antes de volver a distribuir una credencial.
3. Identificar todos los consumidores desde este inventario y la configuración real de despliegue/CI.
4. Crear sustituta si hay solapamiento seguro; en abuso activo, revocar primero.
5. Actualizar destinos y desplegar.
6. Verificar el flujo específico.
7. Revocar la anterior y comprobar que deja de ser aceptada cuando exista una forma segura de hacerlo.
8. Revisar logs/uso/auditoría del proveedor sin copiar secretos.
9. Registrar causa, impacto, acciones y seguimiento en una incidencia separada.

## Simulacro no productivo

El simulacro de 2.8 **no se realiza con una credencial productiva**.

Precondiciones:

- entorno Preview/desarrollo aislado;
- credencial desechable del proveedor y alcance no productivo;
- capacidad confirmada para crear **y revocar** la credencial;
- destino de secretos modificable sin afectar producción.

Procedimiento:

1. Configurar la credencial A en el entorno no productivo y verificar el flujo objetivo.
2. Crear la credencial B.
3. Actualizar el entorno a B y desplegar sin retirar todavía A.
4. Verificar que B funciona.
5. Revocar A.
6. Confirmar de forma segura que A ya no es aceptada y que B mantiene el servicio.
7. Eliminar cualquier recurso temporal y registrar únicamente IDs/nombres y resultados.

Criterio PASS:

- ninguna petición de producción utiliza las credenciales del simulacro;
- el cambio no produce interrupción en el entorno de prueba;
- la credencial anterior queda revocada;
- la nueva continúa funcionando;
- no queda ningún secreto en Git, logs o artefactos.

## Estado del simulacro de 2.8

**Pendiente por infraestructura, no por código.** A 15 de agosto de 2026 no existe una rama/proyecto Supabase de desarrollo disponible. Los conectores operativos actuales permiten inspección de Vercel pero no modificar sus variables de entorno; el conector de OpenAI puede crear claves mediante flujo seguro pero no revocarlas. Crear una credencial desechable sin poder completar su revocación violaría este mismo runbook, por lo que no se inicia el simulacro hasta disponer de un entorno no productivo y ciclo crear→actualizar→verificar→revocar completo.

2.8 no se considera cerrada hasta completar y registrar ese simulacro.
