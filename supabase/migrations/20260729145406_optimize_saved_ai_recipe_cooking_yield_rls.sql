drop policy "Users can view own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields;
drop policy "Users can create own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields;
drop policy "Users can update own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields;
drop policy "Users can delete own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields;

create policy "Users can view own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_saved_ai_recipes recipes
      where recipes.id = recipe_id
        and recipes.user_id = (select auth.uid())
    )
  );

create policy "Users can update own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_saved_ai_recipes recipes
      where recipes.id = recipe_id
        and recipes.user_id = (select auth.uid())
    )
  );

create policy "Users can delete own saved recipe cooking yields"
  on public.user_saved_ai_recipe_cooking_yields for delete to authenticated
  using (user_id = (select auth.uid()));
