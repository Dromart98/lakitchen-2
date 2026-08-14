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

## 4. Ejecutar rollback

Para volver a un despliegue concreto:

```bash
vercel rollback <deployment-id-o-url>
```

Comprobar después el estado:

```bash
vercel rollback status
```

Objetivo operativo: completar desde el inicio del cambio de tráfico hasta la primera comprobación satisfactoria de health/readiness en menos de cinco minutos.

### Alternativa: promover un deployment existente

Cuando el flujo operativo requiera apuntar producción explícitamente a un deployment previamente validado:

```bash
vercel promote <deployment-id-o-url>
vercel promote status
```

Usar siempre un deployment concreto ya identificado por SHA. No reconstruir una versión antigua para realizar el rollback si el artefacto validado sigue disponible.

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
vercel promote <deployment-original-id-o-url>
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