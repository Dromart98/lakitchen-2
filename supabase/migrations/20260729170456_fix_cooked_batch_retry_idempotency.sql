alter function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb)
  rename to create_saved_ai_recipe_cooked_batch_impl;

revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from public;
revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from anon;
revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from authenticated;

create or replace function public.create_saved_ai_recipe_cooked_batch(
  p_request_id uuid,
  p_recipe_id uuid,
  p_expected_measurement_updated_at timestamptz,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_input_count integer;
  v_valid_count integer;
  v_distinct_count integer;
  v_fingerprint text;
  v_existing public.user_saved_ai_recipe_cooked_batches%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_request_id is null
    or p_recipe_id is null
    or p_expected_measurement_updated_at is null
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_input_count := jsonb_array_length(p_lines);
  if v_input_count < 1 or v_input_count > 20 then
    raise exception using errcode = '22023', message = case when v_input_count > 20 then 'too_many_items' else 'invalid_input' end;
  end if;

  begin
    with parsed as (
      select
        line,
        (line ->> 'item_id')::uuid as item_id,
        (line ->> 'consumed_quantity')::numeric as consumed_quantity,
        case when line ? 'expected_equivalence_id' then (line ->> 'expected_equivalence_id')::uuid end as expected_equivalence_id,
        case when line ? 'expected_equivalence_updated_at' then (line ->> 'expected_equivalence_updated_at')::timestamptz end as expected_equivalence_updated_at,
        case when line ? 'expected_canonical_quantity' then (line ->> 'expected_canonical_quantity')::numeric end as expected_canonical_quantity,
        case when line ? 'expected_canonical_unit' then line ->> 'expected_canonical_unit' end as expected_canonical_unit
      from jsonb_array_elements(p_lines) as lines(line)
      where jsonb_typeof(line) = 'object'
        and line ? 'item_id'
        and line ? 'consumed_quantity'
        and (select count(*) from jsonb_object_keys(line)) in (2, 6)
        and not exists (
          select 1
          from jsonb_object_keys(line) key
          where key not in (
            'item_id',
            'consumed_quantity',
            'expected_equivalence_id',
            'expected_equivalence_updated_at',
            'expected_canonical_quantity',
            'expected_canonical_unit'
          )
        )
        and (
          ((select count(*) from jsonb_object_keys(line)) = 2
            and not line ? 'expected_equivalence_id'
            and not line ? 'expected_equivalence_updated_at'
            and not line ? 'expected_canonical_quantity'
            and not line ? 'expected_canonical_unit')
          or
          ((select count(*) from jsonb_object_keys(line)) = 6
            and line ? 'expected_equivalence_id'
            and line ? 'expected_equivalence_updated_at'
            and line ? 'expected_canonical_quantity'
            and line ? 'expected_canonical_unit')
        )
    ), valid as (
      select *
      from parsed
      where consumed_quantity is not null
        and consumed_quantity > 0
        and consumed_quantity not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        and (expected_equivalence_id is null) = (expected_equivalence_updated_at is null)
        and (expected_equivalence_id is null) = (expected_canonical_quantity is null)
        and (expected_equivalence_id is null) = (expected_canonical_unit is null)
        and (
          expected_equivalence_id is null
          or (
            expected_canonical_quantity > 0
            and expected_canonical_quantity not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
            and expected_canonical_unit in ('g', 'ml')
          )
        )
    )
    select
      count(*),
      count(distinct item_id),
      concat_ws(
        '|',
        p_recipe_id::text,
        p_expected_measurement_updated_at::text,
        jsonb_agg(
          jsonb_build_object(
            'item_id', item_id,
            'consumed_quantity', consumed_quantity,
            'expected_equivalence_id', expected_equivalence_id,
            'expected_equivalence_updated_at', expected_equivalence_updated_at,
            'expected_canonical_quantity', expected_canonical_quantity,
            'expected_canonical_unit', expected_canonical_unit
          ) order by item_id
        )::text
      )
    into v_valid_count, v_distinct_count, v_fingerprint
    from valid;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'invalid_input';
  end;

  if v_valid_count <> v_input_count or v_distinct_count <> v_input_count then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select *
  into v_existing
  from public.user_saved_ai_recipe_cooked_batches
  where id = p_request_id
  for update;

  if found then
    if v_existing.user_id = v_user_id
      and v_existing.creation_fingerprint = v_fingerprint then
      return v_existing.id;
    end if;

    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;

  return public.create_saved_ai_recipe_cooked_batch_impl(
    p_request_id,
    p_recipe_id,
    p_expected_measurement_updated_at,
    p_lines
  );
end;
$$;

do $ownership_check$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner)
  into v_owner
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.create_saved_ai_recipe_cooked_batch(uuid,uuid,timestamp with time zone,jsonb)'
  );

  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted create_saved_ai_recipe_cooked_batch owner';
  end if;
end;
$ownership_check$;

revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from public;
revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from anon;
grant execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) to authenticated;