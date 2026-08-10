create table public.ai_daily_request_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_request_usage enable row level security;
alter table public.ai_daily_request_usage force row level security;

revoke all on table public.ai_daily_request_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_daily_request_usage to service_role;

create or replace function public.reserve_ai_daily_request(
  p_user_id uuid,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_count integer;
begin
  if p_user_id is null or p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_daily_request_usage as usage (user_id, usage_date, request_count)
  values (p_user_id, (statement_timestamp() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = usage.request_count + 1,
        updated_at = statement_timestamp()
    where usage.request_count < p_limit
  returning request_count into reserved_count;

  return reserved_count is not null;
end;
$$;

revoke all on function public.reserve_ai_daily_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_daily_request(uuid, integer) to service_role;
