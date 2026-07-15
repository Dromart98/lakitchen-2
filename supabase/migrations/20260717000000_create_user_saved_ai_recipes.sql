create table public.user_saved_ai_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  estimated_minutes integer not null,
  servings integer not null,
  steps jsonb not null,
  source_priority_mode text not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint user_saved_ai_recipes_title_length check (char_length(btrim(title)) between 1 and 90),
  constraint user_saved_ai_recipes_description_length check (char_length(btrim(description)) between 1 and 240),
  constraint user_saved_ai_recipes_estimated_minutes_check check (estimated_minutes between 1 and 60),
  constraint user_saved_ai_recipes_servings_check check (servings between 1 and 4),
  constraint user_saved_ai_recipes_steps_array_check check (jsonb_typeof(steps) = 'array'),
  constraint user_saved_ai_recipes_source_priority_mode_check check (source_priority_mode in ('balanced', 'expiration')),
  constraint user_saved_ai_recipes_fingerprint_check check (char_length(btrim(fingerprint)) > 0),
  constraint user_saved_ai_recipes_user_fingerprint_key unique (user_id, fingerprint),
  constraint user_saved_ai_recipes_id_user_id_key unique (id, user_id)
);

create table public.user_saved_ai_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  user_id uuid not null,
  inventory_item_id uuid not null,
  name text not null,
  quantity numeric not null,
  unit text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint user_saved_ai_recipe_ingredients_recipe_user_fkey foreign key (recipe_id, user_id)
    references public.user_saved_ai_recipes(id, user_id)
    on delete cascade,
  constraint user_saved_ai_recipe_ingredients_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint user_saved_ai_recipe_ingredients_quantity_positive check (quantity > 0),
  constraint user_saved_ai_recipe_ingredients_unit_length check (char_length(btrim(unit)) between 1 and 16),
  constraint user_saved_ai_recipe_ingredients_sort_order_check check (sort_order between 0 and 19),
  constraint user_saved_ai_recipe_ingredients_recipe_sort_order_key unique (recipe_id, sort_order),
  constraint user_saved_ai_recipe_ingredients_recipe_inventory_item_key unique (recipe_id, inventory_item_id)
);

alter table public.user_saved_ai_recipes enable row level security;
alter table public.user_saved_ai_recipes force row level security;
alter table public.user_saved_ai_recipe_ingredients enable row level security;
alter table public.user_saved_ai_recipe_ingredients force row level security;

create policy "Users can view own saved AI recipes"
  on public.user_saved_ai_recipes
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own saved AI recipes"
  on public.user_saved_ai_recipes
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own saved AI recipes"
  on public.user_saved_ai_recipes
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Users can view own saved AI recipe ingredients"
  on public.user_saved_ai_recipe_ingredients
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own saved AI recipe ingredients"
  on public.user_saved_ai_recipe_ingredients
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_saved_ai_recipes recipes
      where recipes.id = recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own saved AI recipe ingredients"
  on public.user_saved_ai_recipe_ingredients
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.save_user_ai_recipe(
  p_title text,
  p_description text,
  p_estimated_minutes integer,
  p_servings integer,
  p_steps jsonb,
  p_source_priority_mode text,
  p_fingerprint text,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipe_id uuid;
  v_existing_recipe_id uuid;
  v_ingredient jsonb;
  v_sort_order integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) < 1 or jsonb_array_length(p_ingredients) > 20 then
    raise exception using errcode = '22023', message = 'Invalid saved recipe ingredients';
  end if;

  insert into public.user_saved_ai_recipes (user_id, title, description, estimated_minutes, servings, steps, source_priority_mode, fingerprint)
  values (v_user_id, btrim(p_title), btrim(p_description), p_estimated_minutes, p_servings, p_steps, p_source_priority_mode, btrim(p_fingerprint))
  on conflict (user_id, fingerprint) do nothing
  returning id into v_recipe_id;

  if v_recipe_id is null then
    select id into v_existing_recipe_id
    from public.user_saved_ai_recipes
    where user_id = v_user_id and fingerprint = btrim(p_fingerprint);

    return v_existing_recipe_id;
  end if;

  for v_ingredient in select value from jsonb_array_elements(p_ingredients) as ingredients(value) loop
    insert into public.user_saved_ai_recipe_ingredients (recipe_id, user_id, inventory_item_id, name, quantity, unit, sort_order)
    values (
      v_recipe_id,
      v_user_id,
      (v_ingredient ->> 'inventory_item_id')::uuid,
      btrim(v_ingredient ->> 'name'),
      (v_ingredient ->> 'quantity')::numeric,
      btrim(v_ingredient ->> 'unit'),
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  return v_recipe_id;
end;
$$;

revoke all on table public.user_saved_ai_recipes from anon;
revoke all on table public.user_saved_ai_recipe_ingredients from anon;
revoke execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) from public;
revoke execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) from anon;
grant execute on function public.save_user_ai_recipe(text, text, integer, integer, jsonb, text, text, jsonb) to authenticated;
