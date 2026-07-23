---
name: LaKitchen
description: Interfaz web mobile-first para inventario doméstico, macros y planificación de comidas.
colors:
  background: "#f4f0e6"
  surface: "#ffffff"
  surface-soft: "#f8fafc"
  text: "#0f172a"
  muted: "#64748b"
  primary: "#657433"
  primary-strong: "#3f4925"
  accent: "#d8784a"
  success: "#16a34a"
  warning: "#f59e0b"
  error-background: "#fee2e2"
  error-text: "#991b1b"
  border: "#dbe4ee"
  focus-ring: "#86efac"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 6vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.06em"
  headline:
    fontSize: "1.15rem"
    fontWeight: 400
    letterSpacing: "-0.03em"
  title:
    fontSize: "1.05rem"
    fontWeight: 400
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  label:
    fontSize: "0.92rem"
    fontWeight: 800
rounded:
  focus-link: "8px"
  field: "16px"
  container: "18px"
  card: "28px"
  pill: "999px"
spacing:
  shell-horizontal: "18px"
  shell-top: "28px"
  grid-gap: "20px"
  card-padding: "24px"
  control-horizontal: "18px"
components:
  button-primary:
    backgroundColor: "{colors.success}"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    padding: "13px 18px"
    height: "46px"
  button-secondary:
    backgroundColor: "#0f172a"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    padding: "13px 18px"
    height: "46px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "13px 15px"
    height: "48px"
---

# Design System: LaKitchen

## Overview

**Creative North Star: "La cocina cotidiana ordenada"**

La implementación actual es limpia, sobria y práctica: una aplicación para volver varias veces al día, no una interfaz decorativa. La identidad se apoya en la cocina y el hogar mediante el fondo crema, el oliva de marca y el acento terracota; las superficies claras, la tipografía sans-serif y la información nutricional compacta mantienen la lectura funcional.

El sistema es mobile-first y usa contenedores redondeados, capas translúcidas y sombras amplias para separar tareas sin convertirlas en paneles densos. En oscuro, conserva el mismo carácter con fondos marino-verde muy oscuros, oliva desaturado y texto cálido. La evidencia revisada no establece una metáfora visual, ilustración ni lenguaje ornamental adicional; esta descripción se limita al código existente.

**Key Characteristics:**
- Fondo crema y superficie clara, con oliva y terracota como identidad visible.
- Tarjetas generosas, controles táctiles y lectura por bloques.
- Navegación inferior fija en móvil y navegación en píldora en escritorio.
- Mensajes y estados integrados en los flujos de tarea.

## Colors

La paleta usa neutros legibles para la información y reserva los tonos de marca para identidad, selección, progresos y acciones.

### Primary
- **Oliva de marca** (`primary`): identifica enlaces y navegación activa; el token fuerte se usa para texto y extremos oscuros de acciones relacionadas.
- **Verde de acción** (`success`): alimenta el degradado de los botones principales y las barras de progreso; `warning` se reserva para avisos.
- **Terracota de acento** (`accent`): aparece en el detalle circular del logotipo y como acento de marca, no como sustituto de las acciones principales.

### Neutral
- **Crema de aplicación** (`background`): fondo principal claro del cuerpo y de la marca.
- **Superficie blanca y suave** (`surface`, `surface-soft`): tarjetas, campos y bloques secundarios.
- **Tinta y texto secundario** (`text`, `muted`): información principal y soporte, respectivamente.
- **Borde y foco** (`border`, `focus-ring`): delimitan controles y comunican el foco de teclado.

### Status
- **Éxito y error** (`success`, `error-background`, `error-text`): los mensajes de éxito usan la familia verde y los errores un fondo rosado con texto rojo oscuro. El estado se acompaña de texto y roles semánticos, por lo que no depende solo del color.

