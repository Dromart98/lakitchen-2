create table public.nutrition_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_name text not null,
  aliases text[] not null default '{}',
  food_state text not null,
  nutrition_basis text not null,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  source text not null,
  external_id text,
  match_confidence text not null default 'medium',
  user_confirmed boolean not null default false,
  verified boolean not null default false,
  resolved_at timestamptz not null default now(),
  refresh_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_catalog_items_identity_unique unique (user_id, normalized_name, food_state, nutrition_basis),
  constraint nutrition_catalog_items_name_check check (normalized_name = btrim(normalized_name) and char_length(normalized_name) between 1 and 120),
  constraint nutrition_catalog_items_aliases_check check (array_position(aliases, null) is null),
  constraint nutrition_catalog_items_food_state_check check (food_state in ('raw', 'cooked', 'drained', 'frozen', 'processed', 'not_applicable', 'unknown')),
  constraint nutrition_catalog_items_basis_check check (nutrition_basis in ('per_100g', 'per_100ml', 'per_unit')),
  constraint nutrition_catalog_items_source_check check (source in ('user', 'barcode-memory', 'open-food-facts', 'usda', 'ai')),
  constraint nutrition_catalog_items_confidence_check check (match_confidence in ('low', 'medium', 'high')),
  constraint nutrition_catalog_items_calories_check check (calories >= 0 and calories not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_protein_check check (protein_g >= 0 and protein_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_carbs_check check (carbs_g >= 0 and carbs_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_fat_check check (fat_g >= 0 and fat_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_user_source_check check (
    (user_confirmed and source in ('user', 'barcode-memory'))
    or (not user_confirmed and source in ('open-food-facts', 'usda', 'ai'))
  ),
  constraint nutrition_catalog_items_refresh_check check ((user_confirmed and refresh_after is null) or (not user_confirmed and refresh_after is not null))
);

-- Supports the exact identity lookup and conflict target; aliases use the GIN index.
create index nutrition_catalog_items_aliases_idx on public.nutrition_catalog_items using gin (aliases);

alter table public.nutrition_catalog_items enable row level security;
revoke all on table public.nutrition_catalog_items from public, anon, authenticated;
grant select, insert, update, delete on table public.nutrition_catalog_items to authenticated;

create trigger set_nutrition_catalog_items_updated_at
before update on public.nutrition_catalog_items
for each row execute function public.set_updated_at();

create policy "Users can view own nutrition catalog items"
on public.nutrition_catalog_items for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own nutrition catalog items"
on public.nutrition_catalog_items for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own nutrition catalog items"
on public.nutrition_catalog_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own nutrition catalog items"
on public.nutrition_catalog_items for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.upsert_nutrition_catalog_items(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'not-authenticated';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'invalid-catalog-payload';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_items) as entries(item)
    where item->>'user_id' is null or (item->>'user_id')::uuid <> v_user_id
  ) then
    raise exception using errcode = '42501', message = 'catalog-user-mismatch';
  end if;

  insert into public.nutrition_catalog_items (
    user_id, normalized_name, aliases, food_state, nutrition_basis,
    calories, protein_g, carbs_g, fat_g, source, external_id,
    match_confidence, user_confirmed, verified, resolved_at, refresh_after
  )
  select user_id, normalized_name, aliases, food_state, nutrition_basis,
    calories, protein_g, carbs_g, fat_g, source, external_id,
    match_confidence, user_confirmed, verified, resolved_at, refresh_after
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    user_id uuid, normalized_name text, aliases text[], food_state text, nutrition_basis text,
    calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric, source text, external_id text,
    match_confidence text, user_confirmed boolean, verified boolean, resolved_at timestamptz, refresh_after timestamptz
  )
  on conflict (user_id, normalized_name, food_state, nutrition_basis) do update set
    aliases = excluded.aliases,
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    source = excluded.source,
    external_id = excluded.external_id,
    match_confidence = excluded.match_confidence,
    user_confirmed = excluded.user_confirmed,
    verified = excluded.verified,
    resolved_at = excluded.resolved_at,
    refresh_after = excluded.refresh_after
  where
    (excluded.user_confirmed and (
      excluded.source = 'user'
      or public.nutrition_catalog_items.source <> 'user'
    ))
    or (
      not excluded.user_confirmed
      and not public.nutrition_catalog_items.user_confirmed
      and (
        public.nutrition_catalog_items.refresh_after <= pg_catalog.now()
        or case excluded.source
          when 'ai' then 1 when 'usda' then 2 when 'open-food-facts' then 3
          when 'barcode-memory' then 4 when 'user' then 5 else 0 end
        >= case public.nutrition_catalog_items.source
          when 'ai' then 1 when 'usda' then 2 when 'open-food-facts' then 3
          when 'barcode-memory' then 4 when 'user' then 5 else 0 end
      )
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.upsert_nutrition_catalog_items(jsonb) from public, anon;
grant execute on function public.upsert_nutrition_catalog_items(jsonb) to authenticated;
