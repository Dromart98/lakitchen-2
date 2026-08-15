-- This private ledger deliberately has no FK to the meal log: deleting a meal
-- must not allow an old request to recreate it.
create table public.macro_meal_log_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_fingerprint text not null,
  meal_log_id uuid not null,
  consumed_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.macro_meal_log_requests enable row level security;
revoke all on table public.macro_meal_log_requests from public, anon, authenticated;

create function public.create_macro_meal_log_idempotently(
  p_request_id uuid,
  p_name text,
  p_meal_type text,
  p_calories numeric,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
  v_fingerprint text;
  v_existing public.macro_meal_log_requests%rowtype;
  v_meal_log_id uuid;
  v_consumed_on date;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null
    or v_name is null or pg_catalog.char_length(v_name) not between 1 and 120
    or p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack', 'other')
    or p_calories is null or p_protein_g is null or p_carbs_g is null or p_fat_g is null
    or p_calories < 0 or p_protein_g < 0 or p_carbs_g < 0 or p_fat_g < 0
    or p_calories in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_protein_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_carbs_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_fat_g in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  then
    raise exception using errcode = '22023', message = 'invalid_macro_meal_payload';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'name', v_name,
    'meal_type', p_meal_type,
    'calories', p_calories,
    'protein_g', p_protein_g,
    'carbs_g', p_carbs_g,
    'fat_g', p_fat_g
  )::text, 'sha256'), 'hex');

  -- Serialize identical identities before checking the ledger or inserting.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0)
  );

  select * into v_existing
  from public.macro_meal_log_requests
  where user_id = v_user_id and request_id = p_request_id;

  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return v_existing.meal_log_id;
  end if;

  v_consumed_on := (pg_catalog.statement_timestamp() at time zone 'UTC')::date;
  insert into public.daily_meal_logs (
    user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on
  ) values (
    v_user_id, v_name, p_meal_type, p_calories, p_protein_g, p_carbs_g, p_fat_g, v_consumed_on
  ) returning id into v_meal_log_id;

  insert into public.macro_meal_log_requests (
    user_id, request_id, payload_fingerprint, meal_log_id, consumed_on
  ) values (
    v_user_id, p_request_id, v_fingerprint, v_meal_log_id, v_consumed_on
  );

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
    'public.create_macro_meal_log_idempotently(uuid,text,text,numeric,numeric,numeric,numeric)'
  );
  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted idempotent macro meal RPC owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.create_macro_meal_log_idempotently(uuid, text, text, numeric, numeric, numeric, numeric) from public;
revoke execute on function public.create_macro_meal_log_idempotently(uuid, text, text, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.create_macro_meal_log_idempotently(uuid, text, text, numeric, numeric, numeric, numeric) to authenticated;