En tema oscuro, los tokens se sustituyen en `[data-theme="dark"]`: el fondo pasa a `#101a1b`, las superficies a `#121d2d` y `#18263a`, el texto a `#f5f1e8`, el secundario a `#aeb8c7`, el oliva a `#9caf68` y el borde a `#2d3c52`. Se mantiene la separación tonal y la legibilidad; no se ha encontrado un tercer tema visual distinto del ajuste que sigue el sistema.

**The Token Theme Rule.** Aplicar los colores mediante las variables existentes (`--app-background`, `--card`, `--text`, `--muted`, `--border` y la familia `--brand`) para que claro y oscuro sigan resolviéndose juntos.

## Typography

**Display Font:** Inter, con `ui-sans-serif`, `system-ui`, `-apple-system`, BlinkMacSystemFont y "Segoe UI" como respaldo.

**Body Font:** La misma pila sans-serif.

**Character:** Tipografía funcional, compacta y de alto peso en acciones y etiquetas. No hay una tipografía de display distinta ni una familia monoespaciada implementada.

### Hierarchy
- **Display** (400, `clamp(2rem, 6vw, 3.5rem)`, `0.95`): `h1`; usa espaciado negativo y margen inferior de 8px para titulares de página.
- **Headline** (400, `1.15rem`): `h2`; margen inferior de 12px y espaciado de `-0.03em` para secciones.
- **Title** (400, `1.05rem`): `h3`; margen inferior de 8px para tarjetas y grupos.
- **Body** (peso heredado): contenido general; `.muted` usa `line-height: 1.6` para explicación secundaria.
- **Label** (800, `0.92rem`): etiquetas de campo; botones y enlaces de navegación también aumentan el peso para acciones claras.

## Layout

El marco `.shell` está centrado con un ancho máximo de 1120px y padding de `28px 18px 40px`. Las páginas agrupan contenido en grids con una separación base de 20px; las tarjetas usan normalmente 24px de padding. Los encabezados combinan título grande, texto de soporte y acciones, y los resúmenes de macros e inventario organizan datos en bloques cortos.

En móvil, los controles y acciones relevantes se apilan y los botones principales, navegación y enlaces de cabecera ocupan el ancho disponible en el breakpoint de 640px. La app deja espacio inferior para la barra fija y el área segura. Desde 700px aparecen grids de dos columnas en dashboard e inventario; a 760px se muestra la navegación horizontal y los modos de macros pasan a cuatro columnas; el inventario alcanza tres columnas a 1040px. Los formularios se amplían de una columna a distribuciones de dos o tres según el módulo y el ancho disponible.

**The Mobile Task Rule.** Mantener el orden de lectura lineal y los controles principales accesibles antes de distribuir secciones en columnas de escritorio.

## Elevation & Depth

La profundidad es híbrida: tarjetas y barra superior usan fondo parcialmente mezclado, borde sutil, desenfoque de fondo y sombra ambiente. La sombra principal es `0 24px 60px rgba(15, 23, 42, 0.12)` en claro y `0 24px 60px rgba(2, 6, 23, 0.48)` en oscuro; la barra superior y la navegación inferior usan sus propias sombras más bajas. Los botones principales elevan más en hover y se trasladan `-1px`; la preferencia de movimiento reducido elimina la transición de las opciones de tema.

## Shapes

Las superficies principales son ampliamente redondeadas: tarjetas y barra superior usan 28px, campos y botones 16px, y tarjetas de soporte usan 18px. Las píldoras (navegación de escritorio, etiquetas y salida de sesión) usan 999px. Los campos se definen por borde de 1px, relleno interior y sombra mínima; los `details` y formularios hacen visible información progresivamente en vez de presentar todos los controles a la vez.

## Components

### Buttons
- **Shape:** rectángulo suavemente redondeado (16px) con altura mínima de 46px; los enlaces y botones de navegación respetan un mínimo de 44px.
- **Primary:** degradado de `--brand` a `--brand-dark`, texto blanco y padding de 13px 18px; en oscuro el texto pasa al fondo de marca para conservar contraste.
- **Hover / Focus:** hover aumenta la sombra y desplaza el botón 1px hacia arriba; foco visible de 3px con `--ring` y desplazamiento de 3px.
- **Secondary:** degradado oscuro de `#0f172a` a `#334155`, con la misma silueta y respuesta de elevación.

