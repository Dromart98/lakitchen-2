create table public.ai_daily_cost_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  spent_usd_micros bigint not null default 0 check (spent_usd_micros >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table public.ai_daily_cost_reservations (
  reservation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  reserved_usd_micros bigint not null check (reserved_usd_micros > 0),
  actual_cost_usd_micros bigint check (actual_cost_usd_micros >= 0),
  status text not null default 'active' check (status in ('active', 'expired', 'settled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (reservation_id, user_id)
);

create index ai_daily_cost_reservations_active_idx
  on public.ai_daily_cost_reservations (user_id, usage_date, expires_at)
  where status = 'active';

alter table public.ai_daily_cost_usage enable row level security;
alter table public.ai_daily_cost_usage force row level security;
alter table public.ai_daily_cost_reservations enable row level security;
alter table public.ai_daily_cost_reservations force row level security;

revoke all on table public.ai_daily_cost_usage, public.ai_daily_cost_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_daily_cost_usage, public.ai_daily_cost_reservations to service_role;

create or replace function public.reserve_ai_daily_cost(
  p_user_id uuid,
  p_reservation_id uuid,
  p_budget_usd_micros bigint,
  p_reserved_usd_micros bigint
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_date_utc date := (statement_timestamp() at time zone 'utc')::date;
  spent bigint;
  active_reserved bigint;
begin
  if p_user_id is null or p_reservation_id is null or p_budget_usd_micros <= 0 or p_reserved_usd_micros <= 0 then
    return 'invalid';
  end if;

  insert into public.ai_daily_cost_usage (user_id, usage_date)
  values (p_user_id, current_date_utc)
  on conflict do nothing;

  select spent_usd_micros into spent
  from public.ai_daily_cost_usage
  where user_id = p_user_id and usage_date = current_date_utc
  for update;

  update public.ai_daily_cost_reservations
  set status = 'expired', settled_at = statement_timestamp()
  where user_id = p_user_id and usage_date = current_date_utc
    and status = 'active' and expires_at <= statement_timestamp();

  if exists (
    select 1 from public.ai_daily_cost_reservations
    where reservation_id = p_reservation_id and user_id = p_user_id
  ) then
    return 'reserved';
  end if;

  select coalesce(sum(reserved_usd_micros), 0) into active_reserved
  from public.ai_daily_cost_reservations
  where user_id = p_user_id and usage_date = current_date_utc and status = 'active';

  if spent + active_reserved + p_reserved_usd_micros > p_budget_usd_micros then
    return 'limit';
  end if;

  insert into public.ai_daily_cost_reservations
    (reservation_id, user_id, usage_date, reserved_usd_micros, expires_at)
  values
    (p_reservation_id, p_user_id, current_date_utc, p_reserved_usd_micros, statement_timestamp() + interval '10 minutes');
  return 'reserved';
end;
$$;

create or replace function public.settle_ai_daily_cost(
  p_user_id uuid,
  p_reservation_id uuid,
  p_actual_cost_usd_micros bigint
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.ai_daily_cost_reservations%rowtype;
begin
  if p_user_id is null or p_reservation_id is null or p_actual_cost_usd_micros < 0 then
    return false;
  end if;

  select * into reservation
  from public.ai_daily_cost_reservations
  where reservation_id = p_reservation_id and user_id = p_user_id
  for update;

  if not found then return false; end if;
  if reservation.status = 'settled' then return reservation.actual_cost_usd_micros = p_actual_cost_usd_micros; end if;

  insert into public.ai_daily_cost_usage as usage (user_id, usage_date, spent_usd_micros)
  values (p_user_id, reservation.usage_date, p_actual_cost_usd_micros)
  on conflict (user_id, usage_date) do update
    set spent_usd_micros = usage.spent_usd_micros + excluded.spent_usd_micros,
        updated_at = statement_timestamp();

  update public.ai_daily_cost_reservations
  set status = 'settled', actual_cost_usd_micros = p_actual_cost_usd_micros, settled_at = statement_timestamp()
  where reservation_id = p_reservation_id;
  return true;
end;
$$;

revoke all on function public.reserve_ai_daily_cost(uuid, uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.settle_ai_daily_cost(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_daily_cost(uuid, uuid, bigint, bigint) to service_role;
grant execute on function public.settle_ai_daily_cost(uuid, uuid, bigint) to service_role;
