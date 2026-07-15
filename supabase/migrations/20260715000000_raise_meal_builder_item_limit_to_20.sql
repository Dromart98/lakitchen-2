create or replace function public.consume_meal_builder_items_and_log_meal(
  p_meal_name text,
  p_meal_type text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth
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
    consumed_quantity numeric not null
  ) on commit drop;

  create temporary table pg_temp.meal_builder_item_snapshots (
    source_inventory_item_id uuid primary key,
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
    insert into pg_temp.meal_builder_lines (item_id, consumed_quantity)
    select
      (line ->> 'item_id')::uuid,
      (line ->> 'consumed_quantity')::numeric
    from jsonb_array_elements(p_lines) as line
    where jsonb_typeof(line) = 'object'
      and line ? 'item_id'
      and line ? 'consumed_quantity'
      and (line ->> 'item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  exception
    when invalid_text_representation or numeric_value_out_of_range then
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

    if v_item.name is null
      or char_length(btrim(v_item.name)) = 0
      or char_length(btrim(v_item.name)) > 120
      or v_item.unit is null
      or v_item.unit not in ('g', 'kg', 'ml', 'l', 'ud')
      or v_item.nutrition_basis is null
      or v_item.nutrition_basis not in ('per_100g', 'per_100ml', 'per_unit')
      or v_item.calories is null
      or v_item.protein_g is null
      or v_item.carbs_g is null
      or v_item.fat_g is null
      or v_item.calories in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.protein_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.carbs_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.fat_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.calories < 0
      or v_item.protein_g < 0
      or v_item.carbs_g < 0
      or v_item.fat_g < 0 then
      raise exception using errcode = '22023', message = 'Incomplete inventory nutrition';
    end if;

    if v_item.nutrition_basis = 'per_100g' and v_item.unit = 'g' then
      v_factor := v_line.consumed_quantity / 100;
    elsif v_item.nutrition_basis = 'per_100g' and v_item.unit = 'kg' then
      v_factor := v_line.consumed_quantity * 10;
    elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'ml' then
      v_factor := v_line.consumed_quantity / 100;
    elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'l' then
      v_factor := v_line.consumed_quantity * 10;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ud' then
      v_factor := v_line.consumed_quantity;
    else
      raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
    end if;

    insert into pg_temp.meal_builder_item_snapshots (
      source_inventory_item_id,
      product_name,
      consumed_quantity,
      available_quantity,
      unit,
      nutrition_basis,
      calories,
      protein_g,
      carbs_g,
      fat_g
    ) values (
      v_item.id,
      btrim(v_item.name),
      v_line.consumed_quantity,
      v_item.quantity,
      v_item.unit,
      v_item.nutrition_basis,
      v_item.calories * v_factor,
      v_item.protein_g * v_factor,
      v_item.carbs_g * v_factor,
      v_item.fat_g * v_factor
    );

    v_total_calories := v_total_calories + (v_item.calories * v_factor);
    v_total_protein_g := v_total_protein_g + (v_item.protein_g * v_factor);
    v_total_carbs_g := v_total_carbs_g + (v_item.carbs_g * v_factor);
    v_total_fat_g := v_total_fat_g + (v_item.fat_g * v_factor);
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

revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated;
