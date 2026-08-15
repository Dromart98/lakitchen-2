-- Keep retry metadata private and independent from meal deletion so a replay can
-- never become a fresh inventory consumption.
create table public.meal_builder_consumption_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_fingerprint text not null,
  meal_log_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.meal_builder_consumption_requests enable row level security;
revoke all on table public.meal_builder_consumption_requests from public, anon, authenticated;

create function public.consume_meal_builder_items_and_log_meal(
  p_request_id uuid,
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
  v_fingerprint text;
  v_normalized_lines jsonb;
  v_existing public.meal_builder_consumption_requests%rowtype;
  v_meal_log_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid meal lines';
  end if;

  begin
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'item_id', (line ->> 'item_id')::uuid,
        'consumed_quantity', (line ->> 'consumed_quantity')::numeric,
        'expected_equivalence_id', case when line ? 'expected_equivalence_id' then (line ->> 'expected_equivalence_id')::uuid end,
        'expected_equivalence_updated_at', case when line ? 'expected_equivalence_updated_at' then (line ->> 'expected_equivalence_updated_at')::timestamptz end,
        'expected_canonical_quantity', case when line ? 'expected_canonical_quantity' then (line ->> 'expected_canonical_quantity')::numeric end,
        'expected_canonical_unit', case when line ? 'expected_canonical_unit' then line ->> 'expected_canonical_unit' end
      ) order by (line ->> 'item_id')::uuid
    ) into v_normalized_lines
    from pg_catalog.jsonb_array_elements(p_lines) as lines(line);
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'Invalid meal line values';
  end;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'meal_name', pg_catalog.btrim(p_meal_name),
    'meal_type', p_meal_type,
    'lines', v_normalized_lines
  )::text, 'sha256'), 'hex');

  -- Serialize before reading mutable inventory. Concurrent retries wait for and
  -- reuse the first transaction's committed result.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );

  select * into v_existing
  from public.meal_builder_consumption_requests
  where user_id = v_user_id and request_id = p_request_id;

  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return v_existing.meal_log_id;
  end if;

  v_meal_log_id := public.consume_meal_builder_items_and_log_meal(
    p_meal_name, p_meal_type, p_lines
  );

  insert into public.meal_builder_consumption_requests (
    user_id, request_id, payload_fingerprint, meal_log_id
  ) values (v_user_id, p_request_id, v_fingerprint, v_meal_log_id);

  return v_meal_log_id;
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.consume_meal_builder_items_and_log_meal(uuid,text,text,jsonb)'
  );
  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted idempotent meal-builder RPC owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.consume_meal_builder_items_and_log_meal(uuid, text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(uuid, text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(uuid, text, text, jsonb) to authenticated;
