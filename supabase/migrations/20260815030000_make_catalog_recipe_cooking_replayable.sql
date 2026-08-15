create function public.probe_catalog_recipe_cooking_request(
  p_request_id uuid,
  p_recipe_id uuid,
  p_servings integer,
  p_meal_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing public.meal_builder_consumption_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_recipe_id is null or p_servings is null
    or p_servings < 1 or p_servings > 50
    or p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception using errcode = '22023', message = 'Invalid catalog recipe cooking request';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'operation', 'catalog_recipe',
    'recipe_id', p_recipe_id,
    'servings', p_servings,
    'meal_type', p_meal_type
  )::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );

  select * into v_existing
  from public.meal_builder_consumption_requests
  where user_id = v_user_id and request_id = p_request_id;

  if not found then
    return null;
  end if;
  if v_existing.payload_fingerprint <> v_fingerprint then
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;

  return v_existing.meal_log_id;
end;
$$;

create function public.consume_catalog_recipe_and_log_meal(
  p_request_id uuid,
  p_recipe_id uuid,
  p_servings integer,
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
  v_existing public.meal_builder_consumption_requests%rowtype;
  v_meal_log_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_recipe_id is null or p_servings is null
    or p_servings < 1 or p_servings > 50
    or p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack')
    or p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid catalog recipe cooking request';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'operation', 'catalog_recipe',
    'recipe_id', p_recipe_id,
    'servings', p_servings,
    'meal_type', p_meal_type
  )::text, 'sha256'), 'hex');

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
  v_probe_owner name;
  v_consume_owner name;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_probe_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.probe_catalog_recipe_cooking_request(uuid,uuid,integer,text)'
  );
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_consume_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.consume_catalog_recipe_and_log_meal(uuid,uuid,integer,text,text,jsonb)'
  );
  if v_probe_owner is null or v_probe_owner in ('authenticated', 'anon')
    or v_consume_owner is null or v_consume_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted catalog recipe cooking RPC owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.probe_catalog_recipe_cooking_request(uuid, uuid, integer, text) from public;
revoke execute on function public.probe_catalog_recipe_cooking_request(uuid, uuid, integer, text) from anon;
grant execute on function public.probe_catalog_recipe_cooking_request(uuid, uuid, integer, text) to authenticated;

revoke execute on function public.consume_catalog_recipe_and_log_meal(uuid, uuid, integer, text, text, jsonb) from public;
revoke execute on function public.consume_catalog_recipe_and_log_meal(uuid, uuid, integer, text, text, jsonb) from anon;
grant execute on function public.consume_catalog_recipe_and_log_meal(uuid, uuid, integer, text, text, jsonb) to authenticated;
