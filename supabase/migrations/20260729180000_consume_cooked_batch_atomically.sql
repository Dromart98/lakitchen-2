-- A batch consumption and its meal form one accounting event. Composite
-- ownership keys prevent a definer function from linking rows across users.
alter table public.user_saved_ai_recipe_cooked_batches
  alter column created_at type timestamptz(3)
    using date_trunc('milliseconds', created_at),
  alter column updated_at type timestamptz(3)
    using date_trunc('milliseconds', updated_at),
  add constraint user_saved_ai_recipe_cooked_batches_id_user_key
    unique (id, user_id);

-- Keep the existing exact numeric macro storage. Only add the composite key
-- required by the same-owner consumption ledger foreign key.
alter table public.daily_meal_logs
  add constraint daily_meal_logs_id_user_key unique (id, user_id);

drop trigger if exists set_user_saved_ai_recipe_cooked_batches_updated_at
  on public.user_saved_ai_recipe_cooked_batches;

create or replace function public.set_cooked_batch_monotonic_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := greatest(
    date_trunc('milliseconds', pg_catalog.clock_timestamp()),
    old.updated_at + interval '1 millisecond'
  );
  return new;
end;
$$;

create trigger set_user_saved_ai_recipe_cooked_batch_monotonic_version
before update on public.user_saved_ai_recipe_cooked_batches
for each row execute function public.set_cooked_batch_monotonic_version();

create table public.user_saved_ai_recipe_cooked_batch_consumptions (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  meal_log_id uuid not null,
  requested_mode text not null
    check (requested_mode in ('servings', 'cooked_weight_g')),
  requested_quantity double precision not null,
  consumed_cooked_weight_g double precision not null,
  consumed_servings double precision not null,
  consumed_calories double precision not null,
  consumed_protein_g double precision not null,
  consumed_carbs_g double precision not null,
  consumed_fat_g double precision not null,
  idempotency_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint cooked_batch_consumptions_batch_owner_fkey
    foreign key (batch_id, user_id)
    references public.user_saved_ai_recipe_cooked_batches(id, user_id)
    on delete no action deferrable initially deferred,
  constraint cooked_batch_consumptions_meal_owner_fkey
    foreign key (meal_log_id, user_id)
    references public.daily_meal_logs(id, user_id)
    on delete no action deferrable initially deferred,
  constraint cooked_batch_consumptions_requested_quantity_check
    check (
      requested_quantity > 0
      and requested_quantity not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
    ),
  constraint cooked_batch_consumptions_consumed_weight_check
    check (
      consumed_cooked_weight_g > 0
      and consumed_cooked_weight_g not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
    ),
  constraint cooked_batch_consumptions_consumed_servings_check
    check (
      consumed_servings > 0
      and consumed_servings not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
    ),
  constraint cooked_batch_consumptions_nutrition_check
    check (
      consumed_calories >= 0
      and consumed_calories not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
      and consumed_protein_g >= 0
      and consumed_protein_g not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
      and consumed_carbs_g >= 0
      and consumed_carbs_g not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
      and consumed_fat_g >= 0
      and consumed_fat_g not in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
    ),
  constraint cooked_batch_consumptions_fingerprint_check
    check (
      idempotency_fingerprint = btrim(idempotency_fingerprint)
      and idempotency_fingerprint <> ''
    )
);

create index cooked_batch_consumptions_user_created_idx
  on public.user_saved_ai_recipe_cooked_batch_consumptions(user_id, created_at desc);
create index cooked_batch_consumptions_batch_owner_idx
  on public.user_saved_ai_recipe_cooked_batch_consumptions(batch_id, user_id);
create index cooked_batch_consumptions_meal_owner_idx
  on public.user_saved_ai_recipe_cooked_batch_consumptions(meal_log_id, user_id);

alter table public.user_saved_ai_recipe_cooked_batch_consumptions
  enable row level security;
alter table public.user_saved_ai_recipe_cooked_batch_consumptions
  force row level security;

create policy "Users can view own cooked batch consumptions"
  on public.user_saved_ai_recipe_cooked_batch_consumptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_saved_ai_recipe_cooked_batch_consumptions
  from anon;
revoke all on table public.user_saved_ai_recipe_cooked_batch_consumptions
  from authenticated;
grant select on table public.user_saved_ai_recipe_cooked_batch_consumptions
  to authenticated;

