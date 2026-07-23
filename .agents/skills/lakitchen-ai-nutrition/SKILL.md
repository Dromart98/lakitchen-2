---
name: lakitchen-ai-nutrition
description: "Implementar, revisar o depurar exclusivamente los flujos de nutrición e IA de LaKitchenapp. Usar cuando una tarea afecte estimaciones de calorías o macronutrientes; alimentos crudos, cocinados o procesados; normalización de cantidades o unidades; USDA FoodData Central; inventario nutricional; reconocimiento de comidas por texto, voz o fotografía; recetas, raciones o presupuesto calórico restante; conciliación o consumo de inventario; registro atómico o idempotente de comidas; o esquemas estructurados de respuestas de IA."
---

# Nutrición e IA de LaKitchen

Aplicar esta skill únicamente a los flujos nutricionales y de IA de LaKitchenapp. Investigar primero la fuente real del dato, el cálculo o la mutación; no corregir un síntoma en la interfaz ni sustituir una causa determinista por una estimación.

## Investigar antes de cambiar

1. Leer `PRODUCT.md`, las restricciones de `AGENTS.md` aplicables y los módulos, acciones, rutas, migraciones y pruebas del flujo afectado.
2. Trazar el dato desde su origen hasta la presentación: entrada, normalización, estado de alimento, base nutricional, cálculo, persistencia, respuesta y UI.
3. Identificar si cada valor es **observado** (etiqueta, inventario, usuario), **calculado** (fórmula reproducible) o **inferido** (IA, foto, texto o equivalencia no confirmada). Conservar esa distinción en tipos, contratos y validación interna sin exponer etiquetas técnicas innecesarias en la interfaz.
4. Reproducir o cubrir el defecto en la capa que posee la regla. Corregir esa capa y añadir o actualizar una prueba de la invariancia relevante.

No revelar en la interfaz nombres técnicos de fuentes o proveedores, incluidos USDA FoodData Central, Open Food Facts o IA. Tampoco mostrar porcentajes, etiquetas o textos de confianza. Explicar únicamente el resultado, los supuestos relevantes y la acción de revisión con lenguaje cotidiano.

## Modelo nutricional y unidades

- Representar y etiquetar sin ambigüedad valores **por 100 g**, **por 100 ml**, **por unidad**, **totales** y **por ración**. Nunca reutilizar un valor de una base como si fuese otra.
- Normalizar las cantidades antes de calcular y permitir solo conversiones dimensionalmente compatibles: masa con `g`/`kg`, volumen con `ml`/`l` y conteo con `ud`/unidad. No convertir masa a volumen ni unidades a gramos sin un dato observado y explícito que lo permita.
- Mantener la base de cada artículo de inventario junto con sus macros. Calcular totales mediante el factor de la base y redondear solo para mostrar; preservar precisión decimal en contratos, sumas y almacenamiento.
- Separar cantidad disponible, cantidad consumida, cantidad de receta, total de receta y ración. Calcular `por ración = total de receta / raciones válidas`; no tratar una ración como el total.
- Tratar el estado alimentario como dato semántico obligatorio cuando cambie la referencia: `raw`, `cooked`, `processed`, `not_applicable` o `unknown`. No usar valores de crudo para cocinado, ni valores de cocinado para crudo. Si no se puede resolver una diferencia material, mantenerla como pendiente de revisión en lugar de adivinar.

## Usar IA con límites estrictos

- Usar IA solo para reconocer, normalizar o inferir información que no exista de forma determinista. Preferir datos observados del inventario, etiqueta o entrada confirmada y cálculos locales para macros, totales, raciones, consumo y presupuesto.
- Hacer que la IA devuelva un esquema estructurado y estricto. Validar el JSON como datos no confiables en el servidor antes de persistirlo; rechazar propiedades inesperadas, números no finitos, negativos, bases incompatibles y estados o unidades no admitidos.
- Exigir ingredientes separados, cantidades, unidades, preparación/estado y supuestos en estimaciones de texto, voz o foto. Marcar las cantidades visuales o domésticas como revisables; no presentarlas como mediciones ni mostrar niveles de confianza.
- Cuando una ambigüedad pueda cambiar materialmente los macros, la base o el estado, conservar el dato como pendiente de revisión y no inventar aceite, salsa, marca, receta, método de cocción, peso por unidad ni ingredientes no observados.
- Mantener separado el borrador de IA de la operación confirmada. La IA no debe afirmar que guardó una comida, cocinó una receta ni descontó inventario.

## Recetas, presupuesto y consumo

1. Calcular nutrición de la receta exclusivamente con cantidades normalizadas y nutrición compatible de cada ingrediente.
2. Calcular el presupuesto restante a partir del objetivo diario y lo ya registrado con aritmética determinista.
3. Verificar que cada ración de la receta cabe en el presupuesto antes de habilitar guardar, planificar o cocinar. Si la nutrición está incompleta o el presupuesto no está disponible, comunicarlo y no afirmar que cumple el objetivo.
4. Volver a validar disponibilidad, caducidad, unidad y cantidad de inventario en el límite de persistencia; no confiar solo en el cliente ni en un borrador previo.
5. Registrar la comida, sus líneas con instantánea nutricional y el descuento o borrado de inventario en una sola transacción/RPC. Bloquear o condicionar las filas para impedir sobregiros concurrentes y revertir todo ante cualquier error.
6. Exigir una clave de idempotencia para operaciones reintentables que puedan crear un registro o consumir existencias. Vincularla a una huella estable del payload y devolver el resultado original para la misma clave y payload; rechazar reutilizaciones con payload distinto.

## Lista de comprobación de entrega

- Confirmar el origen de cada dato y si es observado, calculado o inferido.
- Confirmar base nutricional, unidad, estado crudo/cocinado/procesado, precisión y momento de redondeo.
- Confirmar que la IA no reemplaza una fuente o cálculo determinista disponible y que su salida se valida contra un esquema estricto.
- Confirmar el presupuesto calórico antes de guardar o cocinar recetas.
- Confirmar atomicidad, concurrencia e idempotencia de cualquier registro de comida o descuento de inventario repetible.
- Confirmar que los textos visibles no exponen fuentes técnicas ni confianza y conservan una revisión humana sencilla de las estimaciones.
