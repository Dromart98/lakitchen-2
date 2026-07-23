---
name: lakitchen-mobile-inputs
description: "Protege y mejora las entradas mobile-first de LaKitchen. Usar en tareas que afecten al dictado por voz, listas extensas dictadas, reconocimiento es-ES, cámara, códigos de barras, selección de cámara, autofocus, MediaStream, permisos de cámara o micrófono, formularios o teclado móvil, tamaño táctil, o estados de grabación, escaneo, carga, error o cancelación."
---

# Entradas móviles de LaKitchen

Mantener la automatización como un borrador controlado por la persona. Priorizar la causa raíz, la integridad de los datos y el cierre fiable de recursos antes de ajustar la interfaz o de añadir reintentos.

## Procedimiento obligatorio

1. Inspeccionar el flujo completo y reproducir o aislar el problema antes de cambiar código, interfaz o tiempos de reintento. Seguir eventos, estado local, llamadas de red, permisos, límites de datos y desmontaje; no asumir que es un problema visual.
2. Identificar las fases y mantenerlas separadas: **reconocimiento/captura** (voz, cámara o texto), **análisis** (normalización, IA o catálogo), **revisión de la persona** (edición, confirmación y avisos) y **persistencia**. No guardar desde reconocimiento o análisis.
3. Representar explícitamente los estados relevantes y su salida: inactivo, solicitando permiso, grabando o escaneando, analizando/cargando, revisión, guardando, cancelado, permiso denegado, dispositivo ausente, no compatible y error recuperable.
4. Validar con pruebas focalizadas y, si cambia una interfaz ejecutable, comprobar el flujo móvil visualmente. Documentar cualquier limitación real del navegador o del entorno.

## Voz y listas extensas

- Configurar reconocimiento en `es-ES`, informar si el idioma, navegador, red, permiso del micrófono o dispositivo impiden usarlo, y conservar una alternativa escrita.
- Acumular resultados finales de la sesión actual; invalidar eventos y reinicios atrasados al detener, cancelar, analizar, limpiar o desmontar. Liberar reconocimiento y temporizadores de reinicio al cerrar o desmontar.
- No truncar, descartar ni guardar productos silenciosamente. Antes de imponer un límite de texto o de artículos, comunicarlo, conservar el texto disponible y pedir que se divida la lista de forma explícita.
- Analizar una lista completa en un borrador editable. Interpretar ubicaciones independientes en el mismo dictado: **nevera**, **congelador** y **despensa**; no aplicar una ubicación global que sobrescriba productos con ubicación explícita.
- Mantener cada producto reconocido, incluso si su cantidad, unidad, ubicación, categoría o interpretación es ambigua. Marcar el campo concreto que requiere revisión y pedir confirmación explícita antes de persistir datos incompletos. No mostrar porcentajes ni etiquetas de confianza.

## Cámara y códigos de barras

- Comprobar compatibilidad y permisos antes de iniciar. Distinguir permiso denegado, ausencia de cámara, restricción de dispositivo, cancelación y fallo de lectura; ofrecer entrada manual cuando corresponda.
- Preferir la cámara trasera sin anular una selección manual. Enumerar dispositivos solo cuando el permiso lo permita y usar etiquetas seguras cuando el navegador no las exponga.
- Tratar autofocus y enfoque por punto como mejoras opcionales: detectar capacidades, aplicar restricciones compatibles y mantener el escáner funcional si fallan. No ocultar errores de adquisición del stream como si fueran un fallo de enfoque.
- Asociar cada inicio a una versión o solicitud vigente. Ignorar resultados de `getUserMedia`, detector, selección de cámara y `requestAnimationFrame` que lleguen después de cancelar o de cambiar de cámara.
- Al cerrar el escáner, detectar un código, cancelar, cambiar de cámara o desmontar: detener todas las pistas de `MediaStream`, vaciar `video.srcObject`, cancelar temporizadores y `requestAnimationFrame`, e invalidar solicitudes pendientes. Apagar inmediatamente cualquier indicador de escaneo; nunca dejarlo activo tras cerrar la cámara.
- Mantener el valor detectado como dato revisable. Buscar o autocompletar no equivale a guardar: permitir corregir el código y el producto antes de persistir.

## Formularios y diseño móvil

- Conservar etiquetas asociadas, foco visible, mensajes con texto y regiones `status`/`alert`; no comunicar permisos, errores, grabación o escaneo solo con color o iconos.
- Priorizar una lectura lineal en pantalla pequeña, teclado móvil adecuado (`inputMode`, `autocomplete` y tipo de campo), textos legibles y acciones primarias visibles.
- Mantener objetivos táctiles de al menos 44 px y campos de al menos 48 px, sin convertir controles críticos en iconos sin etiqueta.
- Deshabilitar únicamente las acciones incompatibles durante una operación; conservar cancelar, cerrar y la recuperación comprensible cuando sea segura.

## Puntos de inspección del repositorio

- Revisar el contrato y límites de los borradores de inventario y compra, sus acciones de análisis/guardado y sus vistas previas antes de alterar dictado o persistencia.
- Revisar `components/voice/usePersistentSpeechRecognition.ts` y `modules/voice/browser-speech-recognition.ts` para sesiones, idioma, errores y limpieza.
- Revisar `app/inventory/BarcodeCatalogControls.tsx` y `modules/barcodes/camera.ts` para selección de cámara, autofocus, bucle del detector y limpieza de streams.
- Mantener los principios de revisión humana de `PRODUCT.md` y el sistema mobile-first de `DESIGN.md`.

## Criterios de entrega

- Demostrar la causa raíz o declarar la evidencia que impide confirmarla antes de proponer reintentos o cambios visuales.
- Verificar que reconocimiento, análisis, revisión y guardado no se solapan indebidamente.
- Verificar listas largas, ubicaciones mezcladas, ambigüedad, permisos denegados, dispositivo ausente, cancelación, error, cierre y desmontaje.
- Confirmar que no quedan pistas, streams, temporizadores, animation frames ni indicadores activos después de terminar el flujo.
