# Roadmap estratégico de Lakitchenapp

Última actualización: 14 de agosto de 2026.

## Principios de producto

- Mantener una experiencia sencilla para usuarios no técnicos.
- Priorizar exactitud, fiabilidad y ahorro de tiempo antes que nuevas funciones.
- Evitar que la IA invente datos cuando exista una fuente verificable.
- Hacer cambios pequeños, comprobables y reversibles.
- Mantener ocultos los proveedores internos de datos nutricionales en la interfaz.
- Consolidar primero una versión estable antes de pagos, grupos o funciones avanzadas.

## Estado de validación funcional — Cerrado

Prioridad: cerrada el 2 de agosto de 2026.

La matriz funcional ejecutable de Inventario, Macros, comidas, recetas, planes, historial, lista de compra, ajustes y autenticación está cerrada. El workflow `Authenticated E2E` validó en producción **13/13 casos PASS** sobre `main`, incluyendo persistencia tras recarga, consumos y descuentos, operaciones de recetas y planes, transferencia de compras, temas, protección de rutas, login/logout y eliminación definitiva de cuenta con verificación administrativa de cascada de datos.

La validación física de voz, cámara y código de barras sigue pendiente como comprobación manual en dispositivo/navegador real. No se considera fallo de la matriz ejecutable ni se marca como PASS hasta realizar esa validación física.

### Mejoras confirmadas durante la validación de Inventario y Macros

Estado ya cerrado:

- La presentación de grupos al filtrar Inventario ya está corregida. Los conteos generales conservan el número real de productos y las ubicaciones excluidas por el filtro no muestran mensajes falsos de inventario vacío.
- **Implementada/cerrada:** la categoría nutricional es opcional en alta manual, edición, dictado, guardado por lote y productos recordados por código de barras. La ausencia se persiste como `null` y se presenta como “Sin categoría”.

Siguiente tarea: **2.7 — Plan de rollback de despliegues**.

Orden de implementación acordado:

#### Bloque 1 — Contratos básicos de Inventario

1. **Implementada/cerrada:** Hacer opcional la categoría nutricional al añadir o editar productos.
   - Permitir `category = null` en formulario manual, edición, dictado, guardado por lote y productos recordados por código de barras.
   - Eliminar `category-missing` como bloqueo de guardado.
   - Mostrar “Sin categoría” cuando el producto no tenga una asignada.
   - No modificar ubicación, cantidad, nutrición, RLS ni aislamiento por usuario.

2. **Implementada/cerrada:** Resolver cantidades compuestas, envases y conversiones por unidad.
   - Interpretar expresiones como “3 latas de atún de 143 g cada una”.
   - Calcular automáticamente `3 × 143 g = 429 g` sin pedir al usuario que haga la suma.
   - Guardar la cantidad útil para el usuario como unidades cuando corresponda y derivar macros por unidad a partir del peso.
   - Interpretar expresiones como “6 tortillas que pesan 350 g en total” y calcular el peso por tortilla.
   - Cuando solo se indiquen unidades, utilizar un peso medio conocido o recuperado del catálogo nutricional, manteniendo el resultado editable.
   - Mostrar durante la revisión la conversión realizada, sin exponer niveles técnicos de confianza.

#### Bloque 2 — Reconstrucción del dictado de Inventario

3. **Implementada/cerrada:** Analizar listas extensas sin que un producto inválido rechace todo el lote.
   - Separar extracción de productos y resolución nutricional.
   - Conservar todos los productos identificables aunque uno necesite revisión.
   - Resolver cada producto de forma independiente.
   - Normalizar cantidades expresadas en español, como “medio kilo”, “medio litro” o “doscientos cincuenta gramos”.
   - Aplicar una regla práctica y editable a especias o productos sin cantidad explícita.
   - Mantener el máximo actual de 30 productos y el guardado atómico e idempotente.

4. **Implementada/cerrada:** Reconocer secciones de ubicación dentro de un mismo dictado.
   - Admitir frases como “en la nevera tengo…”, “en el congelador tengo…” y “en la despensa tengo…”.
   - Heredar cada ubicación para todos los productos siguientes hasta encontrar otro encabezado de ubicación.
   - Admitir comas, pausas, puntos, saltos de línea y sinónimos como frigorífico o refrigerador.
   - Validar de forma determinista las ubicaciones detectadas después de la respuesta de IA.

Casos obligatorios de validación del bloque de voz:

- “En la nevera tengo pollo. En el congelador tengo pimiento. En la despensa tengo atún.”
- “3 latas de atún de 143 gramos cada una.”
- “6 tortillas de trigo integral.”
- “6 tortillas de trigo integral que pesan 350 gramos en total.”
- Lista extensa con tortillas, latas de atún, arroz, pasta de lenteja roja, aceite, vinagre, perejil, comino, canela, ajo molido y sal.
- Un producto incompleto no debe impedir que el resto del lote aparezca en la revisión.

#### Bloque 3 — Simplificación visual

5. **Implementada/cerrada:** Colocar “Comidas registradas hoy” inmediatamente debajo de “Registrar comida” en Macros.
   - Mantener “Objetivos diarios” como contenido secundario.
   - En móvil, ordenar: registrar comida, comidas registradas y objetivos diarios.
   - No modificar consultas, almacenamiento ni acciones de registro.

