create table public.nutrition_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_name text not null,
  aliases text[] not null default '{}',
  food_state text not null,
  nutrition_basis text not null,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  source text not null,
  external_id text,
  match_confidence text not null default 'medium',
  user_confirmed boolean not null default false,
  verified boolean not null default false,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_catalog_items_identity_unique unique (user_id, normalized_name, food_state, nutrition_basis),
  constraint nutrition_catalog_items_name_check check (normalized_name = btrim(normalized_name) and char_length(normalized_name) between 1 and 120),
  constraint nutrition_catalog_items_aliases_check check (array_position(aliases, null) is null),
  constraint nutrition_catalog_items_food_state_check check (food_state in ('raw', 'cooked', 'drained', 'frozen', 'processed', 'not_applicable', 'unknown')),
  constraint nutrition_catalog_items_basis_check check (nutrition_basis in ('per_100g', 'per_100ml', 'per_unit')),
  constraint nutrition_catalog_items_source_check check (source in ('user', 'barcode-memory', 'open-food-facts', 'usda', 'ai')),
  constraint nutrition_catalog_items_confidence_check check (match_confidence in ('low', 'medium', 'high')),
  constraint nutrition_catalog_items_calories_check check (calories >= 0 and calories not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_protein_check check (protein_g >= 0 and protein_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_carbs_check check (carbs_g >= 0 and carbs_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_fat_check check (fat_g >= 0 and fat_g not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  constraint nutrition_catalog_items_user_source_check check (not user_confirmed or source in ('user', 'barcode-memory'))
);

-- Supports the exact identity lookup and conflict target; aliases use the GIN index.
create index nutrition_catalog_items_aliases_idx on public.nutrition_catalog_items using gin (aliases);

alter table public.nutrition_catalog_items enable row level security;
revoke all on table public.nutrition_catalog_items from public, anon, authenticated;
grant select, insert, update, delete on table public.nutrition_catalog_items to authenticated;

create trigger set_nutrition_catalog_items_updated_at
before update on public.nutrition_catalog_items
for each row execute function public.set_updated_at();

create policy "Users can view own nutrition catalog items"
on public.nutrition_catalog_items for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own nutrition catalog items"
on public.nutrition_catalog_items for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own nutrition catalog items"
on public.nutrition_catalog_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own nutrition catalog items"
on public.nutrition_catalog_items for delete to authenticated
using ((select auth.uid()) = user_id);
