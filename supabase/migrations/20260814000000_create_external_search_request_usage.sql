create table public.external_search_request_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_timestamps timestamptz[] not null default array[]::timestamptz[],
  updated_at timestamptz not null default now()
);

alter table public.external_search_request_usage enable row level security;
alter table public.external_search_request_usage force row level security;

revoke all on table public.external_search_request_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.external_search_request_usage to service_role;

create or replace function public.reserve_external_search_request(p_user_id uuid, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  server_now timestamptz := statement_timestamp();
  cutoff timestamptz;
  usage_row public.external_search_request_usage%rowtype;
  recent_requests timestamptz[];
  oldest_request timestamptz;
  retry_after integer;
begin
  if p_user_id is null or p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid external search guard configuration' using errcode = '22023';
  end if;

  cutoff := server_now - make_interval(secs => p_window_seconds);
  insert into public.external_search_request_usage (user_id, request_timestamps, updated_at)
  values (p_user_id, array[]::timestamptz[], server_now)
  on conflict (user_id) do nothing;

  select * into usage_row from public.external_search_request_usage where user_id = p_user_id for update;
  select coalesce(array_agg(requested_at order by requested_at), array[]::timestamptz[])
    into recent_requests
    from unnest(usage_row.request_timestamps) as requested_at
    where requested_at > cutoff;

  if cardinality(recent_requests) >= p_limit then
    oldest_request := recent_requests[1];
    retry_after := greatest(1, ceil(extract(epoch from (oldest_request + make_interval(secs => p_window_seconds) - server_now)))::integer);
    update public.external_search_request_usage set request_timestamps = recent_requests, updated_at = server_now where user_id = p_user_id;
    return jsonb_build_object('allowed', false, 'retry_after_seconds', retry_after);
  end if;

  recent_requests := array_append(recent_requests, server_now);
  update public.external_search_request_usage set request_timestamps = recent_requests, updated_at = server_now where user_id = p_user_id;
  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.reserve_external_search_request(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_external_search_request(uuid, integer, integer) to service_role;
