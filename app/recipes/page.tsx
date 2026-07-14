import Link from "next/link";

import { cookRecipeAndLogMealAction } from "@/app/recipes/actions";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/modules/meals/meal-types";
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
import { estimateRecipeNutrition, type RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";

export const dynamic = "force-dynamic";

type RecipesPageSearchParams = { mode?: string; recipeSuccess?: string; recipeError?: string };

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

const recipeSuccessMessages: Record<string, string> = {
  "recipe-cooked": "Receta cocinada y registrada correctamente.",
};

const recipeErrorMessages: Record<string, string> = {
  "recipe-not-found": "La receta no existe.",
  "recipe-not-cookable": "La receta ya no se puede cocinar con el inventario actual.",
  "insufficient-stock": "Ya no tienes cantidad suficiente para cocinar esta receta.",
  "incomplete-nutrition": "Faltan datos nutricionales completos en los productos utilizados.",
  "incompatible-nutrition-unit": "Algún producto tiene una unidad nutricional incompatible.",
  "consume-failed": "No se pudo registrar la receta.",
};

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

function formatNutritionValue(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function formatNutritionLine(values: NonNullable<RecipeNutritionEstimate["total"]>): string {
  return `${formatNutritionValue(values.calories)} kcal · ${formatNutritionValue(values.proteinG)} g proteínas · ${formatNutritionValue(values.carbsG)} g carbohidratos · ${formatNutritionValue(values.fatG)} g grasas`;
}

export default async function RecipesPage({ searchParams }: { searchParams?: Promise<RecipesPageSearchParams> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "recipes");
  const resolvedSearchParams = await searchParams;
  const mode = normalizeRecipeFilterMode(resolvedSearchParams?.mode);
  const recipeSuccessMessage = resolvedSearchParams?.recipeSuccess ? recipeSuccessMessages[resolvedSearchParams.recipeSuccess] : null;
  const recipeErrorMessage = resolvedSearchParams?.recipeError ? recipeErrorMessages[resolvedSearchParams.recipeError] : null;
  const todayKey = getCurrentInventoryExpirationDateKey();

  const { data: inventoryData, error: inventoryError } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g")
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
        {recipeSuccessMessage ? <p role="status">{recipeSuccessMessage}</p> : null}
        {recipeErrorMessage ? <p role="alert">{recipeErrorMessage}</p> : null}
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
        {matches.map((match) => {
          const nutrition = match.canCookNow
            ? estimateRecipeNutrition(match.ingredientMatches.flatMap((ingredientMatch) => ingredientMatch.allocations), match.recipe.servings)
            : null;

          return (
          <article className="card" key={match.recipe.id}>
            <h2>{match.recipe.title}</h2>
            <p className="muted">{match.recipe.description}</p>
            <p>{match.recipe.prep_minutes} minutos · {match.recipe.servings} ración{match.recipe.servings === 1 ? "" : "es"}</p>
            <p><strong>{match.canCookNow ? "Puedes cocinarla ahora." : "Te faltan productos o cantidades."}</strong></p>
            {match.urgentItemCount > 0 ? <p>Usa pronto {match.urgentItemCount} producto{match.urgentItemCount === 1 ? "" : "s"}.</p> : null}
            {match.recipe.prep_minutes <= 15 ? <p>Lista en 15 minutos.</p> : null}

            {nutrition ? (
              <section>
                <h3>Nutrición estimada</h3>
                {nutrition.isComplete && nutrition.total && nutrition.perServing ? (
                  <>
                    <p>Por receta: {formatNutritionLine(nutrition.total)}</p>
                    <p>Por ración: {formatNutritionLine(nutrition.perServing)}</p>
                  </>
                ) : (
                  <>
                    <p>No se puede calcular la nutrición completa porque faltan datos en {nutrition.missingNutritionItemCount} producto{nutrition.missingNutritionItemCount === 1 ? "" : "s"}.</p>
                    <p className="muted">Completa los datos nutricionales del inventario antes de registrar esta receta.</p>
                  </>
                )}
                <p className="muted">Estimación basada en los valores nutricionales guardados en tu inventario.</p>
              </section>
            ) : null}

            {match.canCookNow && nutrition?.isComplete ? (
              <form action={cookRecipeAndLogMealAction}>
                <input type="hidden" name="recipe_id" value={match.recipe.id} />
                <input type="hidden" name="mode" value={mode} />
                <label htmlFor={`meal-type-${match.recipe.id}`}>Tipo de comida</label>
                <select id={`meal-type-${match.recipe.id}`} name="meal_type" defaultValue="lunch">
                  {MEAL_TYPES.map((mealType) => (
                    <option key={mealType} value={mealType}>{MEAL_TYPE_LABELS[mealType]}</option>
                  ))}
                </select>
                <p className="muted">Se descontarán del inventario los ingredientes indicados y se registrará la comida.</p>
                <button type="submit">He cocinado esta receta</button>
              </form>
            ) : null}

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
          );
        })}
      </section>
    </main>
  );
}
