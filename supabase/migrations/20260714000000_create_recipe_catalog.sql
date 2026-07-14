create table public.recipe_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  prep_minutes integer not null,
  servings integer not null default 1,
  instructions jsonb not null,
  created_at timestamptz not null default now(),
  constraint recipe_templates_slug_kebab_case check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint recipe_templates_title_not_blank check (btrim(title) <> ''),
  constraint recipe_templates_title_length check (char_length(title) <= 120),
  constraint recipe_templates_description_not_blank check (btrim(description) <> ''),
  constraint recipe_templates_description_length check (char_length(description) <= 500),
  constraint recipe_templates_prep_minutes_range check (prep_minutes between 1 and 240),
  constraint recipe_templates_servings_range check (servings between 1 and 20),
  constraint recipe_templates_instructions_array check (jsonb_typeof(instructions) = 'array'),
  constraint recipe_templates_instructions_length check (jsonb_array_length(instructions) between 1 and 20)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe_templates(id) on delete cascade,
  display_name text not null,
  match_terms text[] not null,
  required_quantity numeric not null,
  required_unit text not null,
  is_required boolean not null default true,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint recipe_ingredients_display_name_not_blank check (btrim(display_name) <> ''),
  constraint recipe_ingredients_display_name_length check (char_length(display_name) <= 100),
  constraint recipe_ingredients_match_terms_not_empty check (array_length(match_terms, 1) >= 1),
  constraint recipe_ingredients_required_quantity_positive check (required_quantity > 0 and required_quantity <> 'Infinity'::numeric and required_quantity <> '-Infinity'::numeric),
  constraint recipe_ingredients_required_unit_allowed check (required_unit in ('g', 'kg', 'ml', 'l', 'ud')),
  constraint recipe_ingredients_sort_order_range check (sort_order between 1 and 50),
  constraint recipe_ingredients_recipe_sort_order_unique unique (recipe_id, sort_order)
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);
create index recipe_templates_prep_minutes_idx on public.recipe_templates (prep_minutes);

alter table public.recipe_templates enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "Authenticated users can read recipe templates"
  on public.recipe_templates for select to authenticated using (true);

create policy "Authenticated users can read recipe ingredients"
  on public.recipe_ingredients for select to authenticated using (true);

