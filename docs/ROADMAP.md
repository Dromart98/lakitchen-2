# Roadmap estratégico de Lakitchenapp

Última actualización: 26 de julio de 2026.

## Principios de producto

- Mantener una experiencia sencilla para usuarios no técnicos.
- Priorizar exactitud, fiabilidad y ahorro de tiempo antes que nuevas funciones.
- Evitar que la IA invente datos cuando exista una fuente verificable.
- Hacer cambios pequeños, comprobables y reversibles.
- Mantener ocultos los proveedores internos de datos nutricionales en la interfaz.
- Consolidar primero una versión estable antes de pagos, grupos o funciones avanzadas.

## Fase actual — Validación funcional y corrección de defectos

Prioridad: crítica.

Objetivo: terminar la matriz manual de validación de Inventario, Macros, comidas, recetas, planes, historial, lista de compra, ajustes y autenticación.

Incluye:

- Corregir defectos reproducibles encontrados durante la validación.
- Confirmar persistencia después de recargar.
- Confirmar operaciones atómicas e idempotentes.
- Validar cámara, código de barras, voz, formularios y estados vacíos.
- No añadir módulos grandes hasta cerrar esta fase.

### Mejoras confirmadas durante la validación de Inventario y Macros

Estado ya cerrado:

- La presentación de grupos al filtrar Inventario ya está corregida. Los conteos generales conservan el número real de productos y las ubicaciones excluidas por el filtro no muestran mensajes falsos de inventario vacío.
- **Implementada/cerrada:** la categoría nutricional es opcional en alta manual, edición, dictado, guardado por lote y productos recordados por código de barras. La ausencia se persiste como `null` y se presenta como “Sin categoría”.

Siguiente tarea: **Fase 1.2 — Catálogo nutricional interno**, necesario para integrar el dictado por lotes sin consultas externas ingenuas.

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

**Estado: Preparada.** La resolución híbrida del servidor ya se usa en el cálculo manual y en códigos de barras. Continúan pendientes: integrar el dictado por lotes cuando 1.2 aporte catálogo/caché (consultar hasta 30 alimentos por dictado añadiría latencia, duplicación y riesgo de límites); confirmar `USDA_FDC_API_KEY` en producción; e implementar una selección estructurada por IA entre candidatos USDA reales cuando las reglas deterministas no deshagan la ambigüedad.

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

Crear una entidad central de alimento, por ejemplo `food_catalog_items`, utilizada por:

- inventario;
- ingredientes;
- registros de comidas;
- recetas;
- planes;
- lista de compra.

Evitar que variaciones como “pollo”, “pechuga de pollo” y “pollo fresco” se conviertan en alimentos nutricionalmente distintos sin necesidad.

### 1.4 Conversión fiable de unidades

Añadir una capa común para:

- kg ↔ g;
- l ↔ ml;
- unidades ↔ peso estimado;
- cucharada y cucharadita;
- lata;
- paquete;
- ración.

Toda conversión estimada debe poder corregirse y reutilizarse.

### 1.5 Rendimiento de cocinado

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

### 2.1 Caché y reutilización

- Reutilizar resultados nutricionales ya resueltos.
- Evitar analizar varias veces el mismo alimento, texto o imagen.
- Invalidar caché solo cuando cambien datos relevantes.

### 2.2 Límites y presupuesto de IA

Controlar:

- solicitudes por usuario y día;
- coste aproximado;
- tiempo de respuesta;
- reintentos;
- tamaño máximo de imágenes y textos;
- funciones disponibles por plan futuro;
- errores por modelo.

### 2.3 Observabilidad

Registrar de forma segura:

- función y página afectadas;
- tipo de error;
- API o modelo implicado;
- duración;
- reintentos;
- éxito o abandono del flujo.

No guardar contenido privado, imágenes o datos sensibles salvo necesidad explícita.

### 2.4 Idempotencia y operaciones atómicas

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

## Fase 5 — Datos, recuperación y conexión débil

Prioridad: media.

### 5.1 Exportación y eliminación

Permitir:

- exportar inventario;
- exportar historial nutricional;
- exportar recetas;
- descargar datos personales;
- eliminar cuenta y datos;
- recuperar eliminaciones importantes cuando sea viable.

### 5.2 Copias de seguridad

- Definir política de backups.
- Verificar restauraciones reales.
- Documentar recuperación ante errores de usuario o despliegue.

### 5.3 Funcionamiento con conexión débil

Primera etapa:

- conservar formularios no enviados;
- mostrar claramente cuándo se necesita internet;
- reintentar de forma segura;
- permitir lectura del inventario recientemente cargado.

La cola offline completa y sincronización bidireccional quedan para una fase posterior.

## Fase 6 — Arquitectura familiar y SaaS

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

1. Terminar la validación funcional actual.
2. Ejecutar los tres bloques de mejoras confirmadas de Inventario y Macros en el orden documentado.
3. Corregir los demás defectos encontrados durante la validación.
4. Implementar la capa nutricional centralizada.
5. Añadir catálogo interno, unidades y estados de preparación.
6. Reforzar observabilidad, caché, costes e idempotencia.
7. Añadir pruebas E2E críticas y accesibilidad.
8. Limpiar dependencias y actualizar documentación.
9. Simplificar la UX completa.
10. Añadir exportación, backups y soporte para conexión débil.
11. Preparar hogares, planes y pagos solo cuando la versión estable lo justifique.

## Fuera de alcance por ahora

- pagos inmediatos;
- funciones sociales;
- gamificación compleja;
- marketplace;
- nutrición clínica;
- diagnóstico médico;
- automatizaciones familiares avanzadas;
- sincronización offline completa.

Estas funciones solo se reconsiderarán después de estabilizar precisión nutricional, fiabilidad y experiencia de uso.
