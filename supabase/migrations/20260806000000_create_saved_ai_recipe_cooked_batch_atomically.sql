alter table public.user_saved_ai_recipe_cooked_batches
  add column creation_fingerprint text,
  add column source_measurement_updated_at timestamptz;

alter table public.user_saved_ai_recipe_cooked_batches
  add constraint user_saved_ai_recipe_cooked_batches_creation_fingerprint_check
  check (creation_fingerprint is null or (creation_fingerprint = btrim(creation_fingerprint) and char_length(creation_fingerprint) between 1 and 20000));

create or replace function public.prevent_cooked_batch_snapshot_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.recipe_title is distinct from old.recipe_title
    or new.raw_weight_g is distinct from old.raw_weight_g
    or new.cooked_weight_g is distinct from old.cooked_weight_g
    or new.servings is distinct from old.servings
    or new.total_calories is distinct from old.total_calories
    or new.total_protein_g is distinct from old.total_protein_g
    or new.total_carbs_g is distinct from old.total_carbs_g
    or new.total_fat_g is distinct from old.total_fat_g
    or new.creation_fingerprint is distinct from old.creation_fingerprint
    or new.source_measurement_updated_at is distinct from old.source_measurement_updated_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'Cooked batch snapshot cannot be changed';
  end if;
  if new.source_recipe_id is distinct from old.source_recipe_id
    and not (old.source_recipe_id is not null and new.source_recipe_id is null) then
    raise exception using errcode = '42501', message = 'Cooked batch source recipe cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.create_saved_ai_recipe_cooked_batch(
  p_request_id uuid,
  p_recipe_id uuid,
  p_expected_measurement_updated_at timestamptz,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipe public.user_saved_ai_recipes%rowtype;
  v_measurement public.user_saved_ai_recipe_cooking_yields%rowtype;
  v_item public.inventory_items%rowtype;
  v_equivalence public.food_quantity_equivalences%rowtype;
  v_line record;
  v_count integer;
  v_input_count integer;
  v_fingerprint text;
  v_existing public.user_saved_ai_recipe_cooked_batches%rowtype;
  v_factor numeric;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_equivalence_count integer;
  v_eq_id uuid;
  v_eq_updated_at timestamptz;
  v_eq_quantity numeric;
  v_eq_unit text;
  v_remaining numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_request_id is null or p_recipe_id is null or p_expected_measurement_updated_at is null
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_input_count := jsonb_array_length(p_lines);
  if v_input_count < 1 or v_input_count > 20 then
    raise exception using errcode = '22023', message = case when v_input_count > 20 then 'too_many_items' else 'invalid_input' end;
  end if;

  create temporary table pg_temp.batch_lines (
    item_id uuid primary key,
    consumed_quantity numeric not null,
    expected_equivalence_id uuid,
    expected_equivalence_updated_at timestamptz,
    expected_canonical_quantity numeric,
    expected_canonical_unit text
  ) on commit drop;
  create temporary table pg_temp.batch_ingredients (
    item_id uuid primary key,
    name text not null,
    quantity numeric not null,
    unit text not null
  ) on commit drop;
  create temporary table pg_temp.batch_items (
    id uuid primary key,
    food_catalog_item_id uuid,
    name text,
    quantity numeric,
    unit text,
    expires_at date,
    nutrition_basis text,
    calories numeric,
    protein_g numeric,
    carbs_g numeric,
    fat_g numeric
  ) on commit drop;
  create temporary table pg_temp.batch_equivalences (
    id uuid primary key,
    food_catalog_item_id uuid not null,
    variant_key text not null,
    canonical_quantity numeric,
    canonical_unit text,
    updated_at timestamptz
  ) on commit drop;

  begin
    insert into pg_temp.batch_lines
    select
      (line ->> 'item_id')::uuid,
      (line ->> 'consumed_quantity')::numeric,
      case when line ? 'expected_equivalence_id' then (line ->> 'expected_equivalence_id')::uuid end,
      case when line ? 'expected_equivalence_updated_at' then (line ->> 'expected_equivalence_updated_at')::timestamptz end,
      case when line ? 'expected_canonical_quantity' then (line ->> 'expected_canonical_quantity')::numeric end,
      case when line ? 'expected_canonical_unit' then line ->> 'expected_canonical_unit' end
    from jsonb_array_elements(p_lines) as lines(line)
    where jsonb_typeof(line) = 'object'
      and line ? 'item_id' and line ? 'consumed_quantity'
      and (select count(*) from jsonb_object_keys(line)) in (2, 6)
      and not exists (
        select 1 from jsonb_object_keys(line) key
        where key not in ('item_id', 'consumed_quantity', 'expected_equivalence_id', 'expected_equivalence_updated_at', 'expected_canonical_quantity', 'expected_canonical_unit')
      )
      and (((select count(*) from jsonb_object_keys(line)) = 2
          and not line ? 'expected_equivalence_id' and not line ? 'expected_equivalence_updated_at'
          and not line ? 'expected_canonical_quantity' and not line ? 'expected_canonical_unit')
        or ((select count(*) from jsonb_object_keys(line)) = 6
          and line ? 'expected_equivalence_id' and line ? 'expected_equivalence_updated_at'
          and line ? 'expected_canonical_quantity' and line ? 'expected_canonical_unit'));
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or unique_violation then
      raise exception using errcode = '22023', message = 'invalid_input';
  end;
  get diagnostics v_count = row_count;
  if v_count <> v_input_count or exists (
    select 1 from pg_temp.batch_lines
    where consumed_quantity <= 0
      or consumed_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or (expected_equivalence_id is null) <> (expected_equivalence_updated_at is null)
      or (expected_equivalence_id is null) <> (expected_canonical_quantity is null)
      or (expected_equivalence_id is null) <> (expected_canonical_unit is null)
      or (expected_equivalence_id is not null and (
        expected_canonical_quantity <= 0
        or expected_canonical_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        or expected_canonical_unit not in ('g', 'ml')
      ))
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select concat_ws('|', p_recipe_id::text, p_expected_measurement_updated_at::text,
    (select jsonb_agg(jsonb_build_object(
      'item_id', item_id,
      'consumed_quantity', consumed_quantity,
      'expected_equivalence_id', expected_equivalence_id,
      'expected_equivalence_updated_at', expected_equivalence_updated_at,
      'expected_canonical_quantity', expected_canonical_quantity,
      'expected_canonical_unit', expected_canonical_unit
    ) order by item_id)::text from pg_temp.batch_lines))
  into v_fingerprint;

  select * into v_recipe
  from public.user_saved_ai_recipes
  where id = p_recipe_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'recipe_not_found';
  end if;

  for v_line in
    select inventory_item_id, name, quantity, unit
    from public.user_saved_ai_recipe_ingredients
    where recipe_id = p_recipe_id and user_id = v_user_id
    order by inventory_item_id, id
    for update
  loop
    begin
      insert into pg_temp.batch_ingredients values (v_line.inventory_item_id, v_line.name, v_line.quantity, v_line.unit);
    exception when unique_violation then
      raise exception using errcode = '22023', message = 'recipe_stale';
    end;
  end loop;
  select count(*) into v_count from pg_temp.batch_ingredients;
  if v_count < 1 or v_count > 20 or v_count <> v_input_count then
    raise exception using errcode = '22023', message = case when v_count > 20 then 'too_many_items' else 'recipe_stale' end;
  end if;

  select * into v_measurement
  from public.user_saved_ai_recipe_cooking_yields
  where recipe_id = p_recipe_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'measurement_required';
  end if;
  if v_measurement.updated_at <> p_expected_measurement_updated_at then
    raise exception using errcode = '40001', message = 'measurement_conflict';
  end if;

  select * into v_existing
  from public.user_saved_ai_recipe_cooked_batches
  where id = p_request_id and user_id = v_user_id
  for update;
  if found then
    if v_existing.source_recipe_id = p_recipe_id and v_existing.creation_fingerprint = v_fingerprint then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;
  if exists (select 1 from public.user_saved_ai_recipe_cooked_batches where id = p_request_id) then
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;

  if exists (
    select 1 from pg_temp.batch_lines line
    full join pg_temp.batch_ingredients ingredient on ingredient.item_id = line.item_id
    where line.item_id is null or ingredient.item_id is null or line.consumed_quantity <> ingredient.quantity
  ) then
    raise exception using errcode = '22023', message = 'recipe_stale';
  end if;

  for v_line in select * from pg_temp.batch_lines order by item_id loop
    select * into v_item from public.inventory_items
    where id = v_line.item_id and user_id = v_user_id
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'recipe_stale'; end if;
    if v_item.name <> (select name from pg_temp.batch_ingredients where item_id = v_item.id)
      or v_item.unit <> (select unit from pg_temp.batch_ingredients where item_id = v_item.id) then
      raise exception using errcode = '22023', message = 'recipe_stale';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0
      or v_item.quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.consumed_quantity > v_item.quantity then
      raise exception using errcode = '22003', message = 'insufficient_stock';
    end if;
    if v_item.expires_at is not null and v_item.expires_at < (now() at time zone 'utc')::date then
      raise exception using errcode = '22023', message = 'expired_item';
    end if;
    insert into pg_temp.batch_items values (
      v_item.id, v_item.food_catalog_item_id, v_item.name, v_item.quantity, v_item.unit,
      v_item.expires_at, v_item.nutrition_basis, v_item.calories, v_item.protein_g, v_item.carbs_g, v_item.fat_g
    );
  end loop;

  for v_equivalence in
    select equivalence.* from public.food_quantity_equivalences equivalence
    where equivalence.user_id = v_user_id and equivalence.measure_kind = 'unit'
      and equivalence.user_confirmed = true and equivalence.source = 'user'
      and equivalence.food_catalog_item_id in (select food_catalog_item_id from pg_temp.batch_items where food_catalog_item_id is not null)
    order by equivalence.food_catalog_item_id, equivalence.variant_key, equivalence.id
    for update
  loop
    insert into pg_temp.batch_equivalences values (
      v_equivalence.id, v_equivalence.food_catalog_item_id, v_equivalence.variant_key,
      v_equivalence.canonical_quantity, v_equivalence.canonical_unit, v_equivalence.updated_at
    );
  end loop;

  for v_line in
    select line.*, item.* from pg_temp.batch_lines line join pg_temp.batch_items item on item.id = line.item_id order by line.item_id
  loop
    if v_line.nutrition_basis not in ('per_100g', 'per_100ml', 'per_unit')
      or v_line.calories is null or v_line.protein_g is null or v_line.carbs_g is null or v_line.fat_g is null
      or v_line.calories < 0 or v_line.protein_g < 0 or v_line.carbs_g < 0 or v_line.fat_g < 0
      or v_line.calories in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.protein_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.carbs_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.fat_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
      raise exception using errcode = '22023', message = 'nutrition_unavailable';
    end if;

    v_eq_id := null; v_eq_updated_at := null; v_eq_quantity := null; v_eq_unit := null;
    if v_line.expected_equivalence_id is not null
      or not ((v_line.nutrition_basis = 'per_100g' and v_line.unit in ('g','kg'))
        or (v_line.nutrition_basis = 'per_100ml' and v_line.unit in ('ml','l'))
        or (v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ud')) then
      select count(*) into v_equivalence_count from pg_temp.batch_equivalences where food_catalog_item_id = v_line.food_catalog_item_id;
      if v_equivalence_count <> 1 then raise exception using errcode = '22023', message = 'incompatible_unit'; end if;
      select id, updated_at, canonical_quantity, canonical_unit into v_eq_id, v_eq_updated_at, v_eq_quantity, v_eq_unit
      from pg_temp.batch_equivalences where food_catalog_item_id = v_line.food_catalog_item_id;
      if v_line.expected_equivalence_id is not null and (v_eq_id <> v_line.expected_equivalence_id
        or v_eq_updated_at <> v_line.expected_equivalence_updated_at
        or v_eq_quantity <> v_line.expected_canonical_quantity or v_eq_unit <> v_line.expected_canonical_unit) then
        raise exception using errcode = '40001', message = 'equivalence_conflict';
      end if;
    end if;

    if v_line.nutrition_basis = 'per_100g' and v_line.unit = 'g' then v_factor := v_line.consumed_quantity / 100;
    elsif v_line.nutrition_basis = 'per_100g' and v_line.unit = 'kg' then v_factor := v_line.consumed_quantity * 10;
    elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'ml' then v_factor := v_line.consumed_quantity / 100;
    elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'l' then v_factor := v_line.consumed_quantity * 10;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ud' then v_factor := v_line.consumed_quantity;
    elsif v_line.nutrition_basis = 'per_100g' and v_line.unit = 'ud' and v_eq_unit = 'g' then v_factor := v_line.consumed_quantity * v_eq_quantity / 100;
    elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'ud' and v_eq_unit = 'ml' then v_factor := v_line.consumed_quantity * v_eq_quantity / 100;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'g' and v_eq_unit = 'g' then v_factor := v_line.consumed_quantity / v_eq_quantity;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'kg' and v_eq_unit = 'g' then v_factor := v_line.consumed_quantity * 1000 / v_eq_quantity;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ml' and v_eq_unit = 'ml' then v_factor := v_line.consumed_quantity / v_eq_quantity;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'l' and v_eq_unit = 'ml' then v_factor := v_line.consumed_quantity * 1000 / v_eq_quantity;
    else raise exception using errcode = '22023', message = 'incompatible_unit';
    end if;
    if v_factor is null or v_factor <= 0 then raise exception using errcode = '22023', message = 'incompatible_unit'; end if;
    v_total_calories := v_total_calories + v_line.calories * v_factor;
    v_total_protein := v_total_protein + v_line.protein_g * v_factor;
    v_total_carbs := v_total_carbs + v_line.carbs_g * v_factor;
    v_total_fat := v_total_fat + v_line.fat_g * v_factor;
  end loop;

  insert into public.user_saved_ai_recipe_cooked_batches (
    id, user_id, source_recipe_id, recipe_title, raw_weight_g, cooked_weight_g, servings,
    total_calories, total_protein_g, total_carbs_g, total_fat_g, consumed_cooked_weight_g,
    creation_fingerprint, source_measurement_updated_at
  ) values (
    p_request_id, v_user_id, p_recipe_id, v_recipe.title, v_measurement.raw_weight_g,
    v_measurement.cooked_weight_g, v_measurement.servings, v_total_calories, v_total_protein,
    v_total_carbs, v_total_fat, 0, v_fingerprint, v_measurement.updated_at
  );

  for v_line in select line.*, item.quantity as available from pg_temp.batch_lines line join pg_temp.batch_items item on item.id = line.item_id order by line.item_id loop
    v_remaining := v_line.available - v_line.consumed_quantity;
    if v_remaining = 0 then
      delete from public.inventory_items where id = v_line.item_id and user_id = v_user_id and quantity = v_line.available;
    else
      update public.inventory_items set quantity = v_remaining where id = v_line.item_id and user_id = v_user_id and quantity = v_line.available;
    end if;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception using errcode = '40001', message = 'inventory_conflict'; end if;
  end loop;
  return p_request_id;
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure('public.create_saved_ai_recipe_cooked_batch(uuid,uuid,timestamp with time zone,jsonb)');
  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted create_saved_ai_recipe_cooked_batch owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from public;
revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from anon;
grant execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) to authenticated;

