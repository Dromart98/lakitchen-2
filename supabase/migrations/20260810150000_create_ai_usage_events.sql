create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  cache_hit boolean not null default false,
  provider_request_count integer not null check (provider_request_count >= 0),
  attempts integer not null check (attempts >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  outcome text not null check (outcome in ('success', 'clarification', 'error')),
  error_code text,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null check (cached_input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  reasoning_tokens bigint not null check (reasoning_tokens >= 0),
  total_tokens bigint not null check (total_tokens >= 0),
  estimated_cost_usd_micros bigint,
  pricing_version text not null,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_cache_hit_zero check (
    not cache_hit or (provider_request_count = 0 and attempts = 0 and input_tokens = 0 and cached_input_tokens = 0 and output_tokens = 0 and reasoning_tokens = 0 and total_tokens = 0 and estimated_cost_usd_micros = 0)
  ),
  constraint ai_usage_events_error_code check ((outcome = 'error') = (error_code is not null))
);

create index ai_usage_events_user_created_at_idx on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;

revoke all on table public.ai_usage_events from public, anon, authenticated;
grant insert, select, delete on table public.ai_usage_events to service_role;
revoke all on sequence public.ai_usage_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ai_usage_events_id_seq to service_role;
