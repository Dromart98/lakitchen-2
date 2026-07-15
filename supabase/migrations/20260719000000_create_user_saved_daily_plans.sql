create table public.user_saved_daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  priority_mode text not null check (priority_mode in ('balanced', 'expiration')),
  max_minutes_per_meal smallint not null check (max_minutes_per_meal in (15, 30, 45, 60)),
  target jsonb not null check (jsonb_typeof(target) = 'object'),
  total jsonb not null check (jsonb_typeof(total) = 'object'),
  difference jsonb not null check (jsonb_typeof(difference) = 'object'),
  fit text not null check (fit in ('close', 'acceptable', 'far')),
  meals jsonb not null check (jsonb_typeof(meals) = 'array' and jsonb_array_length(meals) = 4),
  fingerprint text not null check (length(fingerprint) = 64),
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index user_saved_daily_plans_user_created_at_idx
  on public.user_saved_daily_plans (user_id, created_at desc);

alter table public.user_saved_daily_plans enable row level security;

create policy "Users can read their saved daily plans"
  on public.user_saved_daily_plans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save their own daily plans"
  on public.user_saved_daily_plans
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their saved daily plans"
  on public.user_saved_daily_plans
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_saved_daily_plans from anon;
grant select, insert, delete on table public.user_saved_daily_plans to authenticated;
