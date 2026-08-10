create table public.user_text_meal_analysis_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  model text not null,
  contract_version text not null,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, cache_key),
  constraint user_text_meal_cache_key_sha256 check (cache_key ~ '^[0-9a-f]{64}$'),
  constraint user_text_meal_cache_model_length check (char_length(model) between 1 and 120),
  constraint user_text_meal_cache_contract_length check (char_length(contract_version) between 1 and 80),
  constraint user_text_meal_cache_success_only check (result ->> 'status' = 'success')
);

create index user_text_meal_analysis_cache_expiry_idx
  on public.user_text_meal_analysis_cache (expires_at);

alter table public.user_text_meal_analysis_cache enable row level security;
alter table public.user_text_meal_analysis_cache force row level security;

create policy "Users can view own text meal cache"
  on public.user_text_meal_analysis_cache for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create own text meal cache"
  on public.user_text_meal_analysis_cache for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own text meal cache"
  on public.user_text_meal_analysis_cache for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_text_meal_analysis_cache from anon;
grant select, insert, update on table public.user_text_meal_analysis_cache to authenticated;