revoke all on table public.recipe_templates from public, anon, authenticated;
revoke all on table public.recipe_ingredients from public, anon, authenticated;
grant select on table public.recipe_templates to authenticated;
grant select on table public.recipe_ingredients to authenticated;

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('pasta-con-pollo-y-tomate', 'Pasta con pollo y tomate', 'Pasta sencilla con pollo dorado y salsa de tomate para una comida completa.', 25, 1, '["Cuece la pasta hasta que esté al dente.", "Dora el pollo en una sartén caliente.", "Añade el tomate y cocina unos minutos.", "Mezcla la pasta con la salsa y sirve caliente."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Pasta', ARRAY['pasta','macarrones','espagueti','espaguetis'], 80::numeric, 'g', 1::smallint),
  ('Pollo', ARRAY['pollo','pechuga pollo','pechuga de pollo','solomillo pollo','solomillo de pollo'], 120::numeric, 'g', 2::smallint),
  ('Tomate', ARRAY['tomate','tomates','salsa tomate','salsa de tomate'], 120::numeric, 'g', 3::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('wrap-integral-de-pollo-y-verduras', 'Wrap integral de pollo y verduras', 'Wrap rápido con pollo, lechuga y tomate para una comida ligera.', 15, 1, '["Calienta la tortilla integral unos segundos.", "Coloca el pollo cocinado en el centro.", "Añade lechuga y tomate en tiras.", "Enrolla el wrap y córtalo por la mitad."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Tortilla integral', ARRAY['tortilla integral','wrap integral','tortilla de trigo integral'], 1::numeric, 'ud', 1::smallint),
  ('Pollo', ARRAY['pollo','pechuga pollo','pechuga de pollo','solomillo pollo','solomillo de pollo'], 100::numeric, 'g', 2::smallint),
  ('Lechuga', ARRAY['lechuga','hojas de lechuga'], 40::numeric, 'g', 3::smallint),
  ('Tomate', ARRAY['tomate','tomates'], 60::numeric, 'g', 4::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('arroz-con-pollo-y-verduras', 'Arroz con pollo y verduras', 'Plato básico de arroz con pollo y verduras salteadas.', 30, 1, '["Cuece el arroz hasta que esté tierno.", "Dora el pollo cortado en trozos.", "Saltea las verduras y mezcla con el arroz.", "Ajusta el punto de sal y sirve."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Arroz', ARRAY['arroz','arroz blanco','arroz largo'], 80::numeric, 'g', 1::smallint),
  ('Pollo', ARRAY['pollo','pechuga pollo','pechuga de pollo','solomillo pollo','solomillo de pollo'], 120::numeric, 'g', 2::smallint),
  ('Zanahoria', ARRAY['zanahoria','zanahorias'], 60::numeric, 'g', 3::smallint),
  ('Pimiento', ARRAY['pimiento','pimientos','pimiento rojo','pimiento verde'], 60::numeric, 'g', 4::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('tilapia-con-papas', 'Tilapia con papas', 'Tilapia a la plancha con papas cocidas y un toque de limón.', 25, 1, '["Cuece las papas hasta que estén tiernas.", "Cocina la tilapia a la plancha por ambos lados.", "Añade limón al pescado.", "Sirve la tilapia junto a las papas."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Tilapia', ARRAY['tilapia','filete de tilapia','filetes de tilapia'], 150::numeric, 'g', 1::smallint),
  ('Papa', ARRAY['papa','papas','patata','patatas'], 220::numeric, 'g', 2::smallint),
  ('Limón', ARRAY['limon','limones','limón','limones frescos'], 1::numeric, 'ud', 3::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('garbanzos-salteados-con-verduras', 'Garbanzos salteados con verduras', 'Garbanzos rápidos salteados con verduras para una comida vegetal sencilla.', 15, 1, '["Escurre los garbanzos si vienen cocidos.", "Saltea las verduras en una sartén.", "Añade los garbanzos y calienta todo junto.", "Sirve cuando las verduras estén tiernas."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Garbanzos', ARRAY['garbanzos','garbanzo','garbanzos cocidos'], 180::numeric, 'g', 1::smallint),
  ('Calabacín', ARRAY['calabacin','calabacín','calabacines'], 100::numeric, 'g', 2::smallint),
  ('Pimiento', ARRAY['pimiento','pimientos','pimiento rojo','pimiento verde'], 70::numeric, 'g', 3::smallint),
  ('Cebolla', ARRAY['cebolla','cebollas'], 50::numeric, 'g', 4::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('tortilla-de-verduras', 'Tortilla de verduras', 'Tortilla simple con huevo y verduras salteadas.', 12, 1, '["Bate los huevos en un cuenco.", "Saltea las verduras troceadas.", "Añade el huevo batido y cuaja la tortilla.", "Dobla la tortilla y sirve caliente."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Huevo', ARRAY['huevo','huevos'], 2::numeric, 'ud', 1::smallint),
  ('Calabacín', ARRAY['calabacin','calabacín','calabacines'], 80::numeric, 'g', 2::smallint),
  ('Cebolla', ARRAY['cebolla','cebollas'], 40::numeric, 'g', 3::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);

WITH inserted_recipe AS (
  INSERT INTO public.recipe_templates (slug, title, description, prep_minutes, servings, instructions)
  VALUES ('pasta-de-lentejas-con-carne-y-tomate', 'Pasta de lentejas con carne y tomate', 'Pasta de lentejas con carne picada y tomate para una comida saciante.', 25, 1, '["Cuece la pasta de lentejas según el paquete.", "Dora la carne picada en una sartén.", "Añade el tomate y cocina hasta espesar.", "Mezcla la pasta con la salsa y sirve."]'::jsonb)
  RETURNING id
)
INSERT INTO public.recipe_ingredients (recipe_id, display_name, match_terms, required_quantity, required_unit, sort_order)
SELECT inserted_recipe.id, ingredient.display_name, ingredient.match_terms, ingredient.required_quantity, ingredient.required_unit, ingredient.sort_order
FROM inserted_recipe
CROSS JOIN (VALUES
  ('Pasta de lentejas', ARRAY['pasta de lentejas','macarrones de lentejas','espaguetis de lentejas'], 80::numeric, 'g', 1::smallint),
  ('Carne picada', ARRAY['carne picada','carne molida','carne picada ternera','carne picada de ternera'], 120::numeric, 'g', 2::smallint),
  ('Tomate', ARRAY['tomate','tomates','salsa tomate','salsa de tomate'], 120::numeric, 'g', 3::smallint)
) AS ingredient(display_name, match_terms, required_quantity, required_unit, sort_order);