6. **Implementada/cerrada:** Eliminar toda referencia visible a niveles de confianza.
   - Quitar de la interfaz “confianza alta”, “confianza media”, “confianza baja”, porcentajes y etiquetas equivalentes.
   - Sustituirlos por mensajes prácticos como “Estimación orientativa”, “Revisa estos valores” o “Faltan datos para identificar el producto”.
   - Mantener la confianza únicamente como dato interno para validar, aceptar, solicitar revisión o rechazar resultados inseguros.
   - Aplicar la limpieza a Inventario, dictado, Texto IA, Foto IA y cualquier otra pantalla que todavía exponga ese dato.

Restricciones de ejecución:

- Implementar cada bloque mediante cambios pequeños y comprobables.
- No mezclar la recolocación visual de Macros con cambios del analizador de voz.
- No eliminar validaciones internas al ocultar la confianza en la interfaz.
- No romper atomicidad, idempotencia, persistencia, nutrición existente ni compatibilidad con productos ya guardados.
- No añadir nuevas funciones de entrada antes de corregir listas extensas y cantidades compuestas.

## Fase 1 — Capa nutricional fiable y centralizada

Prioridad: crítica.

### 1.1 Sistema híbrido de fuentes

**Implementada/cerrada.** La resolución híbrida del servidor ya se usa en el cálculo manual y en códigos de barras, el dictado por lotes reutiliza el catálogo nutricional mediante búsquedas agrupadas y los empates entre candidatos USDA reales se resuelven mediante selección estructurada y validada. `USDA_FDC_API_KEY` está configurada y el redeploy de producción fue verificado.

Orden recomendado:

1. Datos introducidos o corregidos por el usuario.
2. Datos específicos de etiqueta o código de barras.
3. Open Food Facts para productos comerciales, especialmente europeos.
4. USDA FoodData Central para alimentos genéricos.
5. IA solo para interpretar el alimento, su estado y seleccionar una coincidencia.
6. Estimación por IA únicamente como último fallback controlado.

Regla de interfaz:

- No mostrar en ninguna pantalla si el dato procede de USDA, Open Food Facts, etiqueta o IA.
- Presentar una experiencia unificada como datos nutricionales de Lakitchenapp.
- Mantener la procedencia únicamente de forma interna para caché, control de calidad y diagnóstico.

### 1.2 Catálogo nutricional interno

**Estado: Implementada/cerrada.** El catálogo nutricional privado por usuario se consulta antes de la resolución externa, conserva correcciones confirmadas, aplica frescura según la fuente y enriquece el dictado con búsquedas deduplicadas y agrupadas sin peticiones externas por producto.

Crear un catálogo central reutilizable con:

- nombre normalizado;
- sinónimos;
- estado: crudo, cocinado, escurrido, congelado o procesado;
- referencia: 100 g, 100 ml o unidad;
- kcal, proteína, carbohidratos y grasa;
- identificador externo interno;
- confianza del emparejamiento;
- fecha de actualización;
- corrección del usuario;
- indicador de dato verificado.

Objetivo: no consultar APIs externas repetidamente y mantener resultados estables.

### 1.3 Entidad única de alimento

**Implementada/cerrada.** La implementación se divide para mantener el aislamiento y evitar una adopción transversal insegura:

- **1.3A — Implementada/cerrada:** núcleo privado desplegado, FK del catálogo nutricional desplegada y corrección de su índice compuesto aplicada y validada con el advisor.
- **1.3B — Implementada/cerrada:** adopción segura por los datos operativos, dividida en:
  - **1.3B1 — Inventario — Implementada/cerrada:** la identidad nullable y protegida por propietario se propaga desde altas manuales, nutrición, códigos de barras y voz.
  - **1.3B2 — comidas y recetas guardadas — Implementada/cerrada:** hereda la identidad desde Inventario.
  - **1.3B3 — lista de compra y transferencia — Implementada/cerrada:** conserva la identidad central al transferir compras a Inventario.
- **1.3C — Implementada/cerrada:** adopción de identidad en planes sin romper aislamiento, dividida en:
  - **1.3C1 — planes privados — Implementada/cerrada:** proyección relacional de la identidad de cada ingrediente guardado, manteniendo el JSON como snapshot sin IDs privados del catálogo.
  - **1.3C2 — plantillas/globales — Implementada/cerrada:** las plantillas conservan vocabulario semántico global y priorizan la identidad privada del inventario sin almacenar sus IDs.

Crear una entidad central de alimento, por ejemplo `food_catalog_items`, utilizada por:

- inventario;
- ingredientes;
- registros de comidas;
- recetas;
- planes;
- lista de compra.

Evitar que variaciones como “pollo”, “pechuga de pollo” y “pollo fresco” se conviertan en alimentos nutricionalmente distintos sin necesidad.

### 1.4 Conversión fiable de unidades — Implementada/cerrada

- **1.4A — núcleo exacto — Implementada/cerrada:** fuente común para conversiones dimensionales exactas entre `g`/`kg`, `ml`/`l` y `ud`.
- **1.4B — equivalencias estimadas y revisables — Implementada/cerrada.**
  - **1.4B1 — modelo, almacenamiento y resolvedor — Implementada/cerrada.**
  - **1.4B2 — revisión y corrección visual — Implementada/cerrada.**
- **1.4C — adopción transversal de equivalencias — Implementada/cerrada.**
  - **1.4C1 — observaciones de envases por voz — Implementada/cerrada.**
  - **1.4C2 — reutilización confirmada por voz — Implementada/cerrada.**
  - **1.4C3 — medidas obtenidas por código de barras — Implementada/cerrada.**
  - **1.4C4 — consumo unitario y registro de macros — Implementada/cerrada.**
  - **1.4C5 — recetas del catálogo — Implementada/cerrada.**
  - **1.4C6 — recetas IA temporales y guardadas — Implementada/cerrada.**

