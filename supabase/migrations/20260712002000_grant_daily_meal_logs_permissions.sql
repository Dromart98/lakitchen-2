revoke all on table public.daily_meal_logs from anon;
revoke all on table public.daily_meal_logs from public;

grant select, insert, delete
on table public.daily_meal_logs
to authenticated;
