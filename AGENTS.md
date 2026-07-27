# Instrucciones específicas de LaKitchen

Estas instrucciones complementan las instrucciones globales de Codex. No repitas aquí reglas globales sobre causa raíz, cambios mínimos, ahorro de tokens, validación, formato de respuesta o gestión de GitHub.

## Fuentes de verdad

- Verifica el estado funcional real en el código de `main`; no des por implementada una función solo porque aparezca en documentación o conversaciones previas.
- Usa `PRODUCT.md` para propósito, usuarios, capacidades y principios de producto.
- Usa `DESIGN.md` para identidad visual, componentes, accesibilidad y reglas de diseño.
- Usa `package.json` y el código vigente para stack, dependencias y comandos disponibles.
- El `README.md` sirve como documentación general, no como fuente única del estado funcional ni del roadmap.

## Producto

- LaKitchen es una aplicación mobile-first para inventario doméstico, seguimiento nutricional, recetas, planificación y lista de la compra.
- Mantén conectados los flujos base: inventario, macros, recetas y planificación. Un cambio en uno no debe romper la coherencia con los demás.
- Prioriza acciones cotidianas claras para personas no técnicas; evita exponer nombres internos de proveedores, modelos, bases de datos o fuentes en la interfaz.
- Las estimaciones asistidas por IA, voz, foto, texto o código de barras deben seguir siendo revisables antes de confirmar datos persistentes cuando exista ambigüedad.
- No sobrescribas silenciosamente correcciones manuales de cantidades, nutrición u otros datos con una normalización o estimación automática posterior.

## Datos y seguridad

- Mantén el aislamiento por usuario y las políticas RLS de Supabase en cualquier dato personal nuevo o modificado.
- No expongas secretos, claves privilegiadas ni credenciales en código cliente.
- Revalida autenticación, propiedad y límites en operaciones de servidor que lean o modifiquen datos del usuario.
- Los cambios que afecten simultáneamente a inventario y comidas deben conservar consistencia: no registres consumo sin aplicar correctamente el descuento asociado ni viceversa.
- Las acciones destructivas o ambiguas deben requerir confirmación o revisión cuando corresponda y no deben eliminar datos relacionados de forma silenciosa.

## UX y diseño

- Conserva el enfoque mobile-first y los patrones definidos en `DESIGN.md` salvo que la tarea autorice explícitamente un rediseño.
- Mantén tema claro, oscuro y del sistema mediante los tokens existentes; no introduzcas paletas paralelas sin necesidad.
- Preserva foco visible, controles identificables, navegación por teclado, mensajes de estado y objetivos táctiles adecuados.
- En mejoras visuales, no alteres lógica de inventario, macros, recetas, planificación, voz, cámara o código de barras salvo que forme parte explícita de la tarea.

## Validación específica

- Usa los scripts vigentes de `package.json`: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` cuando correspondan al alcance.
- Añade o ajusta pruebas cerca del dominio afectado cuando cambie comportamiento; no uses únicamente el build como prueba funcional.
- Cuando una tarea cambie capacidades, restricciones o diseño duradero, actualiza únicamente la documentación afectada (`PRODUCT.md`, `DESIGN.md` o documentación específica) y evita duplicar el mismo estado en varios archivos.