Añadir una capa común para:

- kg ↔ g;
- l ↔ ml;
- unidades ↔ peso estimado;
- cucharada y cucharadita;
- lata;
- paquete;
- ración.

Toda conversión estimada debe poder corregirse y reutilizarse.

### 1.5 Rendimiento de cocinado — Implementada/cerrada

- **1.5A — núcleo determinista de rendimiento — Implementada/cerrada:** validación y cálculo común de pesos observados, cambio neto de agua y aceite explícitos, rendimiento, peso por ración y redistribución de nutrición total.
- **1.5B — previsualización revisable en recetas IA guardadas — Implementada/cerrada:** pesos observados y raciones permiten consultar, sin persistencia, el rendimiento y la nutrición reconstruida desde el inventario actual; los datos incompletos quedan pendientes de revisión.
- **1.5C — medición confirmada reutilizable — Implementada/cerrada:** cada receta IA guardada admite una medición corregible y eliminable de peso previo, peso cocinado y raciones; al cargarla se recalculan los resultados con la nutrición actual sin persistir valores derivados.
- **1.5D — porción consumida de un lote confirmado — Implementada/cerrada:** un contrato determinista separa lote, consumo explícito por raciones o gramos cocinados y remanente, conservando la nutrición total sin redondeos intermedios; todavía no se integra en el flujo de cocinar ni registrar comidas.
- **1.5E — lotes cocinados reales — Implementada/cerrada:** el modelo privado conserva cada cocinado como un snapshot independiente de título, pesos, raciones, nutrición total y gramos consumidos, aunque se elimine la receta de origen; las escrituras quedan reservadas para futuras operaciones atómicas.
- **1.5F — creación atómica e idempotente del lote — Implementada/cerrada:** una operación autenticada valida la receta y la medición confirmada, bloquea y descuenta sus ingredientes, calcula la nutrición desde el inventario dentro de la transacción y crea una sola vez el lote con consumo inicial cero, sin registrar una comida ni aplicar presupuesto calórico.
- **1.5G — consumo atómico de porciones cocinadas — Implementada/cerrada:** una operación independiente consume exactamente gramos o raciones de un lote, conserva su snapshot nutricional y registra una sola comida de forma transaccional e idempotente, sin volver a tocar el inventario.
- **1.5H — integración mobile-first de lotes cocinados — Implementada/cerrada:** las recetas IA guardadas con medición y nutrición confirmadas se cocinan como lotes; la interfaz muestra su remanente y permite registrar después porciones por raciones o gramos cocinados.

Modelar correctamente:

- peso crudo;
- peso cocinado;
- pérdida o absorción de agua;
- aceite incorporado;
- peso final;
- número de raciones;
- nutrientes totales y por ración.

No permitir que la IA calcule libremente estos valores cuando puedan obtenerse de cantidades reales.

## Fase 2 — Fiabilidad operativa y costes

Prioridad: alta.

**Estado: en curso.** Siguiente tarea: **2.7 Plan de rollback de despliegues**.

### 2.1 Caché y reutilización

**Estado: completada.** Los análisis válidos de Texto IA y Foto IA se reutilizan de forma privada por usuario durante 30 días mediante una huella SHA-256 de la entrada validada, el contexto normalizado, el modelo y un fingerprint determinista del contrato efectivo del proveedor (prompt, retry cuando aplica, schema y opciones semánticas). En Foto IA la huella usa los bytes exactos del JPEG y no se persiste la imagen ni el contexto original. Los errores y solicitudes de aclaración no se almacenan. La auditoría final confirma que la resolución nutricional reutilizable restante pasa por `nutrition_catalog_items`, con frescura por fuente, y no requiere otra caché.

- Reutilizar resultados nutricionales ya resueltos.
- Evitar analizar varias veces el mismo alimento, texto o imagen.
- Invalidar caché solo cuando cambien datos relevantes.

### 2.2 Límites y presupuesto de IA

**Estado: estabilizada.** **2.2A Medición privada de uso y coste: completada.** **2.2B1 Cuota diaria funcional y política por plan: completada.** **2.2B2 Presupuesto diario aproximado de coste: aplazada por decisión de producto.** 2.2A + 2.2B1 constituyen la protección activa.

2.2A mantiene un evento privado por invocación autenticada con función, proveedor, modelo, caché, intentos, latencia, resultado seguro, usage real agregado y coste histórico en micros USD según una versión explícita de precios. Los aciertos de caché no generan llamadas ni coste, los modelos sin tarifa conocida conservan coste desconocido y un fallo de telemetría no bloquea la función.

La auditoría server-side cubre Texto IA, Foto IA, nutrición de Inventario (incluida la selección IA entre candidatos USDA y el fallback nutricional), dictado de Inventario, dictado de Compra, sugerencias de Recetas y Plan diario. La ruta `/api/recipes/generate` queda fuera: usa `recipe-generator.service.ts`, un generador local determinista que no contacta a ningún proveedor y por tanto no produce usage medible. Las consultas deterministas a USDA y Open Food Facts tampoco son llamadas IA.

Controlar:

- solicitudes por usuario y día;
- coste aproximado;
- tiempo de respuesta;
- reintentos;
- tamaño máximo de imágenes y textos;
- funciones disponibles por plan futuro;
- errores por modelo.

### 2.3 Logs estructurados y correlación

