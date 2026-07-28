alter table public.user_saved_daily_plans
  add constraint user_saved_daily_plans_user_plan_date_key
  unique (user_id, plan_date);

create or replace function public.save_scheduled_daily_plan(
  p_plan_date date,
  p_priority_mode text,
  p_max_minutes_per_meal integer,
  p_target jsonb,
  p_total jsonb,
  p_difference jsonb,
  p_fit text,
  p_meals jsonb,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_utc_date date := (now() at time zone 'UTC')::date;
  v_id uuid;
  v_index integer;
  v_meal jsonb;
  v_ingredient jsonb;
  v_nutrition jsonb;
  v_step jsonb;
  v_expected_meal_types constant text[] := array['breakfast', 'lunch', 'snack', 'dinner'];
  v_nutrition_keys constant text[] := array['calories', 'protein_g', 'carbs_g', 'fat_g'];
  v_meal_keys constant text[] := array[
    'meal_type', 'title', 'description', 'estimated_minutes',
    'ingredients', 'steps', 'nutrition'
  ];
  v_ingredient_keys constant text[] := array[
    'inventory_item_id', 'name', 'quantity', 'unit'
  ];
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_plan_date is null
    or p_plan_date < v_utc_date
    or p_plan_date > v_utc_date + 6
  then
    raise exception using errcode = '22023', message = 'invalid_plan_date';
  end if;

  if p_priority_mode is null
    or p_priority_mode not in ('balanced', 'expiration')
    or p_max_minutes_per_meal is null
    or p_max_minutes_per_meal not in (15, 30, 45, 60)
    or p_target is null
    or jsonb_typeof(p_target) <> 'object'
    or p_total is null
    or jsonb_typeof(p_total) <> 'object'
    or p_difference is null
    or jsonb_typeof(p_difference) <> 'object'
    or p_fit is null
    or p_fit not in ('close', 'acceptable', 'far')
    or p_meals is null
    or jsonb_typeof(p_meals) <> 'array'
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_plan_payload';
  end if;

  if jsonb_array_length(p_meals) <> 4 then
    raise exception using errcode = '22023', message = 'invalid_plan_payload';
  end if;

  foreach v_nutrition in array array[p_target, p_total, p_difference]
  loop
    if not (v_nutrition ?& v_nutrition_keys)
      or (v_nutrition - v_nutrition_keys) <> '{}'::jsonb
      or jsonb_typeof(v_nutrition -> 'calories') <> 'number'
      or jsonb_typeof(v_nutrition -> 'protein_g') <> 'number'
      or jsonb_typeof(v_nutrition -> 'carbs_g') <> 'number'
      or jsonb_typeof(v_nutrition -> 'fat_g') <> 'number'
    then
      raise exception using errcode = '22023', message = 'invalid_plan_payload';
    end if;
  end loop;

  for v_meal, v_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_meals) with ordinality
  loop
    if jsonb_typeof(v_meal) <> 'object'
      or not (v_meal ?& v_meal_keys)
      or (v_meal - v_meal_keys) <> '{}'::jsonb
      or jsonb_typeof(v_meal -> 'meal_type') <> 'string'
      or v_meal ->> 'meal_type' <> v_expected_meal_types[v_index]
      or jsonb_typeof(v_meal -> 'title') <> 'string'
      or jsonb_typeof(v_meal -> 'description') <> 'string'
      or jsonb_typeof(v_meal -> 'estimated_minutes') <> 'number'
      or jsonb_typeof(v_meal -> 'ingredients') <> 'array'
      or jsonb_typeof(v_meal -> 'steps') <> 'array'
      or jsonb_typeof(v_meal -> 'nutrition') <> 'object'
    then
      raise exception using errcode = '22023', message = 'invalid_plan_payload';
    end if;

    if char_length(btrim(v_meal ->> 'title')) not between 1 and 90
      or char_length(btrim(v_meal ->> 'description')) not between 1 and 280
      or (v_meal ->> 'estimated_minutes')::numeric <> trunc((v_meal ->> 'estimated_minutes')::numeric)
      or (v_meal ->> 'estimated_minutes')::numeric not between 1 and 60
      or jsonb_array_length(v_meal -> 'ingredients') not between 1 and 20
      or jsonb_array_length(v_meal -> 'steps') not between 2 and 12
    then
      raise exception using errcode = '22023', message = 'invalid_plan_payload';
    end if;

    v_nutrition := v_meal -> 'nutrition';
    if not (v_nutrition ?& v_nutrition_keys)
      or (v_nutrition - v_nutrition_keys) <> '{}'::jsonb
      or jsonb_typeof(v_nutrition -> 'calories') <> 'number'
      or jsonb_typeof(v_nutrition -> 'protein_g') <> 'number'
      or jsonb_typeof(v_nutrition -> 'carbs_g') <> 'number'
      or jsonb_typeof(v_nutrition -> 'fat_g') <> 'number'
    then
      raise exception using errcode = '22023', message = 'invalid_plan_payload';
    end if;

    for v_ingredient in
      select value from jsonb_array_elements(v_meal -> 'ingredients')
    loop
      if jsonb_typeof(v_ingredient) <> 'object'
        or not (v_ingredient ?& v_ingredient_keys)
        or (v_ingredient - v_ingredient_keys) <> '{}'::jsonb
        or jsonb_typeof(v_ingredient -> 'inventory_item_id') <> 'string'
        or v_ingredient ->> 'inventory_item_id'
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(v_ingredient -> 'name') <> 'string'
        or jsonb_typeof(v_ingredient -> 'quantity') <> 'number'
        or jsonb_typeof(v_ingredient -> 'unit') <> 'string'
      then
        raise exception using errcode = '22023', message = 'invalid_plan_payload';
      end if;

      if char_length(btrim(v_ingredient ->> 'name')) not between 1 and 120
        or (v_ingredient ->> 'quantity')::numeric <= 0
        or v_ingredient ->> 'unit' not in ('g', 'kg', 'ml', 'l', 'ud')
      then
        raise exception using errcode = '22023', message = 'invalid_plan_payload';
      end if;
    end loop;

    for v_step in
      select value from jsonb_array_elements(v_meal -> 'steps')
    loop
      if jsonb_typeof(v_step) <> 'string'
        or char_length(btrim(v_step #>> '{}')) not between 8 and 280
      then
        raise exception using errcode = '22023', message = 'invalid_plan_payload';
      end if;
    end loop;
  end loop;

  insert into public.user_saved_daily_plans (
    user_id,
    plan_date,
    priority_mode,
    max_minutes_per_meal,
    target,
    total,
    difference,
    fit,
    meals,
    fingerprint
  )
  values (
    v_user_id,
    p_plan_date,
    p_priority_mode,
    p_max_minutes_per_meal,
    p_target,
    p_total,
    p_difference,
    p_fit,
    p_meals,
    p_fingerprint
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    if exists (
      select 1
      from public.user_saved_daily_plans
      where user_id = v_user_id
        and plan_date = p_plan_date
    ) then
      raise exception using errcode = '23505', message = 'date_occupied';
    end if;
    raise;
end;
$$;

-- SECURITY DEFINER is required because authenticated cannot insert directly;
-- keeping that grant revoked prevents callers from bypassing RPC validation.
revoke all on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) from public;
revoke all on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) from anon;
grant execute on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) to authenticated;

revoke insert on table public.user_saved_daily_plans from authenticated;
