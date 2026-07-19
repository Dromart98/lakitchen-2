-- Atomic, idempotent persistence for reviewed voice inventory drafts.
create table public.inventory_batch_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  payload_hash text not null,
  inserted_count integer not null check (inserted_count between 1 and 30),
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

alter table public.inventory_batch_submissions enable row level security;
revoke all on table public.inventory_batch_submissions from public, anon, authenticated;
create policy "Users can view own inventory batch submissions" on public.inventory_batch_submissions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own inventory batch submissions" on public.inventory_batch_submissions for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function public.save_voice_inventory_batch(p_submission_id uuid, p_items jsonb)
returns table(status text, inserted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_hash text;
  v_saved public.inventory_batch_submissions%rowtype;
  v_name text;
  v_quantity numeric;
  v_unit text;
  v_location text;
  v_category text;
  v_basis text;
  v_calories numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'not-authenticated'; end if;
  if p_submission_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception using errcode = '22023', message = 'invalid-batch-payload'; end if;
  v_hash := encode(extensions.digest(p_items::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_submission_id::text, 0));
  select * into v_saved from public.inventory_batch_submissions where user_id = v_user_id and submission_id = p_submission_id;
  if found then
    if v_saved.payload_hash <> v_hash then raise exception using errcode = 'P0001', message = 'submission-conflict'; end if;
    return query select 'already-saved'::text, v_saved.inserted_count;
    return;
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_item) k where k not in ('name','quantity','unit','location','category','nutrition_basis','calories','protein_g','carbs_g','fat_g')) <> 0
      or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 10
      or pg_catalog.jsonb_typeof(v_item->'name') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'quantity') <> 'number'
      or pg_catalog.jsonb_typeof(v_item->'unit') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'location') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'category') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'nutrition_basis') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'calories') <> 'number'
      or pg_catalog.jsonb_typeof(v_item->'protein_g') <> 'number'
      or pg_catalog.jsonb_typeof(v_item->'carbs_g') <> 'number'
      or pg_catalog.jsonb_typeof(v_item->'fat_g') <> 'number' then raise exception using errcode = '22023', message = 'invalid-batch-payload'; end if;
    v_name := btrim(v_item->>'name'); v_unit := v_item->>'unit'; v_location := v_item->>'location'; v_category := v_item->>'category'; v_basis := v_item->>'nutrition_basis';
    begin v_quantity := (v_item->>'quantity')::numeric; v_calories := (v_item->>'calories')::numeric; v_protein := (v_item->>'protein_g')::numeric; v_carbs := (v_item->>'carbs_g')::numeric; v_fat := (v_item->>'fat_g')::numeric; exception when others then raise exception using errcode = '22023', message = 'invalid-batch-payload'; end;
    if v_name is null or v_quantity is null or v_unit is null or v_location is null or v_category is null or v_basis is null or v_calories is null or v_protein is null or v_carbs is null or v_fat is null or char_length(v_name) not between 1 and 120 or v_unit not in ('ud','g','kg','ml','l') or v_location not in ('pantry','fridge','freezer') or v_category not in ('protein','carbohydrate','vegetable','fruit','fat','dairy','legume','condiment','beverage','other') or v_basis not in ('per_100g','per_100ml','per_unit') or v_quantity <= 0 or v_quantity in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or v_calories < 0 or v_protein < 0 or v_carbs < 0 or v_fat < 0 or v_calories in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or v_protein in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or v_carbs in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or v_fat in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or (v_unit in ('g','kg') and v_basis <> 'per_100g') or (v_unit in ('ml','l') and v_basis <> 'per_100ml') or (v_unit = 'ud' and v_basis <> 'per_unit') then raise exception using errcode = '22023', message = 'invalid-batch-payload'; end if;
  end loop;
  insert into public.inventory_items (user_id, name, quantity, unit, location, category, nutrition_basis, calories, protein_g, carbs_g, fat_g, expires_at)
  select v_user_id, btrim(value->>'name'), (value->>'quantity')::numeric, value->>'unit', value->>'location', value->>'category', value->>'nutrition_basis', (value->>'calories')::numeric, (value->>'protein_g')::numeric, (value->>'carbs_g')::numeric, (value->>'fat_g')::numeric, null
  from pg_catalog.jsonb_array_elements(p_items);
  insert into public.inventory_batch_submissions (user_id, submission_id, payload_hash, inserted_count) values (v_user_id, p_submission_id, v_hash, jsonb_array_length(p_items));
  return query select 'saved'::text, pg_catalog.jsonb_array_length(p_items);
end;
$$;

revoke all on function public.save_voice_inventory_batch(uuid, jsonb) from public, anon;
grant execute on function public.save_voice_inventory_batch(uuid, jsonb) to authenticated;
