-- Remembered barcode products may omit their nutritional category.
alter table public.user_barcode_products
  alter column default_category drop not null,
  drop constraint user_barcode_products_default_category_check,
  add constraint user_barcode_products_default_category_check
    check (
      default_category is null
      or default_category in ('protein', 'carbohydrate', 'vegetable', 'fruit', 'fat', 'dairy', 'legume', 'condiment', 'beverage', 'other')
    );
