import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  filterRecipeMatches,
  matchRecipesToInventory,
  normalizeRecipeFilterMode,
  sortRecipeMatches,
  type RecipeFilterMode,
  type RecipeIngredient,
  type RecipeInventoryItem,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";

export const dynamic = "force-dynamic";

type RecipesPageSearchParams = { mode?: string };

type RecipeTemplateRow = Omit<RecipeTemplate, "instructions" | "recipe_ingredients"> & {
  instructions: unknown;
  recipe_ingredients: RecipeIngredient[] | null;
};

const filterLinks: { mode: RecipeFilterMode; label: string }[] = [
  { mode: "all", label: "Todas" },
  { mode: "available", label: "Puedo cocinar" },
  { mode: "quick", label: "15 minutos" },
  { mode: "urgent", label: "Usar antes" },
];

const ingredientStatusMessages = {
  available: "Disponible.",
  missing: "No está en tu inventario.",
  insufficient: "No tienes cantidad suficiente.",
  incompatible: "Revisa la unidad del producto en el inventario.",
  expired: "El producto coincidente está caducado.",
};

function getSafeInstructions(recipe: RecipeTemplateRow): string[] {
  if (!Array.isArray(recipe.instructions)) {
    console.warn("Recipe catalog row has invalid instructions:", recipe.slug);
    return [];
  }

  const instructions = recipe.instructions.filter((instruction): instruction is string => typeof instruction === "string" && instruction.trim().length > 0);

  if (instructions.length !== recipe.instructions.length || instructions.length === 0) {
    console.warn("Recipe catalog row has unsafe instructions:", recipe.slug);
  }

  return instructions;
}

function toRecipeTemplate(row: RecipeTemplateRow): RecipeTemplate | null {
  const instructions = getSafeInstructions(row);
  if (instructions.length === 0) return null;

  return {
    ...row,
    instructions,
    recipe_ingredients: [...(row.recipe_ingredients ?? [])].sort((first, second) => first.sort_order - second.sort_order),
  };
}

function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return "";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(quantity);
}

export default async function RecipesPage({ searchParams }: { searchParams?: Promise<RecipesPageSearchParams> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "recipes");
  const resolvedSearchParams = await searchParams;
  const mode = normalizeRecipeFilterMode(resolvedSearchParams?.mode);
  const todayKey = new Date().toISOString().slice(0, 10);

  const { data: inventoryData, error: inventoryError } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at")
    .eq("user_id", user.id)
    .gt("quantity", 0) as { data: RecipeInventoryItem[] | null; error: { message: string } | null };

  const { data: recipeData, error: recipeError } = await (supabase as any)
    .from("recipe_templates")
    .select("id, slug, title, description, prep_minutes, servings, instructions, recipe_ingredients(id, recipe_id, display_name, match_terms, required_quantity, required_unit, is_required, sort_order)")
    .order("title", { ascending: true }) as { data: RecipeTemplateRow[] | null; error: { message: string } | null };

  if (inventoryError) {
    console.warn("Supabase could not load recipe inventory items:", inventoryError.message);
  }

  if (recipeError) {
    console.warn("Supabase could not load recipe catalog:", recipeError.message);
  }

  const inventoryItems = inventoryError ? [] : inventoryData ?? [];
  const recipes = (recipeError ? [] : recipeData ?? []).map(toRecipeTemplate).filter((recipe): recipe is RecipeTemplate => Boolean(recipe));
  const matches = filterRecipeMatches(sortRecipeMatches(matchRecipesToInventory(recipes, inventoryItems, todayKey)), mode);

  return (
    <main className="container">
      <section className="card">
        <p><Link href="/dashboard">← Volver al dashboard</Link></p>
        <h1>Recetas con tu inventario</h1>
        <p className="muted">Encuentra recetas según lo que tienes disponible, el tiempo que quieres cocinar y los productos que conviene usar pronto.</p>
        <p><Link className="button nav-button" href="/inventory">Gestionar inventario</Link></p>
        <nav className="nav-list" aria-label="Filtros de recetas">
          {filterLinks.map((filter) => (
            <Link key={filter.mode} className="button nav-button" aria-current={mode === filter.mode ? "page" : undefined} href={`/recipes?mode=${filter.mode}`}>
              {filter.label}
            </Link>
          ))}
        </nav>
      </section>

      {inventoryItems.length === 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <p className="muted">Añade productos al inventario para saber qué recetas puedes preparar.</p>
        </section>
      ) : null}

      {recipes.length === 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <p className="muted">No hay recetas disponibles en el catálogo.</p>
        </section>
      ) : null}

      <section className="grid cards" style={{ marginTop: 16 }}>
        {matches.map((match) => (
          <article className="card" key={match.recipe.id}>
            <h2>{match.recipe.title}</h2>
            <p className="muted">{match.recipe.description}</p>
            <p>{match.recipe.prep_minutes} minutos · {match.recipe.servings} ración{match.recipe.servings === 1 ? "" : "es"}</p>
            <p><strong>{match.canCookNow ? "Puedes cocinarla ahora." : "Te faltan productos o cantidades."}</strong></p>
            {match.urgentItemCount > 0 ? <p>Usa pronto {match.urgentItemCount} producto{match.urgentItemCount === 1 ? "" : "s"}.</p> : null}
            {match.recipe.prep_minutes <= 15 ? <p>Lista en 15 minutos.</p> : null}

            <h3>Ingredientes</h3>
            <ul>
              {match.ingredientMatches.map((ingredientMatch) => (
                <li key={ingredientMatch.ingredient.id}>
                  <strong>{ingredientMatch.ingredient.display_name}</strong>: {formatQuantity(ingredientMatch.ingredient.required_quantity)} {ingredientMatch.ingredient.required_unit} · {ingredientStatusMessages[ingredientMatch.status]}
                </li>
              ))}
            </ul>

            <details>
              <summary>Instrucciones</summary>
              <ol>
                {match.recipe.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
              </ol>
            </details>
          </article>
        ))}
      </section>
    </main>
  );
}
