revoke all on table public.ai_meal_inventory_submissions from service_role;
revoke all on function public.consume_ai_meal_inventory_and_log_meal(uuid, text, text, jsonb) from service_role;
revoke all on function public.consume_ai_meal_inventory_and_log_meal(uuid, text, text, jsonb) from public, anon;
grant execute on function public.consume_ai_meal_inventory_and_log_meal(uuid, text, text, jsonb) to authenticated;
