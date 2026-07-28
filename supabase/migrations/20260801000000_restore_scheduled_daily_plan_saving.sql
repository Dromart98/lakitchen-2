alter table public.user_saved_daily_plans
  add constraint user_saved_daily_plans_user_plan_date_key
  unique (user_id, plan_date);

create or replace function public.save_scheduled_daily_plan(
  p_plan_date date,
  p_priority_mode text,
  p_max_minutes_per_meal integer,
  p_target jsonb,
  p_total jsonb,
  p_difference jsonb,
  p_fit text,
  p_meals jsonb,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_utc_date date := (now() at time zone 'UTC')::date;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_plan_date is null
    or p_plan_date < v_utc_date
    or p_plan_date > v_utc_date + 6
  then
    raise exception using errcode = '22023', message = 'invalid_plan_date';
  end if;

  if p_priority_mode is null
    or p_priority_mode not in ('balanced', 'expiration')
    or p_max_minutes_per_meal is null
    or p_max_minutes_per_meal not in (15, 30, 45, 60)
    or p_target is null
    or jsonb_typeof(p_target) <> 'object'
    or p_total is null
    or jsonb_typeof(p_total) <> 'object'
    or p_difference is null
    or jsonb_typeof(p_difference) <> 'object'
    or p_fit is null
    or p_fit not in ('close', 'acceptable', 'far')
    or p_meals is null
    or jsonb_typeof(p_meals) <> 'array'
    or jsonb_array_length(p_meals) <> 4
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_plan_payload';
  end if;

  insert into public.user_saved_daily_plans (
    user_id,
    plan_date,
    priority_mode,
    max_minutes_per_meal,
    target,
    total,
    difference,
    fit,
    meals,
    fingerprint
  )
  values (
    v_user_id,
    p_plan_date,
    p_priority_mode,
    p_max_minutes_per_meal,
    p_target,
    p_total,
    p_difference,
    p_fit,
    p_meals,
    p_fingerprint
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    if exists (
      select 1
      from public.user_saved_daily_plans
      where user_id = v_user_id
        and plan_date = p_plan_date
    ) then
      raise exception using errcode = '23505', message = 'date_occupied';
    end if;
    raise;
end;
$$;

-- SECURITY DEFINER is required because authenticated cannot insert directly;
-- keeping that grant revoked prevents callers from bypassing RPC validation.
revoke all on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) from public;
revoke all on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) from anon;
grant execute on function public.save_scheduled_daily_plan(
  date, text, integer, jsonb, jsonb, jsonb, text, jsonb, text
) to authenticated;

revoke insert on table public.user_saved_daily_plans from authenticated;
