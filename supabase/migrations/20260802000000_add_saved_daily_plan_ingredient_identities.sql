-- Phase 1.3C1: owner-scoped food identity snapshots for private saved plans.
alter table public.user_saved_daily_plans
  add constraint user_saved_daily_plans_id_user_unique unique (id, user_id);

create table public.user_saved_daily_plan_ingredient_identities (
  plan_id uuid not null,
  user_id uuid not null,
  meal_type text not null,
  ingredient_index smallint not null,
  source_inventory_item_id uuid not null,
  food_catalog_item_id uuid null,
  created_at timestamptz not null default now(),
  constraint user_saved_daily_plan_ingredient_identities_pkey
    primary key (plan_id, meal_type, ingredient_index),
  constraint saved_plan_ingredient_identities_meal_type_check
    check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  constraint saved_plan_ingredient_identities_index_check
    check (ingredient_index between 1 and 20),
  constraint saved_plan_ingredient_identities_plan_owner_fk
    foreign key (plan_id, user_id)
    references public.user_saved_daily_plans (id, user_id)
    on delete cascade,
  constraint saved_plan_ingredient_identities_food_owner_fk
    foreign key (food_catalog_item_id, user_id)
    references public.food_catalog_items (id, user_id)
    on delete set null (food_catalog_item_id)
);

create index saved_plan_ingredient_identities_plan_owner_idx
  on public.user_saved_daily_plan_ingredient_identities (plan_id, user_id);
create index saved_plan_ingredient_identities_food_owner_idx
  on public.user_saved_daily_plan_ingredient_identities (food_catalog_item_id, user_id);

alter table public.user_saved_daily_plan_ingredient_identities enable row level security;
revoke all on table public.user_saved_daily_plan_ingredient_identities
  from public, anon, authenticated;
grant select on table public.user_saved_daily_plan_ingredient_identities to authenticated;

create policy "Users can read own saved plan ingredient identities"
  on public.user_saved_daily_plan_ingredient_identities
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Reject malformed historical snapshots rather than producing an incomplete projection.
do $backfill$
declare
  v_plan record;
  v_meal jsonb;
  v_meal_index integer;
  v_ingredient jsonb;
  v_ingredient_index integer;
  v_inventory_item_id uuid;
begin
  for v_plan in
    select id, user_id, meals
    from public.user_saved_daily_plans
    order by id
  loop
    if jsonb_typeof(v_plan.meals) <> 'array' then
      raise exception 'invalid_saved_plan_identity_backfill: plan % meals must be an array', v_plan.id;
    end if;

    for v_meal, v_meal_index in
      select value, ordinality::integer
      from jsonb_array_elements(v_plan.meals) with ordinality
    loop
      if jsonb_typeof(v_meal) <> 'object'
        or jsonb_typeof(v_meal -> 'meal_type') <> 'string'
        or v_meal ->> 'meal_type' <> (array['breakfast', 'lunch', 'snack', 'dinner'])[v_meal_index]
        or jsonb_typeof(v_meal -> 'ingredients') <> 'array'
        or jsonb_array_length(v_meal -> 'ingredients') not between 1 and 20
      then
        raise exception 'invalid_saved_plan_identity_backfill: malformed meal % in plan %',
          v_meal_index, v_plan.id;
      end if;

      for v_ingredient, v_ingredient_index in
        select value, ordinality::integer
        from jsonb_array_elements(v_meal -> 'ingredients') with ordinality
      loop
        if jsonb_typeof(v_ingredient) <> 'object'
          or jsonb_typeof(v_ingredient -> 'inventory_item_id') <> 'string'
          or v_ingredient ->> 'inventory_item_id'
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then
          raise exception 'invalid_saved_plan_identity_backfill: malformed ingredient % in meal % of plan %',
            v_ingredient_index, v_meal_index, v_plan.id;
        end if;

        v_inventory_item_id := (v_ingredient ->> 'inventory_item_id')::uuid;
        insert into public.user_saved_daily_plan_ingredient_identities (
          plan_id, user_id, meal_type, ingredient_index,
          source_inventory_item_id, food_catalog_item_id
        )
        select
          v_plan.id, v_plan.user_id, v_meal ->> 'meal_type', v_ingredient_index,
          v_inventory_item_id, inventory.food_catalog_item_id
        from (select 1) seed
        left join public.inventory_items inventory
          on inventory.id = v_inventory_item_id
         and inventory.user_id = v_plan.user_id;
      end loop;
    end loop;
  end loop;
