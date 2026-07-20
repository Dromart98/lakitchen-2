alter table public.daily_meal_logs
  alter column calories type numeric(10,1) using calories::numeric(10,1),
  alter column protein_g type numeric(10,1) using protein_g::numeric(10,1),
  alter column carbs_g type numeric(10,1) using carbs_g::numeric(10,1),
  alter column fat_g type numeric(10,1) using fat_g::numeric(10,1);
