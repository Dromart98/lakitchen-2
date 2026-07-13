alter table public.inventory_items
add column category text;

alter table public.inventory_items
add constraint inventory_items_category_check
check (
  category is null
  or category in (
    'protein',
    'carbohydrate',
    'vegetable',
    'fruit',
    'fat',
    'dairy',
    'legume',
    'condiment',
    'beverage',
    'other'
  )
);