**Estado: completada.** La capa común emite JSON en producción y salida legible en desarrollo, sanea centralmente campos privados, usa severidades coherentes y conserva un `correlation_id` server-side en los recorridos críticos migrados de autenticación, inventario/consumo, Compra→Inventario, resolución nutricional y guards/medición de IA. La migración del resto de logs ad hoc puede continuar de forma progresiva sobre esta infraestructura.

- Sustituir logs ad hoc de producción por una capa común de logging estructurado, preferentemente JSON.
- Incluir como mínimo timestamp, nivel, componente, evento, ruta o acción, versión de despliegue y un `request_id`/`correlation_id` estable por petición.
- Asociar el usuario solo mediante un identificador interno seguro cuando sea imprescindible para diagnosticar, sin registrar correo, contenido de comidas, imágenes, tokens, claves ni otros datos sensibles.
- Propagar el identificador de correlación por contexto asíncrono entre acciones, Supabase, OpenAI y fuentes nutricionales cuando sea técnicamente viable, sin alterar contratos públicos.
- Separar logs de desarrollo de logs de producción y aplicar retención limitada.

Criterio de cierre:

- un error de producción puede seguirse de extremo a extremo mediante un identificador de correlación;
- las pruebas verifican que secretos, imágenes y contenido privado no aparecen en logs;
- la estructura y severidades están documentadas y se usan en los flujos críticos.

### 2.4 Monitoreo de errores y alertas

**Estado: completada.** El SDK cubre navegador, Server Components/Actions y runtimes Node/Edge, sin tracing ni Replay. La sanitización central elimina PII, secretos, payloads, respuestas crudas y rutas locales del stack; los fallos inesperados comparten `correlation_id` con el logger. La validación controlada en el proyecto real confirmó recepción del evento con release, entorno `production`, correlación y stack saneados, sin secretos ni contenido privado. Sentry mantiene `sendDefaultPii: false` y `dataCollection.userInfo: false`; la alerta de issues de alta prioridad fue disparada por el fallo simulado y quedó restringida a `production`.

- Incorporar monitorización centralizada de excepciones y fallos no controlados en cliente y servidor, con stack trace, versión de release, ruta/componente y correlación con los logs estructurados.
- Agrupar errores equivalentes y registrar frecuencia, primera/última aparición y regresiones por versión.
- Sanear automáticamente PII, secretos, payloads de imágenes y respuestas crudas de proveedores antes de enviar eventos.
- Configurar alertas únicamente para fallos accionables: errores nuevos de producción, aumentos anómalos y fallos en recorridos críticos.
- Mantener las pantallas de error seguras existentes; la monitorización no debe exponer detalles técnicos al usuario.

Criterio de cierre:

- una excepción de prueba en producción controlada aparece con release y correlación correctas;
- no se envían secretos ni contenido privado;
- existe una alerta comprobada para un fallo crítico simulado.

### 2.5 Rate limiting y protección frente a abuso

**Estado: completada. Prioridad: alta.**

**2.5A + 2.5B + 2.5C implementadas:** las acciones IA autenticadas comparten un límite antiabuso server-side de 5 acciones por 60 segundos y usuario, configurable e independiente de la cuota diaria. La reserva es atómica, privada y se realiza solo al llegar a OpenAI. Autenticación mantiene las llamadas directas a Supabase Auth y usa sus límites nativos. Las búsquedas nutricionales externas reales comparten por separado un límite configurable de 10 por 60 segundos y usuario; catálogo y códigos recordados no reservan, y cada resolución lógica reserva una sola vez. Los rechazos se presentan sin exponer proveedores, datos de cuentas ni detalles internos.

- Auditar todas las superficies remotas expuestas y aplicar límites donde el abuso pueda consumir recursos, coste o disponibilidad.
- Proteger especialmente autenticación, recuperación, registro, búsquedas externas, generación con IA y cualquier endpoint/API público susceptible de automatización.
- Preferir límites por usuario autenticado y complementar por IP o huella técnica solo cuando sea necesario, evitando bloquear tráfico legítimo compartido.
- Devolver respuestas `429` seguras con ventanas de reintento cuando corresponda y no filtrar información de cuentas existentes.
- Mantener separados los límites de abuso de los presupuestos funcionales de IA de 2.2.

Criterio de cierre:

- pruebas automatizadas cubren umbral, recuperación tras ventana y aislamiento entre usuarios;
- los endpoints críticos no pueden saturarse con una única identidad sin control;
- no se altera el comportamiento de RPC internos que ya están protegidos por autenticación, RLS e idempotencia salvo necesidad demostrada.

### 2.6 Health checks y readiness

**Estado: completada. Prioridad: alta.** Liveness público confirma únicamente que la aplicación responde. Readiness consulta el health oficial de Supabase Auth con la configuración pública existente y un timeout corto; responde mediante contratos genéricos, deterministas y `no-store`, sin consultar tablas, dependencias no críticas ni exponer diagnósticos. La validación real en producción del 14 de agosto de 2026 confirmó `/api/health/live` con `200 {"status":"ok"}` y `/api/health/ready` con `200 {"status":"ready"}`, ambos `no-store`. Siguiente tarea: **2.7 Plan de rollback de despliegues**.

- Añadir un endpoint de salud mínimo que confirme que la aplicación responde sin revelar configuración interna.
- Separar, si hace falta, `liveness` de `readiness`: la segunda debe comprobar únicamente dependencias críticas necesarias para servir tráfico, como acceso básico a Supabase.
- No convertir el health check en una llamada costosa a OpenAI, USDA u otros proveedores en cada sondeo; las dependencias externas no críticas se supervisan por métricas y errores.
- Limitar cualquier diagnóstico detallado a contexto interno/autorizado y nunca devolver secretos, URLs privadas, SQL ni mensajes crudos de proveedores.

