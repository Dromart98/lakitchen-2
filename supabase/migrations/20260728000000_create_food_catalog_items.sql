create table public.food_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  food_state text not null,
  identity_source text not null,
  external_id text,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_catalog_items_id_user_unique unique (id, user_id),
  constraint food_catalog_items_exact_identity_unique unique (user_id, normalized_name, food_state),
  constraint food_catalog_items_name_check check (normalized_name = btrim(normalized_name) and char_length(normalized_name) between 1 and 120),
  constraint food_catalog_items_display_name_check check (char_length(btrim(display_name)) between 1 and 200),
  constraint food_catalog_items_aliases_check check (array_position(aliases, null) is null),
  constraint food_catalog_items_food_state_check check (food_state in ('raw', 'cooked', 'drained', 'frozen', 'processed', 'not_applicable', 'unknown')),
  constraint food_catalog_items_source_check check (identity_source in ('user', 'barcode-memory', 'open-food-facts', 'usda', 'ai')),
  constraint food_catalog_items_user_authority_check check (not user_confirmed or identity_source in ('user', 'barcode-memory'))
);

create unique index food_catalog_items_external_identity_unique
on public.food_catalog_items (user_id, identity_source, external_id, food_state)
where external_id is not null;
create index food_catalog_items_aliases_idx on public.food_catalog_items using gin (aliases);

alter table public.food_catalog_items enable row level security;
revoke all on table public.food_catalog_items from public, anon, authenticated;
grant select, insert, update, delete on table public.food_catalog_items to authenticated;

create trigger set_food_catalog_items_updated_at
before update on public.food_catalog_items
for each row execute function public.set_updated_at();

create policy "Users can view own food catalog items"
on public.food_catalog_items for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can create own food catalog items"
on public.food_catalog_items for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update own food catalog items"
on public.food_catalog_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own food catalog items"
on public.food_catalog_items for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.nutrition_catalog_items add column food_catalog_item_id uuid;

-- Backfill provider identities first, consolidating only identical, non-null provider IDs.
insert into public.food_catalog_items (
  user_id, display_name, normalized_name, aliases, food_state, identity_source,
  external_id, user_confirmed, created_at, updated_at
)
select distinct on (user_id, source, external_id, food_state)
  user_id, normalized_name, normalized_name, aliases, food_state, source,
  external_id, user_confirmed, created_at, updated_at
from public.nutrition_catalog_items
where external_id is not null
order by user_id, source, external_id, food_state, user_confirmed desc, created_at
on conflict (user_id, normalized_name, food_state) do nothing;

-- Remaining legacy rows are consolidated by exact normalized name and state only.
insert into public.food_catalog_items (
  user_id, display_name, normalized_name, aliases, food_state, identity_source,
  external_id, user_confirmed, created_at, updated_at
)
select distinct on (n.user_id, n.normalized_name, n.food_state)
  n.user_id, n.normalized_name, n.normalized_name, n.aliases, n.food_state, n.source,
  case when n.external_id is not null and not exists (
    select 1 from public.food_catalog_items f
    where f.user_id = n.user_id and f.identity_source = n.source
      and f.external_id = n.external_id and f.food_state = n.food_state
  ) then n.external_id else null end,
  n.user_confirmed, n.created_at, n.updated_at
from public.nutrition_catalog_items n
where not exists (
  select 1 from public.food_catalog_items f
  where f.user_id = n.user_id and f.normalized_name = n.normalized_name and f.food_state = n.food_state
)
order by n.user_id, n.normalized_name, n.food_state, n.user_confirmed desc, n.created_at
on conflict (user_id, normalized_name, food_state) do nothing;

update public.nutrition_catalog_items n
set food_catalog_item_id = f.id
from public.food_catalog_items f
where n.food_catalog_item_id is null and n.user_id = f.user_id and n.food_state = f.food_state
  and ((n.external_id is not null and n.source = f.identity_source and n.external_id = f.external_id)
    or n.normalized_name = f.normalized_name);

alter table public.nutrition_catalog_items
add constraint nutrition_catalog_items_food_owner_fk
foreign key (food_catalog_item_id, user_id)
references public.food_catalog_items (id, user_id)
on delete set null (food_catalog_item_id);
create index nutrition_catalog_items_food_catalog_item_idx
on public.nutrition_catalog_items (food_catalog_item_id);

