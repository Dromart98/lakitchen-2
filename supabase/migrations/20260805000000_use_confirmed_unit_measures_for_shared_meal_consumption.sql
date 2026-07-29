create or replace function public.consume_meal_builder_items_and_log_meal(
  p_meal_name text,
  p_meal_type text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_log_id uuid;
  v_line_count integer;
  v_item public.inventory_items%rowtype;
  v_line record;
  v_factor numeric;
  v_remaining_quantity numeric;
  v_row_count integer;
  v_total_calories numeric := 0;
  v_total_protein_g numeric := 0;
  v_total_carbs_g numeric := 0;
  v_total_fat_g numeric := 0;
  v_equivalence public.food_quantity_equivalences%rowtype;
  v_equivalence_count integer;
  v_needs_equivalence boolean;
  v_equivalence_id uuid;
  v_equivalence_updated_at timestamptz;
  v_equivalence_quantity numeric;
  v_equivalence_unit text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_meal_name is null
    or char_length(btrim(p_meal_name)) = 0
    or char_length(btrim(p_meal_name)) > 120 then
    raise exception using errcode = '22023', message = 'Invalid meal name';
  end if;

  if p_meal_type is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other') then
    raise exception using errcode = '22023', message = 'Invalid meal type';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid meal lines';
  end if;

  select jsonb_array_length(p_lines) into v_line_count;

  if v_line_count < 1 or v_line_count > 20 then
    raise exception using errcode = '22023', message = 'Invalid meal line count';
  end if;

  create temporary table pg_temp.meal_builder_lines (
    item_id uuid primary key,
    consumed_quantity numeric not null,
    expected_equivalence_id uuid,
    expected_equivalence_updated_at timestamptz,
    expected_canonical_quantity numeric,
    expected_canonical_unit text
  ) on commit drop;

  create temporary table pg_temp.meal_builder_locked_items (
    id uuid primary key,
    food_catalog_item_id uuid,
    name text,
    quantity numeric,
    unit text,
    nutrition_basis text,
    calories numeric,
    protein_g numeric,
    carbs_g numeric,
    fat_g numeric
  ) on commit drop;

  create temporary table pg_temp.meal_builder_locked_equivalences (
    id uuid primary key,
    food_catalog_item_id uuid not null,
    variant_key text not null,
    canonical_quantity numeric,
    canonical_unit text,
    updated_at timestamptz
  ) on commit drop;

  create temporary table pg_temp.meal_builder_item_snapshots (
    source_inventory_item_id uuid primary key,
    food_catalog_item_id uuid,
    product_name text not null,
    consumed_quantity numeric not null,
    available_quantity numeric not null,
    unit text not null,
    nutrition_basis text not null,
    calories numeric not null,
    protein_g numeric not null,
    carbs_g numeric not null,
    fat_g numeric not null
  ) on commit drop;

  begin
    insert into pg_temp.meal_builder_lines (
      item_id, consumed_quantity, expected_equivalence_id,
      expected_equivalence_updated_at, expected_canonical_quantity, expected_canonical_unit
    )
    select
      (line ->> 'item_id')::uuid,
      (line ->> 'consumed_quantity')::numeric,
      case when line ? 'expected_equivalence_id' then (line ->> 'expected_equivalence_id')::uuid end,
      case when line ? 'expected_equivalence_updated_at' then (line ->> 'expected_equivalence_updated_at')::timestamptz end,
      case when line ? 'expected_canonical_quantity' then (line ->> 'expected_canonical_quantity')::numeric end,
      case when line ? 'expected_canonical_unit' then line ->> 'expected_canonical_unit' end
    from jsonb_array_elements(p_lines) as line
    where jsonb_typeof(line) = 'object'
      and line ? 'item_id'
      and line ? 'consumed_quantity'
      and (line ->> 'item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (
        (not line ? 'expected_equivalence_id'
          and not line ? 'expected_equivalence_updated_at'
          and not line ? 'expected_canonical_quantity'
          and not line ? 'expected_canonical_unit')
        or
        (line ? 'expected_equivalence_id'
          and line ? 'expected_equivalence_updated_at'
          and line ? 'expected_canonical_quantity'
          and line ? 'expected_canonical_unit'
          and (line ->> 'expected_equivalence_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and (line ->> 'expected_equivalence_updated_at') is not null
          and (line ->> 'expected_canonical_unit') in ('g', 'ml'))
      );
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'Invalid meal line values';
    when unique_violation then
      raise exception using errcode = '23505', message = 'Duplicate meal line item';
  end;

  get diagnostics v_row_count = row_count;
  if v_row_count <> v_line_count then
    raise exception using errcode = '22023', message = 'Invalid meal line payload';
  end if;

  if exists (
    select 1
    from pg_temp.meal_builder_lines
    where consumed_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or consumed_quantity <= 0
  ) then
    raise exception using errcode = '22023', message = 'Invalid consumed quantity';
  end if;

  if exists (
    select 1
    from pg_temp.meal_builder_lines
    where expected_equivalence_id is not null
      and (expected_canonical_quantity is null
        or expected_canonical_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        or expected_canonical_quantity <= 0
        or expected_canonical_unit not in ('g', 'ml'))
  ) then
    raise exception using errcode = '22023', message = 'Invalid meal line values';
  end if;

  -- Lock every owned inventory row globally before locking any equivalence.
  for v_line in
    select item_id, consumed_quantity
    from pg_temp.meal_builder_lines
    order by item_id
  loop
    select *
      into v_item
    from public.inventory_items
    where id = v_line.item_id
      and user_id = v_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Inventory item not found';
    end if;

    if v_item.quantity is null
      or v_item.quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.quantity <= 0 then
      raise exception using errcode = '22023', message = 'Invalid inventory stock';
    end if;

    if v_line.consumed_quantity > v_item.quantity then
      raise exception using errcode = '22003', message = 'Quantity exceeds available stock';
    end if;

    insert into pg_temp.meal_builder_locked_items (
      id, food_catalog_item_id, name, quantity, unit, nutrition_basis,
      calories, protein_g, carbs_g, fat_g
    ) values (
      v_item.id, v_item.food_catalog_item_id, v_item.name, v_item.quantity,
      v_item.unit, v_item.nutrition_basis, v_item.calories,
      v_item.protein_g, v_item.carbs_g, v_item.fat_g
    );
  end loop;

  -- One globally ordered lock query covers every identity that can need a unit measure.
  for v_equivalence in
    select equivalence.*
    from public.food_quantity_equivalences equivalence
    where equivalence.user_id = v_user_id
      and equivalence.measure_kind = 'unit'
      and equivalence.user_confirmed = true
      and equivalence.source = 'user'
      and equivalence.food_catalog_item_id in (
        select distinct item.food_catalog_item_id
        from pg_temp.meal_builder_locked_items item
        join pg_temp.meal_builder_lines line on line.item_id = item.id
        where item.food_catalog_item_id is not null
          and (line.expected_equivalence_id is not null
            or not ((item.nutrition_basis = 'per_100g' and item.unit in ('g', 'kg'))
              or (item.nutrition_basis = 'per_100ml' and item.unit in ('ml', 'l'))
              or (item.nutrition_basis = 'per_unit' and item.unit = 'ud')))
      )
    order by equivalence.food_catalog_item_id, equivalence.variant_key, equivalence.id
    for update
  loop
    insert into pg_temp.meal_builder_locked_equivalences (
      id, food_catalog_item_id, variant_key, canonical_quantity, canonical_unit, updated_at
    ) values (
      v_equivalence.id, v_equivalence.food_catalog_item_id, v_equivalence.variant_key,
      v_equivalence.canonical_quantity, v_equivalence.canonical_unit, v_equivalence.updated_at
    );
  end loop;

  -- Only after all global locks are held may nutrition factors and snapshots be calculated.
  for v_line in
    select line.*, item.*
    from pg_temp.meal_builder_lines line
    join pg_temp.meal_builder_locked_items item on item.id = line.item_id
    order by line.item_id
  loop
    if v_line.name is null
      or char_length(btrim(v_line.name)) = 0
      or char_length(btrim(v_line.name)) > 120
      or v_line.unit is null
      or v_line.unit not in ('g', 'kg', 'ml', 'l', 'ud')
      or v_line.nutrition_basis is null
      or v_line.nutrition_basis not in ('per_100g', 'per_100ml', 'per_unit')
      or v_line.calories is null
      or v_line.protein_g is null
      or v_line.carbs_g is null
      or v_line.fat_g is null
      or v_line.calories in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.protein_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.carbs_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.fat_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_line.calories < 0 or v_line.protein_g < 0
      or v_line.carbs_g < 0 or v_line.fat_g < 0 then
      raise exception using errcode = '22023', message = 'Incomplete inventory nutrition';
    end if;

    v_needs_equivalence := not (
      (v_line.nutrition_basis = 'per_100g' and v_line.unit in ('g', 'kg'))
      or (v_line.nutrition_basis = 'per_100ml' and v_line.unit in ('ml', 'l'))
      or (v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ud')
    );

    if v_line.expected_equivalence_id is not null or v_needs_equivalence then
      select count(*) into v_equivalence_count
      from pg_temp.meal_builder_locked_equivalences
      where food_catalog_item_id = v_line.food_catalog_item_id;

      if v_equivalence_count <> 1 then
        raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
      end if;

      select id, updated_at, canonical_quantity, canonical_unit
        into v_equivalence_id, v_equivalence_updated_at, v_equivalence_quantity, v_equivalence_unit
      from pg_temp.meal_builder_locked_equivalences
      where food_catalog_item_id = v_line.food_catalog_item_id;

      if v_line.expected_equivalence_id is not null and (
        v_equivalence_id <> v_line.expected_equivalence_id
        or v_equivalence_updated_at <> v_line.expected_equivalence_updated_at
        or v_equivalence_quantity <> v_line.expected_canonical_quantity
        or v_equivalence_unit <> v_line.expected_canonical_unit
      ) then
        raise exception using errcode = '40001', message = 'equivalence_conflict';
      end if;
    end if;

    if v_line.nutrition_basis = 'per_100g' and v_line.unit = 'g' then
      v_factor := v_line.consumed_quantity / 100;
    elsif v_line.nutrition_basis = 'per_100g' and v_line.unit = 'kg' then
      v_factor := v_line.consumed_quantity * 10;
    elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'ml' then
      v_factor := v_line.consumed_quantity / 100;
    elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'l' then
      v_factor := v_line.consumed_quantity * 10;
    elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ud' then
      v_factor := v_line.consumed_quantity;
    else
      if v_equivalence_quantity is null
        or v_equivalence_quantity <= 0
        or v_equivalence_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        or v_equivalence_unit is null
        or v_equivalence_unit not in ('g', 'ml') then
        raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
      end if;

      if v_line.nutrition_basis = 'per_100g' and v_line.unit = 'ud' and v_equivalence_unit = 'g' then
        v_factor := v_line.consumed_quantity * v_equivalence_quantity / 100;
      elsif v_line.nutrition_basis = 'per_100ml' and v_line.unit = 'ud' and v_equivalence_unit = 'ml' then
        v_factor := v_line.consumed_quantity * v_equivalence_quantity / 100;
      elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'g' and v_equivalence_unit = 'g' then
        v_factor := v_line.consumed_quantity / v_equivalence_quantity;
      elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'kg' and v_equivalence_unit = 'g' then
        v_factor := v_line.consumed_quantity * 1000 / v_equivalence_quantity;
      elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'ml' and v_equivalence_unit = 'ml' then
        v_factor := v_line.consumed_quantity / v_equivalence_quantity;
      elsif v_line.nutrition_basis = 'per_unit' and v_line.unit = 'l' and v_equivalence_unit = 'ml' then
        v_factor := v_line.consumed_quantity * 1000 / v_equivalence_quantity;
      else
        raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
      end if;
    end if;

    insert into pg_temp.meal_builder_item_snapshots (
      source_inventory_item_id, food_catalog_item_id, product_name,
      consumed_quantity, available_quantity, unit, nutrition_basis,
      calories, protein_g, carbs_g, fat_g
    ) values (
      v_line.item_id, v_line.food_catalog_item_id, btrim(v_line.name),
      v_line.consumed_quantity, v_line.quantity, v_line.unit, v_line.nutrition_basis,
      v_line.calories * v_factor, v_line.protein_g * v_factor,
      v_line.carbs_g * v_factor, v_line.fat_g * v_factor
    );

    v_total_calories := v_total_calories + (v_line.calories * v_factor);
    v_total_protein_g := v_total_protein_g + (v_line.protein_g * v_factor);
    v_total_carbs_g := v_total_carbs_g + (v_line.carbs_g * v_factor);
    v_total_fat_g := v_total_fat_g + (v_line.fat_g * v_factor);
  end loop;

  insert into public.daily_meal_logs (
    user_id,
    name,
    meal_type,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    consumed_on
  ) values (
    v_user_id,
    btrim(p_meal_name),
    p_meal_type,
    round(v_total_calories)::integer,
    round(v_total_protein_g)::integer,
    round(v_total_carbs_g)::integer,
    round(v_total_fat_g)::integer,
    (now() at time zone 'utc')::date
  ) returning id into v_meal_log_id;

  insert into public.daily_meal_log_items (
    meal_log_id,
    user_id,
    source_inventory_item_id,
    food_catalog_item_id,
    product_name,
    consumed_quantity,
    unit,
    nutrition_basis,
    calories,
    protein_g,
    carbs_g,
    fat_g
  )
  select
    v_meal_log_id,
    v_user_id,
    source_inventory_item_id,
    food_catalog_item_id,
    product_name,
    consumed_quantity,
    unit,
    nutrition_basis,
    calories,
    protein_g,
    carbs_g,
    fat_g
  from pg_temp.meal_builder_item_snapshots
  order by product_name asc, source_inventory_item_id asc;

  get diagnostics v_row_count = row_count;
  if v_row_count <> v_line_count then
    raise exception using errcode = 'P0001', message = 'Meal item snapshot insert failed';
  end if;

  for v_line in
    select
      source_inventory_item_id as item_id,
      consumed_quantity,
      available_quantity
    from pg_temp.meal_builder_item_snapshots
    order by source_inventory_item_id
  loop
    v_remaining_quantity := v_line.available_quantity - v_line.consumed_quantity;

    if v_remaining_quantity < 0 then
      raise exception using errcode = '22003', message = 'Quantity exceeds available stock';
    end if;

    if v_remaining_quantity = 0 then
      delete from public.inventory_items
      where id = v_line.item_id
        and user_id = v_user_id
        and quantity = v_line.available_quantity;
    else
      update public.inventory_items
      set quantity = v_remaining_quantity
      where id = v_line.item_id
        and user_id = v_user_id
        and quantity = v_line.available_quantity;
    end if;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using errcode = 'P0001', message = 'Inventory mutation failed';
    end if;
  end loop;

  return v_meal_log_id;
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.consume_meal_builder_items_and_log_meal(text,text,jsonb)');
  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted consume_meal_builder_items_and_log_meal owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated;