Criterio de cierre:

- health check estable, rápido y cubierto por prueba;
- una dependencia crítica simulada como no disponible produce estado de readiness correcto;
- el endpoint público no expone datos sensibles.

### 2.7 Plan de rollback de despliegues

**Estado: en curso. Prioridad: alta.** Runbook operativo documentado en `docs/rollback.md`. Pendiente ejecutar y registrar un simulacro real no destructivo dentro del objetivo temporal antes de cerrar la fase.

- Documentar y probar cómo volver a la última versión estable de Vercel en menos de cinco minutos.
- Mantener despliegues identificables por SHA/release y conservar la capacidad de promover de nuevo una versión previamente validada.
- Diseñar migraciones de Supabase con compatibilidad suficiente para que el código anterior pueda recuperarse cuando sea razonable; cualquier migración irreversible debe incluir estrategia explícita de recuperación antes de desplegarse.
- Usar feature flags únicamente cuando reduzcan de verdad el riesgo de una función nueva; no añadir infraestructura de flags sin una necesidad concreta.
- Ejecutar periódicamente un simulacro de rollback no destructivo y registrar el resultado.

Criterio de cierre:

- runbook de rollback documentado;
- simulacro desde una release de prueba completado dentro del objetivo temporal;
- comprobación posterior confirma aplicación, autenticación y datos operativos funcionales.

### 2.8 Ciclo de vida y rotación de secretos

**Estado: pendiente. Prioridad: media-alta.**

- Mantener inventario de secretos server-side y su propietario técnico: Supabase, OpenAI, USDA y cualquier proveedor futuro.
- Definir cadencia de revisión/rotación según capacidades y riesgo de cada proveedor en lugar de asumir una única cifra universal.
- Documentar rotación normal y revocación de emergencia, incluyendo actualización sin tiempo de inactividad cuando el proveedor permita solapamiento de credenciales.
- Verificar después de cada rotación que la credencial nueva funciona y que la anterior queda revocada.
- Mantener las garantías actuales: ninguna clave server-only se versiona, se expone al cliente o aparece en logs.

Criterio de cierre:

- procedimiento reproducible por proveedor;
- recordatorio operativo de revisión definido;
- simulacro de rotación de al menos una credencial no productiva sin interrupción del servicio.

### 2.9 Idempotencia y operaciones atómicas

Auditar especialmente:

- registrar comidas;
- descontar inventario;
- cocinar recetas;
- transferir compras;
- guardar planes;
- procesar voz;
- guardar resultados de IA.

Un doble clic, reintento o mala conexión no debe duplicar datos.

## Fase 3 — Calidad técnica y mantenimiento

Prioridad: alta.

### 3.1 Pruebas E2E esenciales

Automatizar solo los flujos críticos:

1. iniciar sesión;
2. añadir, editar, consumir y eliminar inventario;
3. registrar una comida;
4. guardar macros;
5. cocinar una receta;
6. guardar un plan;
7. transferir lista de compra;
8. comprobar errores y estados vacíos.

Mantener además pruebas manuales en móvil para cámara, permisos, voz y comportamiento real del navegador.

### 3.2 Accesibilidad sistemática

Validar:

- contraste;
- foco visible;
- tamaño táctil;
- etiquetas;
- lector de pantalla;
- navegación sin ratón;
- zoom al 200 %;
- mensajes de error asociados.

Realizar al menos una validación completa con NVDA antes de considerar estable la versión pública.

### 3.3 Limpieza técnica

Auditar:

- uso real de Prisma y `@prisma/client`;
- código demo o antiguo;
- dependencias sin consumidores;
- endpoints obsoletos;
- variables de entorno;
- README y documentación desactualizados.

No eliminar nada sin confirmar consumidores y pruebas.

### 3.4 Documentación operativa

Mantener documentación para:

- variables de entorno;
- despliegue;
- Supabase;
- Vercel;
- recuperación ante fallos;
- pruebas manuales;
- límites y dependencias externas.

## Fase 4 — Experiencia de usuario y simplificación

Prioridad: alta después de estabilizar la base.

Objetivo: reducir decisiones y pasos.

Revisar:

- dónde registrar una comida;
- dónde corregir macros;
- cuándo se descuenta inventario;
- qué acciones requieren confirmación;
- duplicación entre texto, foto, inventario, compositor y recetas;
- claridad de mensajes y siguiente acción.

Principio: no añadir más métodos de entrada hasta que los existentes sean fáciles de entender.

## Fase 5 — Evolución funcional priorizada de alimentación e IA

Prioridad: alta después de cerrar las Fases 2, 3 y 4.

Objetivo: mejorar la utilidad diaria de LaKitchen aprovechando su catálogo nutricional, inventario, recetas, planes y lotes cocinados. Estas funciones no deben convertir la IA en fuente libre de datos nutricionales: la IA interpreta, clasifica o propone; los valores verificables se resuelven con datos guardados, etiqueta, catálogo y fuentes nutricionales existentes.

Reglas comunes:

- Mantener todos los resultados asistidos revisables antes de persistir cambios ambiguos.
- Reutilizar `food_catalog_items`, equivalencias confirmadas y correcciones previas antes de llamar a modelos externos.
- No permitir que un modelo invente macros cuando exista una coincidencia nutricional verificable.
- Mantener Structured Outputs o contratos equivalentes estrictos en cualquier extracción de IA.
- Evitar N+1 de IA o de fuentes nutricionales; agrupar y deduplicar resoluciones.
- Aplicar caché, presupuesto, observabilidad e idempotencia de Fase 2 a cada nueva función.
- Implementar una función por PR y validar primero el flujo directamente afectado.