end;
$backfill$;

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
  v_inventory record;
  v_inventory_id uuid;
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

  -- Resolve all inventory references only after the JSON is known to be safe to cast.
  if (
    select count(distinct ingredient ->> 'inventory_item_id')
    from jsonb_array_elements(p_meals) meals(meal)
    cross join lateral jsonb_array_elements(meal -> 'ingredients') ingredients(ingredient)
  ) <> (
    select count(distinct inventory.id)
    from jsonb_array_elements(p_meals) meals(meal)
    cross join lateral jsonb_array_elements(meal -> 'ingredients') ingredients(ingredient)
    join public.inventory_items inventory
      on inventory.id = (ingredient ->> 'inventory_item_id')::uuid
     and inventory.user_id = v_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'inventory_item_not_found';
  end if;

  -- A deterministic row-lock order prevents concurrent edits/deletes and deadlocks.
  for v_inventory_id in
    select inventory.id
    from public.inventory_items inventory
    join (
      select distinct (ingredient ->> 'inventory_item_id')::uuid as id
      from jsonb_array_elements(p_meals) meals(meal)
      cross join lateral jsonb_array_elements(meal -> 'ingredients') ingredients(ingredient)
    ) requested on requested.id = inventory.id
    where inventory.user_id = v_user_id
    order by inventory.id
    for update of inventory
  loop
    null;
  end loop;

  for v_inventory in
    select
      inventory.id, inventory.name, inventory.unit, inventory.quantity,
      inventory.expires_at, sum((ingredient ->> 'quantity')::numeric) as requested_quantity
    from jsonb_array_elements(p_meals) meals(meal)
    cross join lateral jsonb_array_elements(meal -> 'ingredients') ingredients(ingredient)
    join public.inventory_items inventory
      on inventory.id = (ingredient ->> 'inventory_item_id')::uuid
     and inventory.user_id = v_user_id
    group by inventory.id, inventory.name, inventory.unit, inventory.quantity, inventory.expires_at
  loop
    if exists (
      select 1
      from jsonb_array_elements(p_meals) meals(meal)
      cross join lateral jsonb_array_elements(meal -> 'ingredients') ingredients(ingredient)
      where (ingredient ->> 'inventory_item_id')::uuid = v_inventory.id
        and (ingredient ->> 'name' <> v_inventory.name
          or ingredient ->> 'unit' <> v_inventory.unit)
    ) then
      raise exception using errcode = '22023', message = 'inventory_snapshot_mismatch';
    end if;
    if v_inventory.expires_at is not null and v_inventory.expires_at < p_plan_date then
      raise exception using errcode = '22023', message = 'inventory_item_expired';
    end if;
    if v_inventory.requested_quantity > v_inventory.quantity then
      raise exception using errcode = '22003', message = 'quantity_exceeds_available_stock';
    end if;
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

  insert into public.user_saved_daily_plan_ingredient_identities (
    plan_id, user_id, meal_type, ingredient_index,
    source_inventory_item_id, food_catalog_item_id
  )
  select
    v_id, v_user_id, meal ->> 'meal_type', ingredient_ordinality::smallint,
    inventory.id, inventory.food_catalog_item_id
  from jsonb_array_elements(p_meals) with ordinality meals(meal, meal_ordinality)
  cross join lateral jsonb_array_elements(meal -> 'ingredients')
    with ordinality ingredients(ingredient, ingredient_ordinality)
  join public.inventory_items inventory
    on inventory.id = (ingredient ->> 'inventory_item_id')::uuid
   and inventory.user_id = v_user_id
  order by meal_ordinality, ingredient_ordinality;

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
