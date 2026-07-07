# Supabase setup

## Required variables

Lakitchenapp V2 will use Supabase Auth and Supabase Database. The project expects these public variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

These are the only Supabase variables required for the current base setup.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` with your Supabase project URL.
3. Fill in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with your Supabase publishable key.
4. Restart `npm run dev` after changing environment variables.

Do not commit `.env.local` or any file containing real keys.

## Vercel configuration

In Vercel:

1. Open the project settings.
2. Go to **Settings → Environment Variables**.
3. Add `NEXT_PUBLIC_SUPABASE_URL`.
4. Add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Redeploy the project after saving changes.

For this Next.js app, keep **Framework Preset** set to **Next.js** and leave **Output Directory** empty. Do not set the Output Directory to `public`.

## Where to find the values in Supabase

In Supabase:

1. Open your Supabase project.
2. Go to **Project Settings → API**.
3. Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the publishable API key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.


## Package installation note

The Supabase packages used by this project are lowercase npm scopes:

- `@supabase/supabase-js`
- `@supabase/ssr`

If TypeScript falls back to `types/supabase-shims.d.ts`, treat that file as temporary. It exists only for environments where the npm registry blocks downloading `@supabase/ssr`. Once `npm install` succeeds and the real package types are available in `node_modules`, remove the shim so the app uses Supabase's real published types.

## Security notes

- Never commit real Supabase keys to the repository.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is designed to be used by the browser, but it must be protected with Row Level Security policies in the database.
- Do not use `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Do not add `SUPABASE_SERVICE_ROLE_KEY` to `.env.example` for the MVP client/server setup.
- If a service role key is ever needed for backend-only jobs, it must stay server-only and must never be exposed through `NEXT_PUBLIC_` variables.
