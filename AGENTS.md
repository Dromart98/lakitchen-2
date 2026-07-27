# Instrucciones para agentes

## Eficiencia de Codex

* Minimiza el consumo de tokens sin reducir la calidad de la implementación.
* Lee únicamente los archivos necesarios para la tarea y amplía el análisis solo cuando sea necesario para encontrar la causa raíz.
* No revises el repositorio completo salvo que la tarea lo requiera.
* Ejecuta primero las pruebas directamente relacionadas con los cambios realizados.
* No ejecutes suites completas salvo cambios transversales, validación final o riesgo que lo justifique.
* No incluyas diffs completos en la respuesta final.
* No enumeres archivos simplemente revisados; indica únicamente los modificados.
* No repitas análisis, razonamientos ni detalles que ya sean evidentes en el código o diff.
* Mantén explicaciones extensas únicamente cuando exista un error, bloqueo o decisión técnica relevante.
* No realices tareas de gestión de GitHub que pueda asumir ChatGPT, como revisar PR, checks, Actions, logs o fusionar PR.

### Respuesta final

La respuesta final debe ser mínima e incluir únicamente:

* Rama.
* SHA final.
* Archivos modificados.
* Pruebas ejecutadas y resultado.
* Estado final o bloqueo existente.

Formato recomendado:

Rama: `...`
SHA: `...`

Modificados:

* `archivo`

Pruebas:

* `prueba` → PASS/FAIL

Estado: implementado y verificado / bloqueado por `motivo`.