### 5.1 Foto IA 2.0 — identificación visual + resolución nutricional determinista

**Estado: pendiente. Prioridad: máxima.**

- Separar claramente detección visual de alimentos y cálculo nutricional.
- Usar la imagen para identificar componentes, estado de preparación y cantidades aproximadas; después resolver cada alimento contra el catálogo nutricional de LaKitchen.
- Calcular kcal y macros desde las entidades nutricionales resueltas, no desde cifras libres generadas por el modelo.
- Permitir corregir alimento, cantidad y unidad antes de guardar.
- Si una foto coincide con una receta o lote cocinado del usuario, ofrecer reutilizar ese origen en vez de volver a estimar toda la nutrición.
- Conservar el comportamiento actual de revisión humana y no descontar inventario sin confirmación explícita.

Criterio de cierre:

- conjunto de pruebas con platos simples y mixtos;
- identificación y matching validados por componente;
- cálculo nutricional reproducible desde el catálogo;
- ausencia de macros inventados cuando exista dato verificable;
- E2E del flujo foto → revisión → guardado → persistencia.

### 5.2 Importación de recetas desde web y redes

**Estado: pendiente. Prioridad: máxima.**

- Aceptar enlaces compatibles de páginas web y, cuando el contenido accesible lo permita, Instagram, TikTok y YouTube.
- Extraer título, raciones, ingredientes, cantidades, pasos y tiempos mediante un contrato estructurado y revisable.
- Resolver ingredientes contra el catálogo de LaKitchen sin inventar nutrición.
- Comparar la receta con el inventario real y señalar qué existe, qué falta y qué productos conviene gastar antes.
- Permitir enviar únicamente los faltantes a la lista de compra.
- Permitir guardar la receta y usar el flujo existente de medición, cocinado y lotes.
- Degradar con claridad cuando una plataforma no permita acceder al contenido necesario; no depender de scraping frágil como único camino.

Criterio de cierre:

- importación validada desde al menos una web estructurada y cada fuente social técnicamente soportada;
- ingredientes editables y correctamente resueltos;
- faltantes calculados contra inventario;
- guardado y posterior cocinado mediante el flujo existente sin duplicar recetas ni consumos.

### 5.3 Escáner de etiquetas nutricionales

**Estado: pendiente. Prioridad: muy alta.**

- Permitir fotografiar frontal, tabla nutricional y datos de cantidad de un producto.
- Extraer nombre, marca cuando sea útil, peso o volumen neto, número de unidades/raciones y nutrición por 100 g, 100 ml o unidad.
- Distinguir de forma determinista valores por 100 g/ml frente a valores por ración.
- Validar unidades, decimales, peso total y coherencia energética de macros antes de aceptar el resultado.
- Calcular peso por unidad cuando pueda derivarse del envase.
- Guardar la corrección confirmada en el catálogo privado para reutilizarla sin volver a usar IA.
- Priorizar código de barras/Open Food Facts cuando ya exista un producto fiable y usar la etiqueta para completar o corregir datos.

Criterio de cierre:

- pruebas con etiquetas españolas/europeas y formatos distintos;
- rechazo o revisión de tablas ambiguas;
- persistencia y reutilización del producto confirmado;
- no repetir análisis de IA para la misma etiqueta confirmada salvo invalidación relevante.

### 5.4 Asistente contextual de LaKitchen

**Estado: pendiente. Prioridad: muy alta.**

- Crear un asistente orientado a acciones de cocina, no un chatbot nutricional generalista.
- Responder usando contexto autorizado del inventario, caducidades, lotes cocinados, comidas del día, macros restantes, recetas y planes.
- Admitir preguntas prácticas como “¿qué puedo cenar?”, “¿qué debería gastar antes?” o “quiero algo de menos de 600 kcal”.
- Priorizar propuestas realizables con lo que ya existe en casa.
- Convertir recomendaciones en acciones explícitas: ver receta, añadir al plan, registrar, usar lote o buscar otra opción.
- No diagnosticar, tratar ni sustituir consejo médico o nutrición clínica.

Criterio de cierre:

- respuestas fundamentadas únicamente en datos accesibles del usuario y catálogo;
- ninguna acción destructiva o de persistencia sin confirmación;
- pruebas de autorización/RLS para impedir cruces entre usuarios;
- casos E2E de consulta → propuesta → acción seleccionada.

### 5.5 Sustituciones inteligentes basadas en inventario

**Estado: pendiente. Prioridad: alta.**

- Detectar ingredientes faltantes en recetas y planes.
- Proponer primero sustitutos que realmente estén disponibles en el inventario del usuario.
- Considerar equivalencia culinaria, cantidad disponible, caducidad y efecto nutricional.
- Recalcular cantidades y macros con el catálogo después de aceptar una sustitución.
- No modificar automáticamente una receta guardada sin confirmación.
- Reutilizar sustituciones confirmadas cuando el contexto culinario sea compatible.

Criterio de cierre:

- sustitutos disponibles y cantidades comprobadas;
- recalculado nutricional determinista;
- receta original conservada hasta confirmación;
- pruebas de faltante, sustitución aceptada, rechazada y sin alternativa válida.

### 5.6 Peso real opcional para mejorar Foto IA

**Estado: pendiente. Prioridad: alta. Dependencia: 5.1.**

