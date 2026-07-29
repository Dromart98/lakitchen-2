create table public.food_quantity_equivalences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  food_catalog_item_id uuid not null,
  measure_kind text not null,
  variant_key text not null default 'default',
  display_label text not null,
  canonical_quantity numeric not null,
  canonical_unit text not null,
  source text not null,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_quantity_equivalences_id_user_unique unique (id, user_id),
  constraint food_quantity_equivalences_key_unique unique (user_id, food_catalog_item_id, measure_kind, variant_key),
  constraint food_quantity_equivalences_owner_fk foreign key (food_catalog_item_id, user_id)
    references public.food_catalog_items (id, user_id) on delete cascade,
  constraint food_quantity_equivalences_measure_check check (measure_kind in ('unit', 'tablespoon', 'teaspoon', 'can', 'package', 'serving')),
  constraint food_quantity_equivalences_variant_check check (variant_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(variant_key) between 1 and 80),
  constraint food_quantity_equivalences_label_check check (display_label = btrim(display_label) and char_length(display_label) between 1 and 120),
  constraint food_quantity_equivalences_quantity_check check (canonical_quantity > 0 and canonical_quantity < 'Infinity'::numeric),
  constraint food_quantity_equivalences_unit_check check (canonical_unit in ('g', 'ml', 'ud')),
  constraint food_quantity_equivalences_source_check check (source in ('user', 'barcode-memory', 'observed-package', 'ai')),
  constraint food_quantity_equivalences_confirmation_check check ((source = 'user') = user_confirmed)
);

create index food_quantity_equivalences_food_owner_idx
on public.food_quantity_equivalences (food_catalog_item_id, user_id);

alter table public.food_quantity_equivalences enable row level security;
revoke all on table public.food_quantity_equivalences from public, anon, authenticated;
grant select on table public.food_quantity_equivalences to authenticated;

create policy "Users can view own food quantity equivalences"
on public.food_quantity_equivalences for select to authenticated
using ((select auth.uid()) = user_id);

create trigger set_food_quantity_equivalences_updated_at
before update on public.food_quantity_equivalences
for each row execute function public.set_updated_at();

create function public.save_food_quantity_equivalence_proposal(
  p_food_catalog_item_id uuid, p_measure_kind text, p_variant_key text,
  p_display_label text, p_canonical_quantity numeric, p_canonical_unit text, p_source text
) returns public.food_quantity_equivalences
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.food_quantity_equivalences;
  v_new_priority integer;
  v_old_priority integer;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  if p_source not in ('observed-package', 'barcode-memory', 'ai') or p_source is null then
    raise exception using errcode = '22023', message = 'invalid-equivalence-source';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_user_id::text || ':' || p_food_catalog_item_id::text || ':' || coalesce(p_measure_kind, '') || ':' || coalesce(p_variant_key, ''), 0));
  perform 1 from public.food_catalog_items where id = p_food_catalog_item_id and user_id = v_user_id for key share;
  if not found then raise exception using errcode = '42501', message = 'food-catalog-item-not-owned'; end if;
  select * into v_row from public.food_quantity_equivalences
    where user_id = v_user_id and food_catalog_item_id = p_food_catalog_item_id
      and measure_kind = p_measure_kind and variant_key = p_variant_key for update;
  if not found then
    insert into public.food_quantity_equivalences
      (user_id, food_catalog_item_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed)
    values (v_user_id, p_food_catalog_item_id, p_measure_kind, p_variant_key, p_display_label, p_canonical_quantity, p_canonical_unit, p_source, false)
    returning * into v_row;
    return v_row;
  end if;
  if v_row.user_confirmed then return v_row; end if;
  v_new_priority := case p_source when 'observed-package' then 3 when 'barcode-memory' then 2 else 1 end;
  v_old_priority := case v_row.source when 'observed-package' then 3 when 'barcode-memory' then 2 else 1 end;
  if v_new_priority < v_old_priority then return v_row; end if;
  if v_row.source = p_source and v_row.display_label = p_display_label
      and v_row.canonical_quantity = p_canonical_quantity and v_row.canonical_unit = p_canonical_unit then
    return v_row;
  end if;
  update public.food_quantity_equivalences set display_label = p_display_label,
    canonical_quantity = p_canonical_quantity, canonical_unit = p_canonical_unit, source = p_source
  where id = v_row.id and user_id = v_user_id returning * into v_row;
  return v_row;
