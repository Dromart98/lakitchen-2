revoke all on table public.daily_meal_logs from authenticated;

grant select, insert, delete
on table public.daily_meal_logs
to authenticated;