create or replace function public.consume_cooked_batch_and_log_meal(
  p_request_id uuid,
  p_batch_id uuid,
  p_meal_type text,
  p_expected_batch_updated_at timestamptz,
  p_servings_consumed double precision default null,
  p_cooked_weight_consumed_g double precision default null
)
returns table (
  consumed_cooked_weight_g double precision,
  consumed_servings double precision,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch public.user_saved_ai_recipe_cooked_batches%rowtype;
  v_existing public.user_saved_ai_recipe_cooked_batch_consumptions%rowtype;
  v_mode text;
  v_requested double precision;
  v_fingerprint text;
  v_remaining double precision;
  v_weight double precision;
  v_servings double precision;
  v_fraction double precision;
  v_tolerance double precision;
  v_meal_id uuid;
  v_affected integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_request_id is null
    or p_batch_id is null
    or p_expected_batch_updated_at is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other')
    or (p_servings_consumed is null) = (p_cooked_weight_consumed_g is null) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_mode := case
    when p_servings_consumed is not null then 'servings'
    else 'cooked_weight_g'
  end;
  v_requested := coalesce(p_servings_consumed, p_cooked_weight_consumed_g);

  if v_requested <= 0
    or v_requested in (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_fingerprint := concat_ws(
    '|',
    p_batch_id::text,
    p_meal_type,
    p_expected_batch_updated_at::text,
    v_mode,
    v_requested::text
  );

  -- Serialize the request key so concurrent retries observe the first
  -- committed event before validating mutable batch state.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select * into v_existing
  from public.user_saved_ai_recipe_cooked_batch_consumptions
  where request_id = p_request_id
  for update;

  if found then
    if v_existing.user_id <> v_user_id
      or v_existing.idempotency_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;

    return query
    select
      v_existing.consumed_cooked_weight_g,
      v_existing.consumed_servings,
      v_existing.consumed_calories,
      v_existing.consumed_protein_g,
      v_existing.consumed_carbs_g,
      v_existing.consumed_fat_g;
    return;
  end if;

  select * into v_batch
  from public.user_saved_ai_recipe_cooked_batches
  where id = p_batch_id and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'batch_not_found';
  end if;

  if v_batch.updated_at <> p_expected_batch_updated_at then
    raise exception using errcode = '40001', message = 'batch_version_conflict';
  end if;

  v_remaining := v_batch.cooked_weight_g - v_batch.consumed_cooked_weight_g;
  v_tolerance := 2.220446049250313e-16::double precision
    * greatest(
      1::double precision,
      abs(v_batch.cooked_weight_g),
      abs(v_remaining)
    )
    * 8;

  if v_remaining <= v_tolerance then
    raise exception using errcode = '22003', message = 'batch_exhausted';
  end if;

  if v_mode = 'servings' then
    v_weight := v_batch.cooked_weight_g * (v_requested / v_batch.servings);
  else
    v_weight := v_requested;
  end if;

  if v_weight <= 0
    or v_weight in (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if abs(v_weight - v_remaining) <= v_tolerance then
    v_weight := v_remaining;
  elsif v_weight > v_remaining then
    raise exception using errcode = '22003', message = 'insufficient_batch';
  end if;

  v_fraction := v_weight / v_batch.cooked_weight_g;
  v_servings := v_batch.servings * v_fraction;
  calories := v_batch.total_calories * v_fraction;
  protein_g := v_batch.total_protein_g * v_fraction;
  carbs_g := v_batch.total_carbs_g * v_fraction;
  fat_g := v_batch.total_fat_g * v_fraction;
  consumed_cooked_weight_g := v_weight;
  consumed_servings := v_servings;

  insert into public.daily_meal_logs (
    user_id,
    name,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    consumed_on,
    meal_type
  ) values (
    v_user_id,
    v_batch.recipe_title,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    (pg_catalog.now() at time zone 'utc')::date,
    p_meal_type
  )
  returning id into v_meal_id;

  insert into public.user_saved_ai_recipe_cooked_batch_consumptions (
    request_id,
    user_id,
    batch_id,
    meal_log_id,
    requested_mode,
    requested_quantity,
    consumed_cooked_weight_g,
    consumed_servings,
    consumed_calories,
    consumed_protein_g,
    consumed_carbs_g,
    consumed_fat_g,
    idempotency_fingerprint
  ) values (
    p_request_id,
    v_user_id,
    p_batch_id,
    v_meal_id,
    v_mode,
    v_requested,
    v_weight,
    v_servings,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    v_fingerprint
  );

  update public.user_saved_ai_recipe_cooked_batches as batch
  set consumed_cooked_weight_g = batch.consumed_cooked_weight_g + v_weight
  where id = p_batch_id and user_id = v_user_id;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using errcode = '40001', message = 'batch_update_conflict';
  end if;

  return next;
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.consume_cooked_batch_and_log_meal(uuid,uuid,text,timestamp with time zone,double precision,double precision)'
  );

  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted consume_cooked_batch_and_log_meal owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.set_cooked_batch_monotonic_version()
  from public;
revoke execute on function public.set_cooked_batch_monotonic_version()
  from anon;
revoke execute on function public.set_cooked_batch_monotonic_version()
  from authenticated;
revoke execute on function public.consume_cooked_batch_and_log_meal(
  uuid,
  uuid,
  text,
  timestamptz,
  double precision,
  double precision
) from public;
revoke execute on function public.consume_cooked_batch_and_log_meal(
  uuid,
  uuid,
  text,
  timestamptz,
  double precision,
  double precision
) from anon;
grant execute on function public.consume_cooked_batch_and_log_meal(
  uuid,
  uuid,
  text,
  timestamptz,
  double precision,
  double precision
) to authenticated;
