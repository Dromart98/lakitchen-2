# Fase 3.2: auditoría automatizada de accesibilidad

Estado: avance parcial. No se certifican los flujos protegidos sin sesión.
Validación local: 6 pruebas unitarias relacionadas aprobadas; build y
typecheck aprobados. Suite general: 931 aprobadas y 7 fallidas en 5 archivos
preexistentes de pruebas que comparan código fuente con saltos LF frente al
checkout CRLF; los archivos afectados no se modificaron. No confundir esta
limitación con una suite general aprobada.

## Ejecutar

`npm ci`, `npx playwright install chromium`, `npm run test:e2e`.
El servidor usa el puerto 3100 y la configuración pública habitual de Supabase
en `.env.local`. No ejecutar build/typecheck simultáneamente con el servidor
de desarrollo: Next regenera `.next/types`.

Para las rutas protegidas, establecer `E2E_STORAGE_STATE` a la ruta de un
storage state Playwright de una cuenta de pruebas. Guardarlo fuera del
repositorio o en `tests/e2e/.auth/` (ignorado). Sin sesión, los diez casos
se omiten explícitamente. No hay bypass de autenticación ni cambios de RLS.

## Cobertura y límites

- Login: axe (WCAG A/AA 2.0, 2.1 y 2.2) en claro/oscuro a 1280, 640 y 320 px.
- Teclado: orden email, contraseña, mostrar/ocultar, enviar; validación nativa
  de campos obligatorios. Foco visible y contraste del anillo claro >= 3:1.
- Error de credenciales: respuesta HTTP simulada, alerta y descripción
  accesible de ambos campos. No verifica el servicio de autenticación real.
- Reflow: ancho del documento y botones de al menos 24 x 24 CSS px.
  No demuestra ausencia de todos los solapamientos ni todas las excepciones
  de tamaño táctil; axe complementa las comprobaciones geométricas.
- Rutas protegidas: Inicio, inventario, compra, macros, recetas, dieta,
  perfil, ajustes, historial y resumen semanal. Comprueba la entrada,
  salto al contenido, axe y reflow. No cubre todavía completar cada flujo,
  estados poblados/vacíos, todos los errores ni acciones de escritura.
- 640 px modela el ancho efectivo de 1280 px al 200%; no se usa
  `deviceScaleFactor` ni se afirma que esto sea zoom real del navegador.

## Defectos reproducidos

- Foco claro: contraste 1,40:1 sobre blanco; token cambiado a verde oscuro.
- Nombre del campo contraseña incluía el texto del botón Mostrar; botón
  separado del label para mantener un nombre estable.
- Texto introductorio del login claro fallaba color-contrast en axe;
  ajustados solo sus colores.
- Error general de autenticación sin asociación a los campos; añadido
  aria-describedby, sin atribuir falsamente el fallo a un campo específico.
- Navegación repetida sin enlace de salto; añadido destino main enfocable.
  La prueba estática comprueba el contrato; su ejecución autenticada queda
  pendiente de sesión.

## Validación manual posterior (pendiente)

Con NVDA y una cuenta de pruebas, recorrer todos los flujos anteriores:
comprobar landmarks, títulos, nombres, orden de lectura, anuncios de estados
y errores, cambios de vista, devolución de foco y ausencia de trampas.
Completar formularios, desplegables y acciones con Tab/Shift+Tab, Enter,
Espacio y flechas cuando proceda. Incluir estados con datos y sin datos.

Con zoom real del navegador al 200%, en ambos temas, comprobar texto,
acciones, mensajes, navegación fija y ausencia de solapamientos/pérdida de
funcionalidad. Revisar foco no oculto y contraste en imágenes/gradientes
que axe marque como incompletos. Registrar navegador, versión de NVDA,
viewport, ruta, pasos y resultado. Esta fase no se declara completada
por el mero resultado verde de las pruebas automatizadas.
