-- Phase 1.3B2: snapshot the owner-scoped inventory identity in meals and saved recipes.
alter table public.daily_meal_log_items
  add column food_catalog_item_id uuid null;

alter table public.user_saved_ai_recipe_ingredients
  add column food_catalog_item_id uuid null;

-- Backfill only through surviving, owner-matched inventory rows.
update public.daily_meal_log_items meal_item
set food_catalog_item_id = inventory.food_catalog_item_id
from public.inventory_items inventory
where inventory.id = meal_item.source_inventory_item_id
  and inventory.user_id = meal_item.user_id
  and inventory.food_catalog_item_id is not null;

update public.user_saved_ai_recipe_ingredients ingredient
set food_catalog_item_id = inventory.food_catalog_item_id
from public.inventory_items inventory
where inventory.id = ingredient.inventory_item_id
  and inventory.user_id = ingredient.user_id
  and inventory.food_catalog_item_id is not null;

alter table public.daily_meal_log_items
  add constraint daily_meal_log_items_food_owner_fk
  foreign key (food_catalog_item_id, user_id)
  references public.food_catalog_items (id, user_id)
  on delete set null (food_catalog_item_id);

alter table public.user_saved_ai_recipe_ingredients
  add constraint user_saved_ai_recipe_ingredients_food_owner_fk
  foreign key (food_catalog_item_id, user_id)
  references public.food_catalog_items (id, user_id)
  on delete set null (food_catalog_item_id);

create index daily_meal_log_items_food_owner_idx
  on public.daily_meal_log_items (food_catalog_item_id, user_id);

create index user_saved_ai_recipe_ingredients_food_owner_idx
  on public.user_saved_ai_recipe_ingredients (food_catalog_item_id, user_id);

create or replace function public.consume_inventory_item_and_log_meal(
  p_item_id uuid,
  p_consumed_quantity numeric,
  p_meal_type text
)
returns numeric
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_factor numeric;
  v_remaining_quantity numeric;
  v_meal_log_id uuid;
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
    raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
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

revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from public;
revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from anon;
grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) to authenticated;

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
      food_catalog_item_id,
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
      v_item.food_catalog_item_id,
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

revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated;
create or replace function public.consume_ai_meal_inventory_and_log_meal(
  p_submission_id uuid,
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
  v_name text := pg_catalog.btrim(coalesce(p_meal_name, ''));
  v_hash text;
  v_saved public.ai_meal_inventory_submissions%rowtype;
  v_line jsonb;
  v_item public.inventory_items%rowtype;
  v_item_id uuid;
  v_quantity numeric;
  v_factor numeric;
  v_meal_id uuid;
  v_line_count integer;
  v_updated_count integer;
  v_deleted_count integer;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  if p_submission_id is null or v_name = '' or pg_catalog.char_length(v_name) > 120
    or p_meal_type is null or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other')
    or p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid-payload';
  end if;
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  if v_line_count not between 1 and 20 then raise exception using errcode = '22023', message = 'invalid-payload'; end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object('meal_name', v_name, 'meal_type', p_meal_type, 'lines', p_lines)::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_submission_id::text, 0));
  select * into v_saved from public.ai_meal_inventory_submissions where user_id = v_user_id and submission_id = p_submission_id;
  if found then
    if v_saved.payload_hash <> v_hash then raise exception using errcode = 'P0001', message = 'submission-conflict'; end if;
    return v_saved.meal_log_id;
  end if;

  create temporary table pg_temp.ai_meal_lines (item_id uuid primary key, consumed_quantity numeric not null) on commit drop;
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_line) key where key not in ('item_id', 'consumed_quantity')) <> 0
      or (select count(*) from pg_catalog.jsonb_object_keys(v_line)) <> 2
      or pg_catalog.jsonb_typeof(v_line->'item_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_line->'consumed_quantity') <> 'number' then
      raise exception using errcode = '22023', message = 'invalid-payload';
    end if;
    begin
      v_item_id := (v_line->>'item_id')::uuid;
      v_quantity := (v_line->>'consumed_quantity')::numeric;
    exception when others then raise exception using errcode = '22023', message = 'invalid-payload'; end;
    if v_quantity <= 0 or v_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then raise exception using errcode = '22023', message = 'invalid-payload'; end if;
    begin
      insert into pg_temp.ai_meal_lines values (v_item_id, v_quantity);
    exception when unique_violation then raise exception using errcode = '23505', message = 'duplicate-product'; end;
  end loop;

  create temporary table pg_temp.ai_meal_snapshots (
    item_id uuid primary key, food_catalog_item_id uuid, product_name text, consumed_quantity numeric, available_quantity numeric,
    unit text, nutrition_basis text, calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric
  ) on commit drop;
  for v_item_id, v_quantity in select item_id, consumed_quantity from pg_temp.ai_meal_lines order by item_id loop
    select * into v_item from public.inventory_items where id = v_item_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'product-not-found'; end if;
    if v_item.user_id <> v_user_id then raise exception using errcode = '42501', message = 'product-not-owned'; end if;
    if v_item.quantity is null or v_item.quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or v_item.quantity <= 0 or v_quantity > v_item.quantity then raise exception using errcode = '22003', message = 'quantity-insufficient'; end if;
    if v_item.name is null or pg_catalog.btrim(v_item.name) = '' or v_item.unit not in ('g', 'kg', 'ml', 'l', 'ud')
      or v_item.nutrition_basis not in ('per_100g', 'per_100ml', 'per_unit')
      or v_item.calories is null or v_item.protein_g is null or v_item.carbs_g is null or v_item.fat_g is null
      or v_item.calories in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.protein_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.carbs_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.fat_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_item.calories < 0 or v_item.protein_g < 0 or v_item.carbs_g < 0 or v_item.fat_g < 0 then
      raise exception using errcode = '22023', message = 'invalid-payload';
    end if;
    if v_item.unit in ('g', 'kg') and v_item.nutrition_basis = 'per_100g' then v_factor := v_quantity / case when v_item.unit = 'g' then 100 else 0.1 end;
    elsif v_item.unit in ('ml', 'l') and v_item.nutrition_basis = 'per_100ml' then v_factor := v_quantity / case when v_item.unit = 'ml' then 100 else 0.1 end;
    elsif v_item.unit = 'ud' and v_item.nutrition_basis = 'per_unit' then v_factor := v_quantity;
    else raise exception using errcode = '22023', message = 'incompatible-unit'; end if;
    insert into pg_temp.ai_meal_snapshots values (v_item.id, v_item.food_catalog_item_id, pg_catalog.btrim(v_item.name), v_quantity, v_item.quantity, v_item.unit, v_item.nutrition_basis, v_item.calories * v_factor, v_item.protein_g * v_factor, v_item.carbs_g * v_factor, v_item.fat_g * v_factor);
    v_total_calories := v_total_calories + v_item.calories * v_factor; v_total_protein := v_total_protein + v_item.protein_g * v_factor; v_total_carbs := v_total_carbs + v_item.carbs_g * v_factor; v_total_fat := v_total_fat + v_item.fat_g * v_factor;
  end loop;

  insert into public.daily_meal_logs (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on)
  values (v_user_id, v_name, p_meal_type, pg_catalog.round(v_total_calories, 1), pg_catalog.round(v_total_protein, 1), pg_catalog.round(v_total_carbs, 1), pg_catalog.round(v_total_fat, 1), (pg_catalog.now() at time zone 'utc')::date)
  returning id into v_meal_id;
  insert into public.daily_meal_log_items (meal_log_id, user_id, source_inventory_item_id, food_catalog_item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g)
  select v_meal_id, v_user_id, item_id, food_catalog_item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g from pg_temp.ai_meal_snapshots;

  update public.inventory_items inventory set quantity = snapshot.available_quantity - snapshot.consumed_quantity
  from pg_temp.ai_meal_snapshots snapshot
  where inventory.id = snapshot.item_id and inventory.user_id = v_user_id
    and snapshot.available_quantity > snapshot.consumed_quantity;
  get diagnostics v_updated_count = row_count;

  delete from public.inventory_items inventory
  using pg_temp.ai_meal_snapshots snapshot
  where inventory.id = snapshot.item_id and inventory.user_id = v_user_id
    and snapshot.available_quantity = snapshot.consumed_quantity;
  get diagnostics v_deleted_count = row_count;

  if v_updated_count + v_deleted_count <> v_line_count then
    raise exception using errcode = 'P0001', message = 'inventory-mutation-failed';
  end if;

  insert into public.ai_meal_inventory_submissions (user_id, submission_id, payload_hash, meal_log_id) values (v_user_id, p_submission_id, v_hash, v_meal_id);
  return v_meal_id;
end;
$$;

revoke all on function public.consume_ai_meal_inventory_and_log_meal(uuid, text, text, jsonb) from public, anon;
grant execute on function public.consume_ai_meal_inventory_and_log_meal(uuid, text, text, jsonb) to authenticated;
create or replace function public.save_user_ai_recipe(
  p_title text,
  p_description text,
  p_estimated_minutes integer,
  p_servings integer,
  p_steps jsonb,
  p_source_priority_mode text,
  p_fingerprint text,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipe_id uuid;
  v_existing_recipe_id uuid;
  v_inventory_item public.inventory_items%rowtype;
  v_locked_inventory_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) < 1 or jsonb_array_length(p_ingredients) > 20 then
    raise exception using errcode = '22023', message = 'Invalid saved recipe ingredients';
  end if;

  insert into public.user_saved_ai_recipes (user_id, title, description, estimated_minutes, servings, steps, source_priority_mode, fingerprint)
  values (v_user_id, btrim(p_title), btrim(p_description), p_estimated_minutes, p_servings, p_steps, p_source_priority_mode, btrim(p_fingerprint))
  on conflict (user_id, fingerprint) do nothing
  returning id into v_recipe_id;

  if v_recipe_id is null then
    select id into v_existing_recipe_id
    from public.user_saved_ai_recipes
    where user_id = v_user_id and fingerprint = btrim(p_fingerprint);

    return v_existing_recipe_id;
  end if;

  create temporary table pg_temp.saved_recipe_ingredients (
    sort_order integer primary key,
    inventory_item_id uuid not null,
    ingredient jsonb not null
  ) on commit drop;

  insert into pg_temp.saved_recipe_ingredients (sort_order, inventory_item_id, ingredient)
  select
    ingredient.ordinality::integer - 1,
    (ingredient.value ->> 'inventory_item_id')::uuid,
    ingredient.value
  from jsonb_array_elements(p_ingredients) with ordinality as ingredient(value, ordinality);

  -- Match the consumption RPC lock order and prevent identity changes while it is copied.
  for v_inventory_item in
    select inventory.*
    from public.inventory_items inventory
    join pg_temp.saved_recipe_ingredients ingredient
      on ingredient.inventory_item_id = inventory.id
    where inventory.user_id = v_user_id
    order by inventory.id
    for share of inventory
  loop
    v_locked_inventory_count := v_locked_inventory_count + 1;
  end loop;

  if v_locked_inventory_count <> jsonb_array_length(p_ingredients) then
    raise exception using errcode = 'P0002', message = 'Inventory item not found';
  end if;

  insert into public.user_saved_ai_recipe_ingredients (
    recipe_id, user_id, inventory_item_id, food_catalog_item_id,
    name, quantity, unit, sort_order
  )
  select
    v_recipe_id,
    v_user_id,
    inventory.id,
    inventory.food_catalog_item_id,
    btrim(ingredient.ingredient ->> 'name'),
    (ingredient.ingredient ->> 'quantity')::numeric,
    btrim(ingredient.ingredient ->> 'unit'),
    ingredient.sort_order
  from pg_temp.saved_recipe_ingredients ingredient
  join public.inventory_items inventory
    on inventory.id = ingredient.inventory_item_id
   and inventory.user_id = v_user_id
  order by ingredient.sort_order;

  return v_recipe_id;
end;
$$;

revoke all on table public.user_saved_ai_recipes from anon;
revoke all on table public.user_saved_ai_recipe_ingredients from anon;
revoke execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) from public;
revoke execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) from anon;
grant execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) to authenticated;
