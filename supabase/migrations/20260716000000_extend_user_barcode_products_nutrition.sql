alter table public.user_barcode_products
  add column default_category text;

update public.user_barcode_products
set default_category = 'other'
where default_category is null;

alter table public.user_barcode_products
  alter column default_category set not null,
  add column nutrition_basis text,
  add column calories numeric,
  add column protein_g numeric,
  add column carbs_g numeric,
  add column fat_g numeric,
  add constraint user_barcode_products_default_category_check
    check (default_category in ('protein', 'carbohydrate', 'vegetable', 'fruit', 'fat', 'dairy', 'legume', 'condiment', 'beverage', 'other')),
  add constraint user_barcode_products_nutrition_basis_check
    check (nutrition_basis is null or nutrition_basis in ('per_100g', 'per_unit', 'per_100ml')),
  add constraint user_barcode_products_calories_check
    check (calories is null or (calories >= 0 and calories <> 'Infinity'::numeric and calories <> 'NaN'::numeric)),
  add constraint user_barcode_products_protein_g_check
    check (protein_g is null or (protein_g >= 0 and protein_g <> 'Infinity'::numeric and protein_g <> 'NaN'::numeric)),
  add constraint user_barcode_products_carbs_g_check
    check (carbs_g is null or (carbs_g >= 0 and carbs_g <> 'Infinity'::numeric and carbs_g <> 'NaN'::numeric)),
  add constraint user_barcode_products_fat_g_check
    check (fat_g is null or (fat_g >= 0 and fat_g <> 'Infinity'::numeric and fat_g <> 'NaN'::numeric)),
  add constraint user_barcode_products_nutrition_basis_required_check
    check (
      nutrition_basis is not null
      or (calories is null and protein_g is null and carbs_g is null and fat_g is null)
    );
