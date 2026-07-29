create or replace function public.consume_inventory_item_and_log_meal(
  p_item_id uuid,
  p_consumed_quantity numeric,
  p_meal_type text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_factor numeric;
  v_remaining_quantity numeric;
  v_meal_log_id uuid;
  v_equivalence public.food_quantity_equivalences%rowtype;
  v_equivalence_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_consumed_quantity is null
    or p_consumed_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_consumed_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Invalid consumed quantity';
  end if;

  if p_meal_type is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other') then
    raise exception using errcode = '22023', message = 'Invalid meal type';
  end if;

  select *
    into v_item
  from public.inventory_items
  where id = p_item_id
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

  if p_consumed_quantity > v_item.quantity then
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
    v_factor := p_consumed_quantity / 100;
  elsif v_item.nutrition_basis = 'per_100g' and v_item.unit = 'kg' then
    v_factor := p_consumed_quantity * 10;
  elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ud' then
    v_factor := p_consumed_quantity;
  elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'ml' then
    v_factor := p_consumed_quantity / 100;
  elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'l' then
    v_factor := p_consumed_quantity * 10;
  else
    -- Lock every confirmed unit candidate in a stable order so a concurrent edit or
    -- deletion cannot change the measurement used by this transaction.
    for v_equivalence in
      select *
      from public.food_quantity_equivalences
      where user_id = v_user_id
        and food_catalog_item_id = v_item.food_catalog_item_id
        and measure_kind = 'unit'
        and user_confirmed = true
        and source = 'user'
      order by variant_key, id
      for update
    loop
      v_equivalence_count := v_equivalence_count + 1;
    end loop;

    if v_equivalence_count <> 1 then
      raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
    end if;

    if v_equivalence.canonical_quantity is null
      or v_equivalence.canonical_quantity <= 0
      or v_equivalence.canonical_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_equivalence.canonical_unit is null
      or v_equivalence.canonical_unit not in ('g', 'ml') then
      raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
    end if;

    if v_item.nutrition_basis = 'per_100g' and v_item.unit = 'ud'
      and v_equivalence.canonical_unit = 'g' then
      v_factor := p_consumed_quantity * v_equivalence.canonical_quantity / 100;
    elsif v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'ud'
      and v_equivalence.canonical_unit = 'ml' then
      v_factor := p_consumed_quantity * v_equivalence.canonical_quantity / 100;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'g'
      and v_equivalence.canonical_unit = 'g' then
      v_factor := p_consumed_quantity / v_equivalence.canonical_quantity;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'kg'
      and v_equivalence.canonical_unit = 'g' then
      v_factor := p_consumed_quantity * 1000 / v_equivalence.canonical_quantity;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ml'
      and v_equivalence.canonical_unit = 'ml' then
      v_factor := p_consumed_quantity / v_equivalence.canonical_quantity;
    elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'l'
      and v_equivalence.canonical_unit = 'ml' then
      v_factor := p_consumed_quantity * 1000 / v_equivalence.canonical_quantity;
    else
      raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
    end if;
  end if;

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
    v_item.name,
    p_meal_type,
    round(v_item.calories * v_factor)::integer,
    round(v_item.protein_g * v_factor)::integer,
    round(v_item.carbs_g * v_factor)::integer,
    round(v_item.fat_g * v_factor)::integer,
    (now() at time zone 'utc')::date
  ) returning id into v_meal_log_id;

  insert into public.daily_meal_log_items (
    meal_log_id, user_id, source_inventory_item_id, food_catalog_item_id,
    product_name, consumed_quantity, unit, nutrition_basis,
    calories, protein_g, carbs_g, fat_g
  ) values (
    v_meal_log_id, v_user_id, v_item.id, v_item.food_catalog_item_id,
    btrim(v_item.name), p_consumed_quantity, v_item.unit, v_item.nutrition_basis,
    v_item.calories * v_factor, v_item.protein_g * v_factor,
    v_item.carbs_g * v_factor, v_item.fat_g * v_factor
  );

  v_remaining_quantity := v_item.quantity - p_consumed_quantity;

  if v_remaining_quantity = 0 then
    delete from public.inventory_items
    where id = p_item_id
      and user_id = v_user_id;
  else
    update public.inventory_items
    set quantity = v_remaining_quantity
    where id = p_item_id
      and user_id = v_user_id;
  end if;

  return v_remaining_quantity;
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(p.proowner)
    into v_owner
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.consume_inventory_item_and_log_meal(uuid,numeric,text)'
  );

  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted consume_inventory_item_and_log_meal owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from public;
revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from anon;
grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) to authenticated;
