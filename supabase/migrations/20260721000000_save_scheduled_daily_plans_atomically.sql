-- Atomic scheduled-plan saving and future-cooking guard.
create or replace function public.save_scheduled_daily_plan(
  p_plan_date date, p_priority_mode text, p_max_minutes_per_meal integer,
  p_target jsonb, p_total jsonb, p_difference jsonb, p_fit text, p_meals jsonb, p_fingerprint text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_plan_date is null or p_plan_date < current_date or p_plan_date > current_date + 6 then raise exception using errcode = '22023', message = 'invalid_plan_date'; end if;
  if p_priority_mode not in ('balanced', 'expiration') or p_max_minutes_per_meal not in (15,30,45,60) or p_fit not in ('close','acceptable','far') or jsonb_typeof(p_target) <> 'object' or jsonb_typeof(p_total) <> 'object' or jsonb_typeof(p_difference) <> 'object' or jsonb_typeof(p_meals) <> 'array' or jsonb_array_length(p_meals) <> 4 or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'invalid_plan_payload'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_plan_date::text, 0));
  if exists (select 1 from public.user_saved_daily_plans where user_id = v_user_id and plan_date = p_plan_date) then
    raise exception using errcode = 'P0001', message = 'date_occupied';
  end if;
  insert into public.user_saved_daily_plans (user_id, plan_date, priority_mode, max_minutes_per_meal, target, total, difference, fit, meals, fingerprint)
  values (v_user_id, p_plan_date, p_priority_mode, p_max_minutes_per_meal, p_target, p_total, p_difference, p_fit, p_meals, p_fingerprint) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.save_scheduled_daily_plan(date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text) from public, anon;
grant execute on function public.save_scheduled_daily_plan(date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text) to authenticated;
revoke insert on public.user_saved_daily_plans from authenticated;


create or replace function public.consume_saved_daily_plan_meal(
  p_plan_id uuid,
  p_meal_type text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meals jsonb;
  v_completed_meals jsonb;
  v_plan_date date;
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

  select meals, completed_meals, plan_date
    into v_meals, v_completed_meals, v_plan_date
  from public.user_saved_daily_plans
  where id = p_plan_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Saved daily plan not found';
  end if;
  if v_plan_date > current_date then
    raise exception using errcode = 'P0001', message = 'not_yet_available';
  end if;


  if v_completed_meals ? p_meal_type then
    raise exception using errcode = '23505', message = 'Saved plan meal already completed';
  end if;

  select count(*), jsonb_agg(value) -> 0
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
