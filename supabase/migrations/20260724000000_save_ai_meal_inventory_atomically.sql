-- The AI reconciliation form is retryable. Keep its idempotency record private:
-- callers can only reach it through the narrowly scoped authenticated RPC below.
create table public.ai_meal_inventory_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  payload_hash text not null,
  -- Deliberately no foreign key to daily_meal_logs: deleting a meal must not remove
  -- the idempotency record and allow the same submission to consume stock again.
  meal_log_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

alter table public.ai_meal_inventory_submissions enable row level security;
revoke all on table public.ai_meal_inventory_submissions from public, anon, authenticated;

-- SECURITY DEFINER is deliberately limited to this transaction: it lets the RPC
-- distinguish a missing product from a product owned by another user while every
-- data mutation remains explicitly constrained to auth.uid().
create function public.consume_ai_meal_inventory_and_log_meal(
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
  v_name text := pg_catalog.btrim(pg_catalog.coalesce(p_meal_name, ''));
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
    item_id uuid primary key, product_name text, consumed_quantity numeric, available_quantity numeric,
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
    insert into pg_temp.ai_meal_snapshots values (v_item.id, pg_catalog.btrim(v_item.name), v_quantity, v_item.quantity, v_item.unit, v_item.nutrition_basis, v_item.calories * v_factor, v_item.protein_g * v_factor, v_item.carbs_g * v_factor, v_item.fat_g * v_factor);
    v_total_calories := v_total_calories + v_item.calories * v_factor; v_total_protein := v_total_protein + v_item.protein_g * v_factor; v_total_carbs := v_total_carbs + v_item.carbs_g * v_factor; v_total_fat := v_total_fat + v_item.fat_g * v_factor;
  end loop;

  insert into public.daily_meal_logs (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on)
  values (v_user_id, v_name, p_meal_type, pg_catalog.round(v_total_calories, 1), pg_catalog.round(v_total_protein, 1), pg_catalog.round(v_total_carbs, 1), pg_catalog.round(v_total_fat, 1), (pg_catalog.now() at time zone 'utc')::date)
  returning id into v_meal_id;
  insert into public.daily_meal_log_items (meal_log_id, user_id, source_inventory_item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g)
  select v_meal_id, v_user_id, item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g from pg_temp.ai_meal_snapshots;

  -- Never update an inventory row to zero: inventory_items enforces quantity > 0.
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