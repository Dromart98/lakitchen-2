grant update (
  name,
  meal_type,
  calories,
  protein_g,
  carbs_g,
  fat_g
)
on table public.daily_meal_logs
to authenticated;

create policy "Users can update own daily meal logs from today"
on public.daily_meal_logs
for update
to authenticated
using (
  auth.uid() = user_id
  and consumed_on = (now() at time zone 'utc')::date
)
with check (
  auth.uid() = user_id
  and consumed_on = (now() at time zone 'utc')::date
);
