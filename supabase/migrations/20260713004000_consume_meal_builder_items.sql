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
  v_meal_name text := btrim(coalesce(p_meal_name, ''));
  v_line_count integer;
  v_line jsonb;
  v_item_id_text text;
  v_consumed_quantity_text text;
  v_item_ids uuid[] := '{}';
  v_quantities numeric[] := '{}';
  v_sorted_item_ids uuid[];
  v_sorted_quantities numeric[];
  v_index integer;
  v_item public.inventory_items%rowtype;
  v_factor numeric;
  v_total_calories numeric := 0;
  v_total_protein_g numeric := 0;
  v_total_carbs_g numeric := 0;
  v_total_fat_g numeric := 0;
  v_meal_log_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if v_meal_name = '' or char_length(v_meal_name) > 120 then
    raise exception using errcode = '22023', message = 'Invalid meal name';
  end if;

  if p_meal_type is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other') then
    raise exception using errcode = '22023', message = 'Invalid meal type';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid meal builder lines';
  end if;

  v_line_count := jsonb_array_length(p_lines);

  if v_line_count < 1 or v_line_count > 10 then
    raise exception using errcode = '22023', message = 'Invalid meal builder line count';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) as lines(value) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception using errcode = '22023', message = 'Invalid meal builder line';
    end if;

    if not (v_line ? 'item_id') or not (v_line ? 'consumed_quantity') then
      raise exception using errcode = '22023', message = 'Invalid meal builder line';
    end if;

    v_item_id_text := v_line ->> 'item_id';
    v_consumed_quantity_text := v_line ->> 'consumed_quantity';

    if v_item_id_text is null
      or v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Invalid meal builder item id';
    end if;

    if v_consumed_quantity_text is null
      or v_consumed_quantity_text !~ '^\d+(?:\.\d+)?$' then
      raise exception using errcode = '22023', message = 'Invalid consumed quantity';
    end if;

    if v_consumed_quantity_text::numeric in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_consumed_quantity_text::numeric <= 0 then
      raise exception using errcode = '22023', message = 'Invalid consumed quantity';
    end if;

    v_item_ids := array_append(v_item_ids, v_item_id_text::uuid);
    v_quantities := array_append(v_quantities, v_consumed_quantity_text::numeric);
  end loop;

  if (select count(distinct item_id) from unnest(v_item_ids) as parsed(item_id)) <> v_line_count then
    raise exception using errcode = '23505', message = 'Duplicate meal builder item';
  end if;

  select array_agg(item_id order by item_id), array_agg(consumed_quantity order by item_id)
    into v_sorted_item_ids, v_sorted_quantities
  from unnest(v_item_ids, v_quantities) as parsed(item_id, consumed_quantity);

  for v_index in 1..v_line_count loop
    select *
      into v_item
    from public.inventory_items
    where id = v_sorted_item_ids[v_index]
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

    if v_sorted_quantities[v_index] > v_item.quantity then
      raise exception using errcode = '22003', message = 'Quantity exceeds available stock';
    end if;

    if v_item.calories is null
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
      v_factor := v_sorted_quantities[v_index] / 100;
    elsif v_item.nutrition_basis = 'per_100g' and v_item.unit = 'kg' then
      v_factor := v_sorted_quantities[v_index] * 10;
    elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'ml' then
      v_factor := v_sorted_quantities[v_index] / 100;
    elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'l' then
      v_factor := v_sorted_quantities[v_index] * 10;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ud' then
      v_factor := v_sorted_quantities[v_index];
    else
      raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
    end if;

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
    v_meal_name,
    p_meal_type,
    round(v_total_calories)::integer,
    round(v_total_protein_g)::integer,
    round(v_total_carbs_g)::integer,
    round(v_total_fat_g)::integer,
    (now() at time zone 'utc')::date
  ) returning id into v_meal_log_id;

  for v_index in 1..v_line_count loop
    if v_sorted_quantities[v_index] < (
      select quantity from public.inventory_items where id = v_sorted_item_ids[v_index] and user_id = v_user_id
    ) then
      update public.inventory_items
      set quantity = quantity - v_sorted_quantities[v_index]
      where id = v_sorted_item_ids[v_index]
        and user_id = v_user_id
        and quantity >= v_sorted_quantities[v_index];
    else
      delete from public.inventory_items
      where id = v_sorted_item_ids[v_index]
        and user_id = v_user_id
        and quantity = v_sorted_quantities[v_index];
    end if;
  end loop;

  return v_meal_log_id;
end;
$$;

revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated;
