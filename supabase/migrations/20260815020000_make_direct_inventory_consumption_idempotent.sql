-- This private ledger deliberately has no FK to inventory items or meal logs:
-- a completed request remains replayable after either mutable record is deleted.
create table public.inventory_consumption_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_fingerprint text not null,
  remaining_quantity numeric not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.inventory_consumption_requests enable row level security;
revoke all on table public.inventory_consumption_requests from public, anon, authenticated;

create function public.consume_inventory_item(
  p_item_id uuid,
  p_quantity numeric,
  p_request_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing public.inventory_consumption_requests%rowtype;
  v_remaining_quantity numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_item_id is null or p_quantity is null
    or p_quantity <= 0
    or p_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception using errcode = '22023', message = 'Quantity must be greater than zero';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'operation', 'consume', 'item_id', p_item_id, 'quantity', p_quantity
  )::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );
  select * into v_existing from public.inventory_consumption_requests
  where user_id = v_user_id and request_id = p_request_id;
  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return v_existing.remaining_quantity;
  end if;

  v_remaining_quantity := public.consume_inventory_item(p_item_id, p_quantity);
  insert into public.inventory_consumption_requests (
    user_id, request_id, payload_fingerprint, remaining_quantity
  ) values (v_user_id, p_request_id, v_fingerprint, v_remaining_quantity);
  return v_remaining_quantity;
end;
$$;

create function public.consume_inventory_item_and_log_meal(
  p_item_id uuid,
  p_consumed_quantity numeric,
  p_meal_type text,
  p_request_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing public.inventory_consumption_requests%rowtype;
  v_remaining_quantity numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_item_id is null or p_consumed_quantity is null
    or p_consumed_quantity <= 0
    or p_consumed_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_meal_type is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other') then
    raise exception using errcode = '22023', message = 'Invalid consumed quantity or meal type';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'operation', 'consume_and_log_meal', 'item_id', p_item_id,
    'quantity', p_consumed_quantity, 'meal_type', p_meal_type
  )::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );
  select * into v_existing from public.inventory_consumption_requests
  where user_id = v_user_id and request_id = p_request_id;
  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return v_existing.remaining_quantity;
  end if;

  v_remaining_quantity := public.consume_inventory_item_and_log_meal(
    p_item_id, p_consumed_quantity, p_meal_type
  );
  insert into public.inventory_consumption_requests (
    user_id, request_id, payload_fingerprint, remaining_quantity
  ) values (v_user_id, p_request_id, v_fingerprint, v_remaining_quantity);
  return v_remaining_quantity;
end;
$$;

do $ownership_check$
declare
  v_signature text;
  v_owner name;
begin
  foreach v_signature in array array[
    'public.consume_inventory_item(uuid,numeric,uuid)',
    'public.consume_inventory_item_and_log_meal(uuid,numeric,text,uuid)'
  ] loop
    select pg_catalog.pg_get_userbyid(proc.proowner) into v_owner
    from pg_catalog.pg_proc proc
    where proc.oid = pg_catalog.to_regprocedure(v_signature);
    if v_owner is null or v_owner in ('authenticated', 'anon') then
      raise exception 'Untrusted idempotent inventory consumption RPC owner';
    end if;
  end loop;
end;
$ownership_check$;

revoke execute on function public.consume_inventory_item(uuid, numeric, uuid) from public;
revoke execute on function public.consume_inventory_item(uuid, numeric, uuid) from anon;
grant execute on function public.consume_inventory_item(uuid, numeric, uuid) to authenticated;
revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text, uuid) from public;
revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text, uuid) from anon;
grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text, uuid) to authenticated;
