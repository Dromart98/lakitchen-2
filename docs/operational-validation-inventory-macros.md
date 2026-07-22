# Validación operativa guiada: Inventario y Macros

## Objetivo y estado

Esta guía organiza una pasada manual reproducible de los flujos cotidianos de Inventario y Macros. Busca evidencia operativa, no añade funcionalidad, pruebas E2E ni dependencias.

**Estado: bloqueada parcialmente (2026-07-22).** Las comprobaciones automatizadas disponibles terminaron correctamente, pero este entorno no tiene navegador, cámara, micrófono, usuario de prueba ni una instancia Supabase local o migrada verificable. Ningún flujo que dependa de ellos se declara aprobado.

## Entorno utilizado

| Dato | Resultado observado |
| --- | --- |
| Repositorio y rama inicial | `Dromart98/lakitchen-2`; `work` antes de crear la rama documental. |
| SHA inicial | `eefde18e5a13b7a55f7f307c24a9d6bdb0512cd3`. |
| Rama de trabajo | `docs/operational-validation-inventory-macros`. |
| Sistema | Linux `6.12.13`, x86_64. |
| Node / npm | `v20.20.2` / `11.4.2`. |
| Variables | `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` presentes; `OPENAI_API_KEY` ausente. No se inspeccionaron ni registraron valores. `.env` y `.env.local` ausentes. |
| Navegador | No se encontró Chromium, Chrome ni Firefox en `PATH`. |
| Cámara / micrófono | No se encontraron `/dev/video0` ni `/dev/snd`. |
| Supabase | CLI ausente y sin acceso comprobable a un proyecto remoto/migrado. |
| Usuario de prueba | No proporcionado. |
| E2E | No hay configuración, script ni pruebas Playwright/Cypress/E2E; una referencia opcional en el lockfile no es infraestructura ejecutable. |

Scripts existentes: `npm run dev`, `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`. La configuración existente es Vitest (`vitest.config.ts`); no se instaló ni añadió E2E.

## Preparación manual

1. Crear una instancia **de prueba** de Supabase con todas las migraciones de `supabase/migrations` y RLS activo.
2. Configurar `.env.local` con las variables públicas de `.env.example`; configurar la clave IA solo server-side cuando se validen modos IA. Nunca copiar secretos a evidencia.
3. Crear y autenticar un usuario de prueba sin datos personales.
4. Iniciar `npm run dev` o un despliegue de prueba y abrir DevTools (Console y Network).
5. Para cámara/dictado, usar navegador compatible y móvil físico si es posible, concediendo permisos únicamente al origen de prueba.
6. Para cada caso, registrar fecha UTC, navegador/dispositivo, usuario anonimizado, capturas y antes/después de inventario, comidas y resumen. Para reintentos, conservar el mismo envío/`submission_id` cuando la UI lo genere.

## Datos de prueba recomendados

Usar el prefijo `VALID-IM-20260722-`.

| Dato | Valor |
| --- | --- |
| Inventario con fecha | `VALID-IM-20260722-arroz`; 500 g; despensa; cereal; 360 kcal, P 7.0 g, C 80.0 g, G 1.0 g/100 g; fecha futura. |
| Inventario sin fecha | `VALID-IM-20260722-sal`; 250 g; despensa; condimento; macros conocidos; sin fecha. |
| Voz inventario | «dos paquetes de arroz, 500 gramos, despensa; un arroz cocido, 200 gramos, nevera». |
| Solo macros | `VALID-IM-20260722-macro-decimal`; 123.4 kcal, P 10.5 g, C 20.6 g, G 3.7 g. |
| Texto IA | «VALID-IM-20260722-comida: 100 g de arroz cocido y 50 g de pollo». |
| Foto IA | Imagen válida propia y no personal tomada para la sesión; no añadirla al repositorio. |

## Matriz de validación

*Bloqueado* significa que el flujo no se ejecutó; los pasos siguientes son la receta para el operador. El resultado obtenido no se infiere del código.

