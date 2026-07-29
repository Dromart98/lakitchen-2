create table public.user_saved_ai_recipe_cooking_yields (
  recipe_id uuid primary key,
  user_id uuid not null,
  raw_weight_g double precision not null,
  cooked_weight_g double precision not null,
  servings integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_saved_ai_recipe_cooking_yields_recipe_owner_fkey
    foreign key (recipe_id, user_id)
    references public.user_saved_ai_recipes(id, user_id)
    on delete cascade,
  constraint user_saved_ai_recipe_cooking_yields_raw_weight_check
    check (raw_weight_g > 0 and raw_weight_g <> 'Infinity'::double precision),
  constraint user_saved_ai_recipe_cooking_yields_cooked_weight_check
    check (cooked_weight_g > 0 and cooked_weight_g <> 'Infinity'::double precision),
  constraint user_saved_ai_recipe_cooking_yields_servings_check
    check (servings > 0)
);

create index user_saved_ai_recipe_cooking_yields_user_id_idx
  on public.user_saved_ai_recipe_cooking_yields(user_id);

alter table public.user_saved_ai_recipe_cooking_yields enable row level security;
alter table public.user_saved_ai_recipe_cooking_yields force row level security;

create policy "Users can view own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_saved_ai_recipes recipes
      where recipes.id = recipe_id and recipes.user_id = auth.uid()
    )
  );

create policy "Users can update own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_saved_ai_recipes recipes
      where recipes.id = recipe_id and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.user_saved_ai_recipe_cooking_yields from anon;
grant select, insert, update, delete on table public.user_saved_ai_recipe_cooking_yields to authenticated;
