-- Preserve the one-decimal nutrition contract already supported by daily_meal_logs.
-- The shared meal-builder RPC currently rounds every aggregate to an integer before
-- inserting the meal, which makes persisted totals disagree with the reviewed preview.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_next text;
begin
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.consume_meal_builder_items_and_log_meal(text,text,jsonb)')
  ) into v_definition;

  if v_definition is null then
    raise exception 'consume_meal_builder_items_and_log_meal is missing';
  end if;

  v_updated := v_definition;

  v_next := pg_catalog.replace(v_updated, 'round(v_total_calories)::integer', 'round(v_total_calories, 1)');
  if v_next = v_updated then raise exception 'Expected integer calorie rounding was not found'; end if;
  v_updated := v_next;

  v_next := pg_catalog.replace(v_updated, 'round(v_total_protein_g)::integer', 'round(v_total_protein_g, 1)');
  if v_next = v_updated then raise exception 'Expected integer protein rounding was not found'; end if;
  v_updated := v_next;

  v_next := pg_catalog.replace(v_updated, 'round(v_total_carbs_g)::integer', 'round(v_total_carbs_g, 1)');
  if v_next = v_updated then raise exception 'Expected integer carbohydrate rounding was not found'; end if;
  v_updated := v_next;

  v_next := pg_catalog.replace(v_updated, 'round(v_total_fat_g)::integer', 'round(v_total_fat_g, 1)');
  if v_next = v_updated then raise exception 'Expected integer fat rounding was not found'; end if;
  v_updated := v_next;

  execute v_updated;
end;
$migration$;

-- CREATE OR REPLACE must not weaken the existing SECURITY DEFINER boundary or
-- execution privileges. Fail the migration if either invariant changed.
do $security_check$
declare
  v_security_definer boolean;
  v_search_path text[];
  v_owner name;
begin
  select p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner)
    into v_security_definer, v_search_path, v_owner
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.consume_meal_builder_items_and_log_meal(text,text,jsonb)'
  );

  if v_security_definer is distinct from true then
    raise exception 'Meal-builder RPC lost SECURITY DEFINER';
  end if;

  if v_search_path is null or not ('search_path=""' = any(v_search_path)) then
    raise exception 'Meal-builder RPC search_path is not empty';
  end if;

  if v_owner is null or v_owner in ('authenticated', 'anon') then
    raise exception 'Untrusted meal-builder RPC owner';
  end if;
end;
$security_check$;

revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public;
revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon;
grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated;