end; $$;

create function public.save_confirmed_food_quantity_equivalence(
  p_equivalence_id uuid, p_food_catalog_item_id uuid, p_measure_kind text,
  p_variant_key text, p_display_label text, p_canonical_quantity numeric,
  p_canonical_unit text, p_expected_updated_at timestamptz
) returns public.food_quantity_equivalences
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_row public.food_quantity_equivalences;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_user_id::text || ':' || p_food_catalog_item_id::text || ':' || coalesce(p_measure_kind, '') || ':' || coalesce(p_variant_key, ''), 0));
  perform 1 from public.food_catalog_items where id = p_food_catalog_item_id and user_id = v_user_id for key share;
  if not found then raise exception using errcode = '42501', message = 'food-catalog-item-not-owned'; end if;
  if p_equivalence_id is null then
    select * into v_row from public.food_quantity_equivalences
      where user_id = v_user_id and food_catalog_item_id = p_food_catalog_item_id
        and measure_kind = p_measure_kind and variant_key = p_variant_key for update;
    if found and v_row.user_confirmed then raise exception using errcode = '40001', message = 'equivalence_conflict'; end if;
    if found then
      update public.food_quantity_equivalences set display_label = p_display_label,
        canonical_quantity = p_canonical_quantity, canonical_unit = p_canonical_unit,
        source = 'user', user_confirmed = true
      where id = v_row.id and user_id = v_user_id returning * into v_row;
    else
      insert into public.food_quantity_equivalences
        (user_id, food_catalog_item_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed)
      values (v_user_id, p_food_catalog_item_id, p_measure_kind, p_variant_key, p_display_label, p_canonical_quantity, p_canonical_unit, 'user', true)
      returning * into v_row;
    end if;
    return v_row;
  end if;
  select * into v_row from public.food_quantity_equivalences
    where id = p_equivalence_id and user_id = v_user_id for update;
  if not found or v_row.food_catalog_item_id <> p_food_catalog_item_id
      or v_row.measure_kind <> p_measure_kind or v_row.variant_key <> p_variant_key
      or v_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'equivalence_conflict';
  end if;
  update public.food_quantity_equivalences set display_label = p_display_label,
    canonical_quantity = p_canonical_quantity, canonical_unit = p_canonical_unit,
    source = 'user', user_confirmed = true, updated_at = pg_catalog.now()
  where id = v_row.id and user_id = v_user_id returning * into v_row;
  return v_row;
end; $$;

create function public.delete_food_quantity_equivalence(
  p_equivalence_id uuid, p_expected_updated_at timestamptz
) returns public.food_quantity_equivalences
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_row public.food_quantity_equivalences;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  select * into v_row from public.food_quantity_equivalences
    where id = p_equivalence_id and user_id = v_user_id for update;
  if not found or v_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'equivalence_conflict';
  end if;
  delete from public.food_quantity_equivalences where id = v_row.id and user_id = v_user_id;
  return v_row;
end; $$;

revoke all on function public.save_food_quantity_equivalence_proposal(uuid, text, text, text, numeric, text, text) from public, anon;
revoke all on function public.save_confirmed_food_quantity_equivalence(uuid, uuid, text, text, text, numeric, text, timestamptz) from public, anon;
revoke all on function public.delete_food_quantity_equivalence(uuid, timestamptz) from public, anon;
grant execute on function public.save_food_quantity_equivalence_proposal(uuid, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.save_confirmed_food_quantity_equivalence(uuid, uuid, text, text, text, numeric, text, timestamptz) to authenticated;
grant execute on function public.delete_food_quantity_equivalence(uuid, timestamptz) to authenticated;
