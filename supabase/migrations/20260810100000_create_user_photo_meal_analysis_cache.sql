create table public.user_photo_meal_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  model text not null,
  contract_version text not null,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint user_photo_meal_cache_user_key unique (user_id, cache_key),
  constraint user_photo_meal_cache_key_sha256 check (cache_key ~ '^[0-9a-f]{64}$'),
  constraint user_photo_meal_cache_model_length check (char_length(model) between 1 and 120),
  constraint user_photo_meal_cache_contract_length check (char_length(contract_version) between 1 and 80),
  constraint user_photo_meal_cache_success_only check (result ->> 'status' = 'success')
);

create index user_photo_meal_analysis_cache_expiry_idx
  on public.user_photo_meal_analysis_cache (expires_at);

alter table public.user_photo_meal_analysis_cache enable row level security;
alter table public.user_photo_meal_analysis_cache force row level security;

revoke all on table public.user_photo_meal_analysis_cache from public;
revoke all on table public.user_photo_meal_analysis_cache from anon;
revoke all on table public.user_photo_meal_analysis_cache from authenticated;
grant select, insert, update, delete on table public.user_photo_meal_analysis_cache to service_role;
