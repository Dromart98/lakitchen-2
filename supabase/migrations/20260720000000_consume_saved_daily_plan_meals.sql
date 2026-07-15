alter table public.user_saved_daily_plans
  add column completed_meals jsonb not null default '{}'::jsonb
  check (jsonb_typeof(completed_meals) = 'object');

create or replace function public.consume_saved_daily_plan_meal(
  p_plan_id uuid,
  p_meal_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meals jsonb;
  v_completed_meals jsonb;
  v_meal jsonb;
  v_match_count integer;
  v_ingredient jsonb;
  v_item_id_text text;
  v_saved_unit text;
  v_current_unit text;
  v_expires_at date;
  v_lines jsonb;
  v_meal_log_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_plan_id is null then
    raise exception using errcode = '22023', message = 'Invalid saved plan id';
  end if;

  if p_meal_type is null or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner') then
    raise exception using errcode = '22023', message = 'Invalid saved plan meal type';
  end if;

  select meals, completed_meals
    into v_meals, v_completed_meals
  from public.user_saved_daily_plans
  where id = p_plan_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Saved daily plan not found';
  end if;

  if v_completed_meals ? p_meal_type then
    raise exception using errcode = '23505', message = 'Saved plan meal already completed';
  end if;

  select count(*), min(value)
    into v_match_count, v_meal
  from jsonb_array_elements(v_meals) as entries(value)
  where value ->> 'meal_type' = p_meal_type;

  if v_match_count <> 1 or v_meal is null or jsonb_typeof(v_meal) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid saved plan meal snapshot';
  end if;

  if v_meal ->> 'title' is null
    or char_length(btrim(v_meal ->> 'title')) = 0
    or char_length(btrim(v_meal ->> 'title')) > 120
    or jsonb_typeof(v_meal -> 'ingredients') <> 'array'
    or jsonb_array_length(v_meal -> 'ingredients') < 1
    or jsonb_array_length(v_meal -> 'ingredients') > 20 then
    raise exception using errcode = '22023', message = 'Invalid saved plan meal snapshot';
  end if;

  for v_ingredient in
    select value
    from jsonb_array_elements(v_meal -> 'ingredients') as ingredients(value)
  loop
    if jsonb_typeof(v_ingredient) <> 'object'
      or not (v_ingredient ? 'inventory_item_id')
      or not (v_ingredient ? 'quantity')
      or not (v_ingredient ? 'unit') then
      raise exception using errcode = '22023', message = 'Invalid saved plan ingredient';
    end if;

    v_item_id_text := v_ingredient ->> 'inventory_item_id';
    v_saved_unit := v_ingredient ->> 'unit';

    if v_item_id_text is null
      or v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or v_saved_unit is null
      or v_saved_unit not in ('g', 'kg', 'ml', 'l', 'ud') then
      raise exception using errcode = '22023', message = 'Invalid saved plan ingredient';
    end if;

    select unit, expires_at
      into v_current_unit, v_expires_at
    from public.inventory_items
    where id = v_item_id_text::uuid
      and user_id = v_user_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Inventory item not found';
    end if;

    if v_current_unit <> v_saved_unit then
      raise exception using errcode = '22023', message = 'Inventory unit changed';
    end if;

    if v_expires_at is not null and v_expires_at < (now() at time zone 'utc')::date then
      raise exception using errcode = '22023', message = 'Inventory item expired';
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'item_id', ingredient ->> 'inventory_item_id',
      'consumed_quantity', ingredient -> 'quantity'
    )
    order by ingredient ->> 'inventory_item_id'
  )
    into v_lines
  from jsonb_array_elements(v_meal -> 'ingredients') as ingredients(ingredient);

  v_meal_log_id := public.consume_meal_builder_items_and_log_meal(
    btrim(v_meal ->> 'title'),
    p_meal_type,
    v_lines
  );

  update public.user_saved_daily_plans
  set completed_meals = completed_meals || jsonb_build_object(
    p_meal_type,
    jsonb_build_object(
      'meal_log_id', v_meal_log_id,
      'completed_at', now()
    )
  )
  where id = p_plan_id
    and user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Saved plan completion update failed';
  end if;

  return v_meal_log_id;
end;
$$;

revoke execute on function public.consume_saved_daily_plan_meal(uuid, text) from public;
revoke execute on function public.consume_saved_daily_plan_meal(uuid, text) from anon;
grant execute on function public.consume_saved_daily_plan_meal(uuid, text) to authenticated;
