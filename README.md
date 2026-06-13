# Lakitchen

MVP funcional de una app mobile-first para seguimiento de macros, inventario doméstico y generación de recetas con alimentos disponibles.

## Qué incluye este primer código

- Dashboard PWA-style con macros consumidos, macros restantes, productos próximos a caducar y receta sugerida.
- Módulo de cálculo de macros con Mifflin-St Jeor, multiplicadores de actividad y objetivos por meta física.
- Módulo de inventario con ubicaciones `pantry`, `fridge`, `freezer`, alertas de caducidad y consumo seguro.
- Generador de recetas por reglas que prioriza caducidad, disponibilidad y encaje con macros restantes.
- API routes iniciales para cálculo de macros, inventario, comidas y generación de recetas.
- Esquema Prisma/PostgreSQL con usuarios, perfiles, objetivos, inventario, comidas, recetas y transacciones.
- Tests unitarios para cálculo nutricional e inventario.

## Comandos

```bash
npm install
npm run dev
npm run test
npm run typecheck
```

## Stack

- Next.js + React + TypeScript.
- Prisma + PostgreSQL.
- Zod para validación de entradas API.
- Vitest para pruebas unitarias.

## Próximos pasos

1. Conectar autenticación real con Auth.js o Supabase Auth.
2. Reemplazar datos demo por Prisma en los endpoints.
3. Añadir formularios CRUD de inventario y registro de comidas.
4. Implementar transacción real de `preparar receta` para descontar inventario y registrar comida.
5. Añadir PWA manifest, service worker, IndexedDB y cola offline.