- Añadir a Foto IA 2.0 una opción sencilla para introducir el peso real del plato o de la porción cuando el usuario lo conozca.
- Usar ese peso como restricción para distribuir cantidades entre los alimentos detectados, sin asumir que la visión puede deducir una escala absoluta fiable.
- Si el alimento procede de un lote cocinado conocido, priorizar el peso real y la nutrición del lote frente a una nueva estimación visual.
- Mantener el peso editable durante la revisión.

Criterio de cierre:

- el total de cantidades no puede contradecir el peso aportado fuera de tolerancias explícitas;
- comparación de precisión con y sin peso real en el benchmark de Foto IA;
- ninguna duplicación de lógica nutricional respecto a 5.1.

### 5.7 Comidas habituales y repetición sin IA

**Estado: pendiente. Prioridad: alta.**

- Permitir repetir una comida anterior con una acción corta.
- Permitir guardar combinaciones frecuentes como comida habitual.
- Reutilizar identidad de alimentos, cantidades, unidades y nutrición confirmadas sin nueva llamada de IA.
- Si los datos nutricionales base han cambiado de forma relevante, recalcular desde las entidades actuales manteniendo visible la revisión necesaria.
- Evitar duplicados por doble clic o reintento mediante idempotencia.

Criterio de cierre:

- repetir comida de historial en un paso revisable;
- guardar, editar y eliminar una comida habitual;
- cero llamadas de IA cuando todos los componentes están resueltos y vigentes;
- persistencia e idempotencia verificadas.

### 5.8 Lista de compra por déficit real

**Estado: pendiente. Prioridad: alta.**

- Auditar primero qué resta entre planes, recetas e inventario ya existe para no duplicarla.
- Calcular necesidad total de recetas/planes menos cantidad utilizable disponible en inventario.
- Resolver conversiones mediante la capa común de unidades y equivalencias ya implementada.
- Añadir a la lista de compra solo la cantidad faltante, no la cantidad completa de la receta.
- Mantener separadas reservas o consumos futuros si se incorpora ese concepto; no descontar inventario por anticipado.
- Consolidar faltantes equivalentes bajo una misma identidad de alimento cuando sea seguro.

Criterio de cierre:

- pruebas con gramos, mililitros, unidades y envases;
- faltantes correctos con inventario parcial y suficiente;
- no duplicación de artículos equivalentes;
- transferencia posterior a inventario conserva identidad y cantidades.

### 5.9 Reequilibrado automático del resto del día

**Estado: pendiente. Prioridad: media-alta.**

- Permitir recalcular las comidas pendientes cuando el consumo real se desvíe del plan del día.
- Mantener como restricciones explícitas el objetivo energético y los objetivos de macronutrientes definidos por el usuario.
- Priorizar primero ajuste de raciones de comidas ya planificadas antes de sustituir platos completos.
- Usar únicamente alimentos/recetas con nutrición resuelta; la IA puede proponer cambios, pero los totales deben calcularse de forma determinista.
- Mostrar el antes y después y exigir confirmación antes de modificar el plan.

Criterio de cierre:

- escenarios de exceso y defecto calórico;
- conservación de límites y objetivos configurados;
- ningún cambio silencioso en planes guardados;
- recalculado reproducible y persistencia correcta tras confirmar.

### 5.10 Objetivos variables por día con objetivo semanal

**Estado: pendiente. Prioridad: media. Dependencia: perfil nutricional y planificación estables.**

- Permitir distribuir un objetivo semanal de energía entre días con cantidades distintas.
- Mantener visible el total semanal y comprobar que la distribución diaria conserve ese presupuesto dentro de la tolerancia de redondeo.
- Permitir ajustes manuales por día y plantillas simples como días laborables/fin de semana.
- Integrar los objetivos diarios resultantes con planes, progreso y reequilibrado de 5.9.
- No alterar automáticamente objetivos clínicos ni inferir necesidades médicas.

Criterio de cierre:

- suma semanal determinista;
- edición de un día actualiza de forma clara el saldo semanal;
- planes y progreso consumen el objetivo correcto para cada fecha;
- pruebas de zona horaria, cambio de semana y redondeos.

## Fase 6 — Datos, recuperación y conexión débil

Prioridad: media.

### 6.1 Exportación y eliminación

Permitir:

- exportar inventario;
- exportar historial nutricional;
- exportar recetas;
- descargar datos personales;
- eliminar cuenta y datos;
- recuperar eliminaciones importantes cuando sea viable.

### 6.2 Copias de seguridad

- Definir política de backups.
- Verificar restauraciones reales.
- Documentar recuperación ante errores de usuario o despliegue.

### 6.3 Funcionamiento con conexión débil

Primera etapa:

- conservar formularios no enviados;
- mostrar claramente cuándo se necesita internet;
- reintentar de forma segura;
- permitir lectura del inventario recientemente cargado.

La cola offline completa y sincronización bidireccional quedan para una fase posterior.

## Fase 7 — Arquitectura familiar y SaaS

Prioridad: futura.

Preparar sin implementar pagos todavía:

- hogares;
- miembros;
- invitaciones;
- roles;
- inventario compartido;
- perfiles nutricionales individuales;
- comidas privadas y compartidas;
- límites por plan.

Después de validar el uso real:

- planes comerciales;
- pagos;
- límites de IA;
- gestión de suscripciones;
- facturación;
- métricas de producto.

## Orden de ejecución acordado

