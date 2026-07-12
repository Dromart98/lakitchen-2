alter table public.daily_meal_logs
  add column meal_type text not null default 'other';

alter table public.daily_meal_logs
  add constraint daily_meal_logs_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner', 'other'));
