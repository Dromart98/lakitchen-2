create table if not exists public.daily_meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  calories integer not null default 0 check (calories >= 0),
  protein_g integer not null default 0 check (protein_g >= 0),
  carbs_g integer not null default 0 check (carbs_g >= 0),
  fat_g integer not null default 0 check (fat_g >= 0),
  consumed_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.daily_meal_logs enable row level security;

create index if not exists daily_meal_logs_user_date_idx
on public.daily_meal_logs (user_id, consumed_on, created_at desc);

drop policy if exists "Users can view own daily meal logs" on public.daily_meal_logs;
create policy "Users can view own daily meal logs"
on public.daily_meal_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own daily meal logs" on public.daily_meal_logs;
create policy "Users can create own daily meal logs"
on public.daily_meal_logs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own daily meal logs" on public.daily_meal_logs;
create policy "Users can delete own daily meal logs"
on public.daily_meal_logs
for delete
to authenticated
using (auth.uid() = user_id);
