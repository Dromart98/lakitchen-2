-- Atomic, idempotent persistence for reviewed voice shopping-list drafts.
create table public.shopping_list_batch_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  payload_hash text not null,
  inserted_count integer not null check (inserted_count between 1 and 30),
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

alter table public.shopping_list_batch_submissions enable row level security;
revoke all on table public.shopping_list_batch_submissions from public, anon, authenticated;

create or replace function public.save_voice_shopping_batch(
  p_submission_id uuid,
  p_items jsonb
)
returns table(status text, inserted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_hash text;
  v_saved public.shopping_list_batch_submissions%rowtype;
  v_name text;
  v_quantity numeric;
  v_unit text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'not-authenticated';
  end if;

  if p_submission_id is null
    or p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'invalid-batch-payload';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_items::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_submission_id::text, 0)
  );

  select * into v_saved
  from public.shopping_list_batch_submissions
  where user_id = v_user_id and submission_id = p_submission_id;

  if found then
    if v_saved.payload_hash <> v_hash then
      raise exception using errcode = 'P0001', message = 'submission-conflict';
    end if;

    return query select 'already-saved'::text, v_saved.inserted_count;
    return;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_item) key where key not in ('name', 'quantity', 'unit')) <> 0
      or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 3
      or pg_catalog.jsonb_typeof(v_item->'name') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'quantity') <> 'number'
      or pg_catalog.jsonb_typeof(v_item->'unit') <> 'string' then
      raise exception using errcode = '22023', message = 'invalid-batch-payload';
    end if;

    v_name := btrim(v_item->>'name');
    v_unit := v_item->>'unit';
    begin
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid-batch-payload';
    end;

    if v_name is null
      or v_quantity is null
      or v_unit is null
      or char_length(v_name) not between 1 and 120
      or v_quantity <= 0
      or v_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or v_unit not in ('ud', 'g', 'kg', 'ml', 'l') then
      raise exception using errcode = '22023', message = 'invalid-batch-payload';
    end if;
  end loop;

  insert into public.shopping_list_items (user_id, name, quantity, unit, is_purchased)
  select
    v_user_id,
    btrim(value->>'name'),
    (value->>'quantity')::numeric,
    value->>'unit',
    false
  from pg_catalog.jsonb_array_elements(p_items);

  insert into public.shopping_list_batch_submissions (
    user_id,
    submission_id,
    payload_hash,
    inserted_count
  ) values (
    v_user_id,
    p_submission_id,
    v_hash,
    pg_catalog.jsonb_array_length(p_items)
  );

  return query select 'saved'::text, pg_catalog.jsonb_array_length(p_items);
end;
$$;

revoke all on function public.save_voice_shopping_batch(uuid, jsonb) from public, anon;
grant execute on function public.save_voice_shopping_batch(uuid, jsonb) to authenticated;
