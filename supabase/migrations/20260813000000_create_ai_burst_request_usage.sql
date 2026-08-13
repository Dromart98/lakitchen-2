create table public.ai_burst_request_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);

alter table public.ai_burst_request_usage enable row level security;
alter table public.ai_burst_request_usage force row level security;

revoke all on table public.ai_burst_request_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_burst_request_usage to service_role;

create or replace function public.reserve_ai_burst_request(
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  server_now timestamptz := statement_timestamp();
  usage_row public.ai_burst_request_usage%rowtype;
  retry_after integer;
begin
  if p_user_id is null or p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid burst guard configuration' using errcode = '22023';
  end if;

  insert into public.ai_burst_request_usage as usage (user_id, window_started_at, request_count, updated_at)
  values (p_user_id, server_now, 1, server_now)
  on conflict (user_id) do update
    set window_started_at = case
          when usage.window_started_at + make_interval(secs => p_window_seconds) <= server_now then server_now
          else usage.window_started_at
        end,
        request_count = case
          when usage.window_started_at + make_interval(secs => p_window_seconds) <= server_now then 1
          else usage.request_count + 1
        end,
        updated_at = server_now
    where usage.window_started_at + make_interval(secs => p_window_seconds) <= server_now
       or usage.request_count < p_limit
  returning * into usage_row;

  if usage_row.user_id is not null then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  select greatest(1, ceil(extract(epoch from
    (window_started_at + make_interval(secs => p_window_seconds) - server_now)
  ))::integer)
  into retry_after
  from public.ai_burst_request_usage
  where user_id = p_user_id;

  return jsonb_build_object('allowed', false, 'retry_after_seconds', retry_after);
end;
$$;

revoke all on function public.reserve_ai_burst_request(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_burst_request(uuid, integer, integer) to service_role;