create or replace function public.resolve_or_create_food_catalog_item(
  p_user_id uuid, p_display_name text, p_normalized_name text, p_aliases text[],
  p_food_state text, p_identity_source text, p_external_id text,
  p_user_confirmed boolean, p_existing_food_catalog_item_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_aliases text[];
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'food-catalog-user-mismatch';
  end if;
  if p_normalized_name is null or p_normalized_name = '' then
    raise exception using errcode = '22023', message = 'food-catalog-name-empty';
  end if;
  v_aliases := array(select distinct value from unnest(coalesce(p_aliases, '{}') || array[p_normalized_name]) value where value <> '');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || p_food_state || ':' || coalesce(p_identity_source || ':' || p_external_id, p_normalized_name), 0
  ));

  if p_existing_food_catalog_item_id is not null then
    select id into v_id from public.food_catalog_items
    where id = p_existing_food_catalog_item_id and user_id = p_user_id and food_state = p_food_state;
  end if;
  if v_id is null and p_external_id is not null then
    select f.id into v_id
    from public.food_catalog_items f
    where f.user_id = p_user_id and f.food_state = p_food_state
      and ((f.identity_source = p_identity_source and f.external_id = p_external_id)
        or exists (select 1 from public.nutrition_catalog_items n
          where n.food_catalog_item_id = f.id and n.user_id = p_user_id
            and n.food_state = p_food_state and n.source = p_identity_source and n.external_id = p_external_id))
    limit 1;
  end if;
  if v_id is null then
    select id into v_id from public.food_catalog_items
    where user_id = p_user_id and food_state = p_food_state
      and (normalized_name = any(v_aliases) or aliases && v_aliases)
    order by (normalized_name = p_normalized_name) desc limit 1;
  end if;

  if v_id is null then
    insert into public.food_catalog_items (
      user_id, display_name, normalized_name, aliases, food_state, identity_source, external_id, user_confirmed
    ) values (
      p_user_id, p_display_name, p_normalized_name,
      array(select value from unnest(v_aliases) value where value <> p_normalized_name),
      p_food_state, p_identity_source, p_external_id, p_user_confirmed
    )
    on conflict (user_id, normalized_name, food_state) do update
      set aliases = array(select distinct value from unnest(public.food_catalog_items.aliases || excluded.aliases) value)
    returning id into v_id;
  else
    update public.food_catalog_items
    set aliases = array(select distinct value from unnest(aliases || v_aliases) value where value <> normalized_name),
      display_name = case when p_user_confirmed and not user_confirmed then p_display_name else display_name end,
      identity_source = case when p_user_confirmed and not user_confirmed then p_identity_source else identity_source end,
      user_confirmed = user_confirmed or p_user_confirmed
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.resolve_or_create_food_catalog_item(uuid, text, text, text[], text, text, text, boolean, uuid) from public, anon;
grant execute on function public.resolve_or_create_food_catalog_item(uuid, text, text, text[], text, text, text, boolean, uuid) to authenticated;

-- Extend the Phase 1.2 writer without changing its nutrition replacement rules.
create or replace function public.upsert_nutrition_catalog_items(p_items jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_count integer;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'invalid-catalog-payload';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_items) entries(item)
    where item->>'user_id' is null or (item->>'user_id')::uuid <> v_user_id) then
    raise exception using errcode = '42501', message = 'catalog-user-mismatch';
  end if;
  insert into public.nutrition_catalog_items (
    user_id, food_catalog_item_id, normalized_name, aliases, food_state, nutrition_basis,
    calories, protein_g, carbs_g, fat_g, source, external_id, match_confidence,
    user_confirmed, verified, resolved_at, refresh_after
  ) select user_id, food_catalog_item_id, normalized_name, aliases, food_state, nutrition_basis,
    calories, protein_g, carbs_g, fat_g, source, external_id, match_confidence,
    user_confirmed, verified, resolved_at, refresh_after
  from pg_catalog.jsonb_to_recordset(p_items) item(
    user_id uuid, food_catalog_item_id uuid, normalized_name text, aliases text[], food_state text,
    nutrition_basis text, calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
    source text, external_id text, match_confidence text, user_confirmed boolean, verified boolean,
    resolved_at timestamptz, refresh_after timestamptz
  ) on conflict (user_id, normalized_name, food_state, nutrition_basis) do update set
    food_catalog_item_id = coalesce(excluded.food_catalog_item_id, public.nutrition_catalog_items.food_catalog_item_id),
    aliases = excluded.aliases, calories = excluded.calories, protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, source = excluded.source,
    external_id = excluded.external_id, match_confidence = excluded.match_confidence,
    user_confirmed = excluded.user_confirmed, verified = excluded.verified,
    resolved_at = excluded.resolved_at, refresh_after = excluded.refresh_after
  where (excluded.user_confirmed and (excluded.source = 'user' or public.nutrition_catalog_items.source <> 'user'))
    or (not excluded.user_confirmed and not public.nutrition_catalog_items.user_confirmed and
      (public.nutrition_catalog_items.refresh_after <= pg_catalog.now() or
       case excluded.source when 'ai' then 1 when 'usda' then 2 when 'open-food-facts' then 3 when 'barcode-memory' then 4 when 'user' then 5 else 0 end >=
       case public.nutrition_catalog_items.source when 'ai' then 1 when 'usda' then 2 when 'open-food-facts' then 3 when 'barcode-memory' then 4 when 'user' then 5 else 0 end));
  get diagnostics v_count = row_count; return v_count;
end; $$;

revoke all on function public.upsert_nutrition_catalog_items(jsonb) from public, anon;
grant execute on function public.upsert_nutrition_catalog_items(jsonb) to authenticated;