| Flujo | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia | Acción posterior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Inventario manual | Navegador, usuario y Supabase migrado. | Abrir `/inventory`; confirmar «Tus productos» antes del alta; crear el producto con fecha con nombre, cantidad, unidad, ubicación, categoría, macros y fecha; verificar listado; editar; descontar parcialmente; eliminar. Repetir con producto sin fecha y verificar que no hay etiqueta ni hueco. | CRUD visible y consistente; jerarquía correcta; descuento parcial correcto; sin hueco de caducidad. | No ejecutado: faltan navegador, usuario y DB comprobable. | Bloqueado | Inventario de entorno; suite contractual aprobada. | Ejecutar con capturas antes/después. |
| B. Filtros | Producto persistido y navegador autenticado. | Buscar nombre; filtrar ubicación y caducidad; recargar con filtros activos; comprobar desplegable abierto; limpiar. | Resultados y URL coinciden; desplegable abierto tras recarga; limpieza restaura listado. | No ejecutado: faltan navegador, usuario y DB. | Bloqueado | Suite contractual aprobada. | Guardar URL sin secretos y capturas. |
| C. Código de barras | Navegador compatible, cámara y permiso. | Completar formulario; abrir desplegable; iniciar cámara; cerrarlo con solicitud pendiente si se reproduce; comprobar indicador de cámara apagado; reabrir; introducir código manual; confirmar conservación del formulario. | Cámara liberada al cerrar; nueva apertura funciona; código manual no borra datos. | No ejecutado: no hay navegador ni cámara. | Bloqueado | Pruebas unitarias; sin permiso real. | Ejecutar en móvil y adjuntar grabación/Network. |
| D. Voz Inventario | Navegador, micrófono, IA, usuario y DB migrada. | Dictar varias intervenciones; revisar acumulación, cantidades, unidad, ubicación y macros; verificar básico crudo y «arroz cocido» preparado; guardar; comprobar listado; reintentar el mismo envío y contar productos. | Acumulación correcta; inferencia preparada/cruda correcta; listado actualizado; sin duplicado en reintento. | No ejecutado: faltan navegador/micrófono, IA, usuario y DB. | Bloqueado | Suite de voz, crudo e idempotencia; sin RPC real. | Registrar IDs/contadores antes-después. |
| E. Macros: Solo macros | Navegador, usuario y DB migrada. | Elegir Solo macros; registrar el caso decimal; revisar una decimal persistida, resumen y «Comidas registradas hoy». | Una decimal y tres vistas actualizadas una vez. | No ejecutado: faltan navegador, usuario y DB. | Bloqueado | Suite de decimales/listado aprobada. | Capturar formulario, resumen y listado. |
| F. Macros: Texto IA y dictado | Navegador, micrófono, IA, usuario, DB e inventario. | Escribir comida; dictar frases consecutivas; comprobar acumulación; detener; borrar; iniciar y cambiar de modo; confirmar parada; analizar; registrar/conciliar; reintentar y comparar comida/stock. | Acumulación; borrar/cambio detiene reconocimiento; UI se actualiza; sin doble comida/consumo. | No ejecutado: faltan navegador/micrófono, IA, usuario y DB. | Bloqueado | Suite de dictado/reconciliación/idempotencia; sin DB real. | Conservar Network y comparación de stock/listado. |
| G. Macros: Foto IA | Navegador, imagen válida, IA, usuario y DB. | Seleccionar imagen temporal; analizar; revisar estimación; registrar; comprobar listado y conciliación aplicable. | Estimación visible; una comida; listado/resumen/inventario actualizados según selección. | No ejecutado: faltan navegador, IA, usuario y DB. | Bloqueado | Suite de foto IA; no se añadió fixture. | Borrar imagen tras capturar evidencia. |
| H. Macros: Desde inventario | Navegador, usuario, DB e inventario. | Seleccionar ingredientes/cantidades; registrar; verificar descuento, comida, resumen y listado; reintentar y comparar. | Un descuento y una comida por envío; UI actualizada. | No ejecutado: faltan navegador, usuario y DB. | Bloqueado | Suite de RPC/consumo contractual; no DB real. | Capturar antes/después y reintento. |
| I. Responsive y temas | Navegador con 360–390 px/escritorio y sesión. | Revisar Inventario y cuatro modos Macros en claro/oscuro, móvil/escritorio; comprobar overflow, tarjetas, controles >=44 px, textarea y botón de dictado. | Sin overflow; controles y tarjetas legibles; textarea útil y dictado no lo comprime. | No ejecutado: no hay navegador/emulación. | Bloqueado | Pruebas de tema/UI; sin inspección visual. | Capturas por viewport/tema y mediciones DevTools. |

