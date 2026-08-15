# Runbook de rollback de despliegues

## Objetivo

Recuperar una versión estable de LaKitchen en producción en menos de cinco minutos cuando un despliegue introduzca un fallo crítico, sin reconstruir artefactos ni modificar datos de forma improvisada.

Este procedimiento cambia únicamente el tráfico de Vercel entre despliegues ya existentes y validados. No revierte migraciones de Supabase automáticamente.

## Alcance

Aplica a despliegues de producción de LaKitchen en Vercel.

No cubre:

- recuperación de backups de base de datos;
- reversión automática de migraciones;
- rotación de secretos;
- correcciones de código durante el incidente.

## Datos que deben registrarse

Antes de actuar, anotar:

- fecha y hora de inicio;
- SHA/release actualmente en producción;
- deployment ID o URL actualmente en producción;
- SHA/release estable de destino;
- deployment ID o URL estable de destino;
- motivo del rollback o del simulacro;
- operador;
- hora de finalización;
- duración total;
- resultado de health/readiness;
- resultado de `Authenticated E2E`;
- si fue necesario restaurar el despliegue original;
- incidencias observadas.

Nunca registrar tokens, claves, cookies, payloads privados ni URLs que contengan credenciales.

## 1. Confirmar el despliegue actual y el candidato estable

1. Listar los despliegues recientes de producción:

   ```bash
   vercel ls --prod
   ```

2. Identificar el despliegue actualmente activo y su SHA.
3. Elegir como destino únicamente un despliegue anterior conocido y validado.
4. Inspeccionar el destino:

   ```bash
   vercel inspect <deployment-id-o-url>
   ```

5. Confirmar que el destino está `READY` y que el SHA corresponde exactamente a la versión estable elegida.

No usar nombres ambiguos de rama como sustituto del SHA/deployment concreto.

## 2. Comprobar compatibilidad con Supabase antes de retroceder código

Antes de cambiar tráfico, revisar las migraciones de Supabase existentes entre el SHA actual y el SHA de destino.

El rollback de código se considera seguro solo si la versión anterior puede trabajar con el esquema actualmente desplegado.

Bloquear el rollback si entre ambos SHA existe una migración que, por ejemplo:

- elimina una tabla, columna o función que el código anterior necesita;
- cambia de forma incompatible tipos o restricciones;
- modifica permisos/RLS de forma incompatible con la versión anterior;
- transforma o elimina datos de forma irreversible;
- requiere una operación de recuperación de datos antes de volver al código anterior.

No ejecutar una migración inversa improvisada durante un incidente.

Toda migración irreversible debe tener una estrategia explícita de recuperación definida antes de desplegarse en producción.

## 3. Comprobar el candidato antes del cambio de tráfico

Cuando sea posible, comprobar el deployment de destino directamente antes de promoverlo:

- la aplicación responde;
- no aparecen errores críticos evidentes;
- el deployment sigue `READY`.

Si el candidato no es verificable o presenta errores, elegir otro deployment estable o detener el procedimiento.

## 4. Cambiar producción al deployment estable

El procedimiento base es promover directamente el deployment estable ya existente, sin reconstruirlo:

```bash
vercel promote <deployment-id-o-url> --yes
vercel promote status
```

Usar siempre un deployment concreto ya identificado por SHA. No reconstruir una versión antigua si el artefacto validado sigue disponible.

Objetivo operativo: completar desde el inicio del cambio de tráfico hasta la primera comprobación satisfactoria de health/readiness en menos de cinco minutos.

### Atajo opcional: `vercel rollback`

Vercel también dispone de:

```bash
vercel rollback <deployment-id-o-url>
vercel rollback status
```

El rollback dirigido a un deployment concreto está sujeto a disponibilidad según el plan de Vercel. No debe ser el único procedimiento documentado ni bloquear la recuperación si no está disponible. Cuando el plan lo permita, puede usarse como atajo equivalente para devolver tráfico a una versión anterior.

## 5. Verificación inmediata tras el cambio

Comprobar en producción:

```text
GET /api/health/live
GET /api/health/ready
```

Resultado obligatorio:

- `/api/health/live` → HTTP `200` y `{"status":"ok"}`;
- `/api/health/ready` → HTTP `200` y `{"status":"ready"}`;
- ambos con `Cache-Control: no-store`.

Si cualquiera falla, considerar el rollback no validado y aplicar el criterio de aborto.

## 6. Validación funcional posterior

Después de confirmar health/readiness, ejecutar el workflow existente de GitHub Actions:

```text
Authenticated E2E
```

El workflow definido en `.github/workflows/e2e-authenticated.yml` valida producción y debe completar satisfactoriamente los recorridos autenticados críticos.

