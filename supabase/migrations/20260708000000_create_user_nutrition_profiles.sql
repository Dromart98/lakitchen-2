create table if not exists public.user_nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  age integer,
  sex text check (sex in ('male', 'female')),
  height_cm numeric,
  weight_kg numeric,
  goal text check (goal in ('lose_fat', 'maintain', 'gain_muscle')),
  activity_level text check (activity_level in ('low', 'medium', 'high')),
  target_calories integer,
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_nutrition_profiles_user_id_key unique (user_id)
);

alter table public.user_nutrition_profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_nutrition_profiles_updated_at on public.user_nutrition_profiles;
create trigger set_user_nutrition_profiles_updated_at
before update on public.user_nutrition_profiles
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view own nutrition profile" on public.user_nutrition_profiles;
create policy "Users can view own nutrition profile"
on public.user_nutrition_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own nutrition profile" on public.user_nutrition_profiles;
create policy "Users can create own nutrition profile"
on public.user_nutrition_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own nutrition profile" on public.user_nutrition_profiles;
create policy "Users can update own nutrition profile"
on public.user_nutrition_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