## Resultados ejecutados

| Comprobación | Resultado obtenido | Estado |
| --- | --- | --- |
| Inventario de entorno | Confirmadas capacidades y ausencias anteriores sin revelar secretos. | Aprobado |
| `npm run test` | Correcto: 82 archivos y 916 pruebas aprobadas. Los logs de rechazo IA/inserción corresponden a casos negativos esperados. | Aprobado |
| `npm run typecheck` | Correcto. | Aprobado |
| `npm run lint` | Correcto sin errores nuevos; informó 44 advertencias preexistentes. | Aprobado |
| `git diff --check` | Correcto, sin salida ni errores. | Aprobado |

No se ejecutó `npm run build`: solo se modificó documentación, no código ni configuración. Tampoco `npm run dev`: sin navegador, usuario y servicios no validaría un flujo adicional.

## Validaciones bloqueadas

Los bloques A–I requieren navegador, usuario autenticado y Supabase de prueba migrado. C requiere además cámara; D y F, micrófono y configuración IA; D, F y G, clave IA server-side. Deben ejecutarse exactamente como indica la matriz y reemplazar su resultado/estado con evidencia observada.

## Defectos confirmados

**Ninguno.** No se crea incidencia: no se reprodujo un fallo funcional y la ausencia de dispositivos/servicios no es un defecto del producto.

Para cualquier fallo posterior, documentar antes de corregir: **Problema principal** (pasos observables), **Causa confirmada** (solo evidencia demostrada), **Causa probable** (hipótesis separada), **Qué no vamos a tocar**, **Acción directa** mínima y **Resultado esperado** verificable, incluido reintento si aplica. Si es relevante, detener los escenarios afectados y no ocultarlo cambiando pruebas.

## Evidencias disponibles

- Salidas correctas de `npm run test`, `npm run typecheck`, `npm run lint` y `git diff --check` del 2026-07-22.
- Comprobación de comandos, dispositivos y presencia/ausencia de nombres de variables; revisión de `package.json`, Vitest, `.env.example`, documentación Supabase, páginas/componentes/acciones y migraciones de voz, consumo e idempotencia.
- No hay capturas, permisos de navegador, trazas RPC ni datos persistidos; no se afirman como evidencia.

## Limpieza de datos de prueba

1. Eliminar desde Inventario todos los nombres con prefijo `VALID-IM-20260722-`.
2. Eliminar desde la UI las comidas de prueba del día; si no existe UI, usar solo la DB de prueba y un procedimiento aprobado filtrado por usuario de prueba y prefijo.
3. Comprobar que no quedan líneas de consumo/comidas de prueba asociadas; borrar foto temporal y revocar permisos si la política lo requiere.
4. Nunca borrar sin filtro ni datos de otros usuarios; conservar RLS y aislamiento.

## Criterio de cierre

Solo marcar la fase **completada** cuando A–I tengan resultado real (aprobado o fallido), evidencia y limpieza; no queden bloqueos críticos de navegador, permisos, usuario o Supabase migrado; D, F y H hayan comprobado reintentos contra DB; y cualquier defecto reproducible tenga incidencia con la estructura anterior.