### Cards / Containers
- **Corner Style:** tarjetas principales de 28px con borde de 1px y clipping del contenido.
- **Background:** `--card` mezclado con transparencia o `--card-soft` para zonas secundarias; en oscuro los inputs, selectores y tarjetas se ajustan a `--card`.
- **Internal Padding:** 24px en la tarjeta genérica. Los resúmenes, listas y módulos de cada dominio reutilizan ese lenguaje con grids y separadores internos.

### Inputs / Fields
- **Style:** campos y selectores de anchura completa, mínimo 48px, borde `--border`, radio de 16px y padding de 13px 15px. Las etiquetas usan texto pesado y 9px de separación.
- **Focus:** el borde cambia a `--brand` y aparece un anillo de 4px verde suave junto con sombra; los focos visibles generales conservan el contorno de 3px.
- **State:** los botones deshabilitados reducen opacidad a 0.65 y muestran cursor no disponible; los errores y éxitos usan bloques de mensaje de 16px con texto explícito.

### Navigation
- **Desktop:** la cabecera contiene el logotipo, una navegación horizontal en píldora y salida de sesión. Los cinco destinos son Inicio, Inventario, Macros, Dieta y Ajustes; el destino activo combina fondo suave de marca y texto oliva.
- **Mobile:** una barra inferior fija de cinco columnas usa icono y etiqueta, ocupa el borde inferior y respeta `safe-area-inset-bottom`. La cabecera conserva el logotipo y no muestra la navegación horizontal hasta 760px.

### Lists, summaries and disclosures
- Las tarjetas de inventario agrupan productos por ubicación y presentan cantidad, categoría, caducidad y acciones; filtros, alta, nutrición, consumo, edición y código de barras se despliegan mediante `details`/`summary`.
- Los resúmenes de macros usan barras de progreso y líneas de datos; el registro alterna modos de solo macros, texto asistido, foto y desde inventario mediante botones con `aria-pressed` y paneles asociados.
- La voz produce un borrador revisable; la foto muestra vista previa y estado; el código de barras rellena un formulario que pide revisar los datos. Estas acciones son controles funcionales del flujo actual, no iconos decorativos.
- Los estados vacíos, carga y error usan títulos, explicación y, cuando corresponde, una acción de recuperación. Los mensajes de operación usan `role="status"` o `role="alert"`.

## Do's and Don'ts

### Do:
- **Do** conservar la jerarquía de fondo crema, superficies, oliva y terracota ya implementada, junto con los tokens de tema claro y oscuro.
- **Do** mantener objetivos táctiles de al menos 44px donde existen y campos de al menos 48px.
- **Do** preservar etiquetas asociadas, `aria-label`, `aria-current`, foco visible, mensajes `status`/`alert` y controles revisables antes de confirmar.
- **Do** mantener una navegación móvil inferior de cinco destinos y el cambio a navegación horizontal desde 760px.
- **Do** priorizar tarjetas, formularios y revelación progresiva para que inventario, macros, recetas, dieta y ajustes compartan una lectura práctica.

### Don't:
- **Don't** sustituir la identidad actual por una paleta, tipografía o sistema de componentes imaginado sin autorización de rediseño.
- **Don't** alterar la lógica de inventario, macros, recetas, planificación, voz, cámara o código de barras al realizar mejoras visuales.
- **Don't** esconder acciones esenciales, información de caducidad, estados de nutrición o siguientes pasos tras efectos decorativos.
- **Don't** presentar estimaciones automatizadas como definitivas ni eliminar las oportunidades existentes de revisar y corregir antes de guardar.
- **Don't** añadir textos técnicos visibles, depender solo del color para comunicar un estado ni romper el comportamiento mobile-first y las preferencias de tema del sistema.
