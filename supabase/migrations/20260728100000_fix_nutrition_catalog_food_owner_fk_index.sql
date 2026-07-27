drop index if exists public.nutrition_catalog_items_food_catalog_item_idx;

create index nutrition_catalog_items_food_owner_idx
on public.nutrition_catalog_items (food_catalog_item_id, user_id);