1. **Cerrado:** Terminar la validación funcional actual.
2. **Cerrado:** Ejecutar los tres bloques de mejoras confirmadas de Inventario y Macros en el orden documentado.
3. **Cerrado:** Corregir los demás defectos encontrados durante la validación.
4. **Cerrado:** Implementar la capa nutricional centralizada.
5. **Cerrado:** Añadir catálogo interno, unidades y estados de preparación.
6. **Actual:** Reforzar caché, observabilidad, rate limiting, health checks, rollback, secretos, costes e idempotencia.
7. Añadir pruebas E2E críticas y accesibilidad.
8. Limpiar dependencias y actualizar documentación.
9. Simplificar la UX completa.
10. Implementar en orden 5.1–5.3: Foto IA 2.0, importación de recetas y escáner de etiquetas.
11. Implementar 5.4–5.6: asistente contextual, sustituciones y peso real opcional en Foto IA.
12. Implementar 5.7–5.8: comidas habituales y lista de compra por déficit real.
13. Implementar 5.9–5.10: reequilibrado del día y objetivos variables manteniendo presupuesto semanal.
14. Añadir exportación, backups y soporte para conexión débil.
15. Preparar hogares, planes y pagos solo cuando la versión estable lo justifique.

## Fuera de alcance por ahora

- pagos inmediatos;
- funciones sociales;
- gamificación compleja;
- marketplace;
- nutrición clínica;
- diagnóstico médico;
- automatizaciones familiares avanzadas;
- sincronización offline completa;
- score nutricional simplificado tipo puntuación global;
- mascota, rachas y retos como núcleo del producto.

Estas funciones solo se reconsiderarán después de estabilizar precisión nutricional, fiabilidad y experiencia de uso.

## Gate de lanzamiento público — orden obligatorio

**Prioridad: crítica antes de abrir LaKitchen a usuarios externos. Estado: pendiente.**

Este gate no añade funciones de alimentación nuevas. Reordena como criterios de lanzamiento los trabajos técnicos y de producto que ya existen en el roadmap y añade los elementos públicos que faltan. No se debe iniciar una campaña pública ni considerar estable la versión hasta cerrar los puntos aplicables.

1. **Seguridad y privacidad de datos.** Auditar autenticación, RLS, Server Actions/RPC, permisos, endpoints, variables de entorno, secretos y headers de seguridad. Verificar que fotos, comidas, objetivos, inventario y demás datos privados no aparecen en logs ni quedan accesibles entre usuarios. Preparar política de privacidad y términos de uso coherentes con el comportamiento real de la aplicación y explicar el tratamiento de imágenes y funciones de IA.
2. **Recuperación, backups y migraciones.** Promover 6.1 y 6.2 a requisito previo de lanzamiento: exportación/eliminación de datos, política de backups, restauración real probada y procedimiento de recuperación ante migraciones o despliegues defectuosos. Toda migración irreversible necesita estrategia explícita antes de producción.
3. **Observabilidad, errores y abuso.** Cerrar 2.3–2.8: logs estructurados, monitorización de errores, rate limiting, health/readiness, rollback y rotación de secretos. Añadir estados de error, red, vacío y recuperación claros en los recorridos críticos sin exponer detalles internos.
4. **Validación E2E y dispositivo real.** Revalidar registro/login, inventario, Macros, recetas, lotes, planes, historial, lista de compra y eliminación de cuenta. Completar las pruebas físicas pendientes de voz, cámara y código de barras en móvil/navegador real. Todo defecto bloqueante o de prioridad alta debe corregirse y volver a verificarse.
5. **Responsive, rendimiento y accesibilidad básica.** Comprobar móvil, tablet y escritorio; carga inicial, consultas, imágenes y operaciones pesadas; foco, labels, contraste, tamaño táctil, teclado y lector de pantalla en los flujos esenciales. Mantener la auditoría sistemática de 3.2 como criterio de cierre.
6. **Landing pública y CTA.** Crear una página pública que explique qué hace LaKitchen, con CTA principal visible para empezar/probar y, solo si aporta valor en móvil, CTA fijo. Mantener la aplicación autenticada separada de la landing y no indexar rutas privadas.
7. **SEO técnico y compartición.** Añadir 404 personalizada, `robots.txt`, sitemap cuando corresponda, títulos y meta descriptions únicos, imagen Open Graph/social, `alt` útil y enlaces internos coherentes. Las páginas privadas, de cuenta y datos personales deben quedar fuera de indexación.
8. **Analítica mínima y respetuosa con privacidad.** Medir únicamente tráfico, activación y conversiones necesarias para mejorar producto. No enviar a analítica contenido de comidas, fotos, inventario, objetivos, respuestas de IA ni otros datos privados. Añadir gestión de consentimiento solo cuando la solución elegida o la normativa aplicable lo requiera.
9. **FAQ, contacto y documentación pública.** Añadir preguntas frecuentes sobre funcionamiento, privacidad, IA, fotos, datos nutricionales y eliminación de cuenta; ofrecer un canal claro para reportar problemas y mantener documentación de limitaciones reales.
10. **Versionado y comunicación de release.** Identificar cada despliegue por versión/SHA, mantener changelog o release notes y documentar incidencias conocidas relevantes para usuarios.

No son requisitos actuales de lanzamiento: testimonios, casos de estudio, mapa o indicaciones, Local Schema, foto de equipo o promesas comerciales de tiempo de respuesta.

**Orden global ajustado:** completar primero la Fase 2, después los requisitos críticos de Fase 3 y 6 incorporados en este gate, cerrar el gate de lanzamiento y solo entonces priorizar nuevas funciones de Fase 5 o expansión SaaS que no sean necesarias para estabilidad.