No considerar recuperado el servicio únicamente porque la portada cargue.

## 7. Criterio de aborto y recuperación

Abortar el candidato de rollback si ocurre cualquiera de estas condiciones:

- el deployment destino no está `READY`;
- el SHA no coincide con la versión elegida;
- existe incompatibilidad conocida entre el código destino y las migraciones de Supabase ya aplicadas;
- liveness no devuelve `200`;
- readiness no devuelve `200`;
- aparece un fallo crítico de autenticación o acceso a datos;
- `Authenticated E2E` revela una regresión crítica.

En un simulacro no destructivo, restaurar inmediatamente el deployment que estaba activo al comenzar la prueba usando su deployment ID/URL registrado:

```bash
vercel promote <deployment-original-id-o-url> --yes
vercel promote status
```

Después de restaurarlo, repetir health/readiness y confirmar que producción vuelve al SHA original.

Si el deployment original no puede restaurarse o no supera health/readiness, detener el simulacro y tratarlo como incidente real.

## 8. Simulacro periódico no destructivo

Para cerrar la fase 2.7 debe ejecutarse al menos un simulacro real y controlado:

1. registrar SHA/deployment actual;
2. seleccionar una release anterior compatible y `READY`;
3. comprobar compatibilidad con migraciones;
4. iniciar cronómetro;
5. cambiar producción al deployment anterior;
6. confirmar liveness/readiness;
7. registrar tiempo de recuperación;
8. restaurar el deployment original;
9. volver a confirmar liveness/readiness;
10. ejecutar `Authenticated E2E` sobre la producción restaurada;
11. registrar el resultado completo.

El simulacro solo se considera PASS si:

- el cambio al deployment anterior se completa dentro del objetivo de cinco minutos;
- health/readiness son correctos;
- el deployment original queda restaurado correctamente;
- autenticación y datos operativos siguen funcionales;
- no se modifica ni pierde información de usuario.

## 9. Después de un rollback real

Una vez estabilizado el servicio:

1. conservar identificado el deployment defectuoso y su SHA;
2. revisar logs y observabilidad sin exponer datos privados;
3. corregir la causa raíz en una PR independiente;
4. ejecutar las pruebas relacionadas y CI;
5. desplegar una nueva versión corregida;
6. verificar health/readiness y los flujos afectados;
7. documentar el incidente y cualquier mejora necesaria en este runbook.

No volver a promover el deployment defectuoso sin una nueva validación.

## Registro de simulacros

### 14–15 de agosto de 2026 — PASS

- **Origen:** SHA `b89ef8b66f79eb4d9c1fca8493639487a291a0ca`, deployment `dpl_6oG6AMYERnYGDbtQDMoa4vw1F2R7`.
- **Destino de prueba:** SHA `3373043073d46fef0cb6de1bab3c6974dee127f8`, deployment `dpl_BBE6EQ5WXbjZgmRpuEUBhPnRkHZT`.
- **Compatibilidad:** entre ambos SHA solo había documentación; no existían migraciones ni cambios de aplicación que hicieran incompatible el retroceso.
- **Cambio al destino:** `vercel promote` completado en 2 s. El dominio de producción quedó sirviendo el deployment objetivo y `/api/health/live` y `/api/health/ready` devolvieron `200` con contratos correctos y `no-store`.
- **Restauración:** `vercel promote` del deployment original completado en 2 s. Se confirmó de nuevo el SHA activo y ambos health checks en `200`/`no-store`.
- **Incidencias detectadas durante la validación posterior:** el simulacro expuso drift de migraciones aditivas ya versionadas en `main` y un bloqueo potencial del enriquecimiento opcional del catálogo nutricional al guardar Inventario. El historial de migraciones se reconcilió con las versiones canónicas y el bloqueo se corrigió en la PR #298, fusionada como `22f930aaf35d7d2feab559b5b2b8be4837844872`.
- **Validación final sobre producción corregida:** deployment `dpl_7ccotgRMm4H8tZecVZ8yLvSy12xr` (`22f930aaf35d7d2feab559b5b2b8be4837844872`) quedó `READY`; liveness y readiness devolvieron `200`/`no-store`. La repetición final de `Authenticated E2E` (run `30746160467`, job `94992371178`) completó con éxito todas las suites: Macros, comidas, recetas, planes, historial, lista de compra, ajustes y autenticación, incluida la verificación administrativa de borrado en cascada.
- **Resultado:** PASS. El cambio y la restauración quedaron muy por debajo del objetivo de cinco minutos y la comprobación posterior confirmó aplicación, autenticación y datos operativos funcionales.
