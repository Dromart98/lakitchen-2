# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

LaKitchen está pensada principalmente para personas que gestionan su propia cocina doméstica y no necesitan ser expertas en nutrición ni tecnología. La experiencia prioriza el uso diario desde móvil: consultar qué hay en casa, registrar una comida o añadir una compra debe requerir pasos claros y breves.

Estas personas buscan comer mejor, seguir calorías y macronutrientes cuando les resulta útil, ahorrar en la compra y reducir el desperdicio de alimentos. La evolución hacia un uso por familias o pequeños grupos es una posibilidad futura indicada para el producto, no una capacidad confirmada de la implementación actual.

## Product Purpose

LaKitchenapp es una aplicación mobile-first para reunir en un mismo lugar el inventario doméstico, el seguimiento nutricional y la planificación de comidas. Resuelve la falta de visibilidad sobre los alimentos disponibles, las caducidades y el avance diario hacia objetivos nutricionales.

Permite consultar y organizar productos de despensa, nevera y congelador; añadirlos, editarlos o descontar cantidades; registrar comidas y macros; definir objetivos nutricionales; consultar el historial de comidas; generar recetas que tienen en cuenta el inventario y las caducidades; y generar y guardar planes diarios. También incluye lista de la compra, sugerencias de recetas y flujos asistidos de voz, foto, texto y código de barras donde el navegador o los datos disponibles lo permiten.

El valor frente a una gestión manual es conectar existencias, alimentación y decisiones de cocina: ayuda a usar lo que ya se tiene, atender productos próximos a caducar, registrar el impacto nutricional y preparar comidas con información contextual en lugar de listas separadas o cálculos manuales.

## Positioning

LaKitchen combina el inventario real de una cocina doméstica con recetas, macros y planificación. Las recetas y los planes usan la disponibilidad, las cantidades, las caducidades y, cuando están completos, los datos nutricionales guardados por la persona; el registro desde inventario puede descontar los productos utilizados.

## Operating Context

El uso se organiza alrededor de tareas cotidianas de cocina: revisar el inicio, gestionar productos, ver qué caduca, registrar una comida, consultar macros, encontrar una receta, planificar un día y preparar la compra. La navegación principal reúne Inicio, Inventario, Macros, Dieta y Ajustes; los accesos relacionados, como recetas, historial, perfil nutricional y lista de la compra, aparecen dentro de los flujos correspondientes.

Las estimaciones asistidas requieren revisión humana antes de guardar. Por ejemplo, las entradas de voz se convierten en un borrador revisable, los resultados de texto o foto permiten corregir ingredientes y cantidades, y el catálogo de código de barras pide revisar los datos antes de añadirlos.

## Capabilities and Constraints

- Inventario por despensa, nevera y congelador, con cantidades, categorías, caducidad, nutrición, filtros, edición y consumo.
- Alertas de productos próximos a caducar y recetas que priorizan disponibilidad, tiempo y urgencia.
- Registro de comidas manual, por texto asistido, foto asistida o ingredientes del inventario, con calorías y proteínas, carbohidratos y grasas.
- Perfil nutricional y objetivos diarios; vistas de progreso, historial y resumen semanal.
- Generación, revisión y guardado de recetas y de planes diarios; los planes señalan productos que necesitan revisión antes de poder utilizarlos.
- Lista de la compra y transferencia de artículos al inventario.
- Preferencia de tema claro, oscuro o del sistema guardada en el navegador.
- La aplicación no debe exponer nombres internos de proveedores, modelos, bases de datos ni fuentes nutricionales. Los mensajes visibles deben explicar el efecto para la persona en lenguaje cotidiano.
- No se debe asumir conocimiento de términos técnicos. Cuando la nutrición, una unidad o la disponibilidad impidan una acción, el producto debe mostrar qué revisar y el siguiente paso comprensible.

## Brand Commitments

El nombre visible es LaKitchen. El tono existente es cercano, práctico y directo: habla de “tu cocina”, “lo que ya tienes” y acciones concretas. La marca debe ayudar a tomar decisiones cotidianas sin tratar la gestión de alimentos como una herramienta profesional o técnica.

## Evidence on Hand

La evidencia disponible en el repositorio son los flujos implementados, los textos de interfaz y los activos de marca locales: `README.md`, las rutas de `app/`, los componentes de `components/` y los SVG de `public/brand/`. No hay testimonios, métricas públicas, precios ni estudios de usuario en las fuentes revisadas; no se deben fabricar.

## Product Principles

1. **Claridad y utilidad antes que complejidad.** Cada pantalla debe facilitar una tarea doméstica concreta y evitar sobrecargar la decisión.
2. **Móvil primero.** La información y las acciones esenciales deben poder consultarse y completarse cómodamente en una pantalla pequeña.
3. **Automatizar sin quitar control.** Las sugerencias, importaciones y estimaciones se presentan para revisar y corregir antes de confirmar cambios.
4. **Explicar estados y próximos pasos.** Los errores, datos incompletos, cargas y estados vacíos deben usar lenguaje comprensible y orientar a la acción posible.
5. **Proteger los flujos base.** Inventario, macros, recetas y planificación son capacidades conectadas que no deben romperse ni convertirse en funciones para expertos.

## Accessibility & Inclusion

LaKitchen debe mantener una experiencia accesible para uso cotidiano: controles identificables, foco visible, navegación por teclado, contraste y mensajes de estado que no dependan solo del color. Las preferencias del sistema ya se respetan para el tema cuando la persona elige esa opción. Las mejoras deben conservar estos patrones y pedir confirmación antes de acciones destructivas o ambiguas.
