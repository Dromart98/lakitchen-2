alter table public.inventory_items
add column nutrition_basis text,
add column calories numeric,
add column protein_g numeric,
add column carbs_g numeric,
add column fat_g numeric;

alter table public.inventory_items
add constraint inventory_items_nutrition_basis_check
check (
  nutrition_basis is null
  or nutrition_basis in ('per_100g', 'per_unit')
);

alter table public.inventory_items
add constraint inventory_items_calories_non_negative
check (calories is null or calories >= 0);

alter table public.inventory_items
add constraint inventory_items_protein_g_non_negative
check (protein_g is null or protein_g >= 0);

alter table public.inventory_items
add constraint inventory_items_carbs_g_non_negative
check (carbs_g is null or carbs_g >= 0);

alter table public.inventory_items
add constraint inventory_items_fat_g_non_negative
check (fat_g is null or fat_g >= 0);
