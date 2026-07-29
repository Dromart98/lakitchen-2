import Link from "next/link";

import { cookRecipeAndLogMealAction } from "@/app/recipes/actions";
import { RecipeAiGenerator } from "@/components/recipes/RecipeAiGenerator";
import { SavedAiRecipes } from "@/components/recipes/SavedAiRecipes";
import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { selectInventoryUnitMeasures } from "@/modules/inventory/inventory-unit-equivalence";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/modules/meals/meal-types";
import {
  matchRecipesToInventory,
  attachRecipeInventoryUnitMeasures,
  normalizeRecipeFilterMode,
  sortRecipeMatches,
  type RecipeFilterMode,
  type RecipeIngredient,
  type RecipeInventoryItem,
  type RecipeInventoryItemRow,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";
import type { RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";
import { buildRecipeMatchWithServingOptions, filterRecipeMatchesWithServingOptions, getMaxUrgentItemCountForCookableServings } from "@/modules/recipes/recipe-servings";
import { toSavedAiRecipe, type SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";
import { buildRecipeCalorieBudget, isRecipeServingWithinCalorieBudget } from "@/modules/recipes/recipe-calorie-budget";
import { getTodayUtcDate } from "@/modules/meals/meal-date";

export const dynamic = "force-dynamic";

type RecipesPageSearchParams = { mode?: string; recipeSuccess?: string; recipeError?: string };

type RecipeTemplateRow = Omit<RecipeTemplate, "instructions" | "recipe_ingredients"> & {
  instructions: unknown;
  recipe_ingredients: RecipeIngredient[] | null;
};

type RecipesPageBudgetQuery = {
  select(columns: string): RecipesPageBudgetQuery;
  eq(column: string, value: string): RecipesPageBudgetQuery;
  maybeSingle(): Promise<unknown>;
};

type RecipesPageBudgetClient = { from(table: string): RecipesPageBudgetQuery };

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
  "invalid-servings": "Selecciona un número válido de raciones.",
  "calorie-budget-exceeded": "Esta receta supera las calorías que te quedan hoy. Elige otra opción.",
};

const ingredientStatusMessages = {
  available: "Disponible.",
  missing: "No está en tu inventario.",
  insufficient: "No tienes cantidad suficiente.",
  incompatible: "Revisa la unidad o las medidas habituales del producto.",
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
  const today = getTodayUtcDate();

  const [{ data: profileData, error: profileError }, { data: todayMealsData, error: todayMealsError }] = await Promise.all([
    (supabase as unknown as RecipesPageBudgetClient).from("user_nutrition_profiles").select("target_calories").eq("user_id", user.id).maybeSingle() as Promise<{ data: { target_calories: number | null } | null; error: { message: string } | null }>,
    (supabase as unknown as RecipesPageBudgetClient).from("daily_meal_logs").select("calories").eq("user_id", user.id).eq("consumed_on", today) as unknown as Promise<{ data: { calories: number | null }[] | null; error: { message: string } | null }>,
  ]);
  const calorieBudget = profileError || todayMealsError ? null : buildRecipeCalorieBudget(profileData?.target_calories ?? null, (todayMealsData ?? []).reduce((sum, meal) => sum + (meal.calories ?? 0), 0));

  const { data: inventoryData, error: inventoryError } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id, food_catalog_items!inventory_items_food_owner_fk(normalized_name, aliases)")
    .eq("user_id", user.id)
    .gt("quantity", 0) as { data: RecipeInventoryItemRow[] | null; error: { message: string } | null };

  const { data: savedRecipeData, error: savedRecipeError } = await (supabase as any)
    .from("user_saved_ai_recipes")
    .select("id, user_id, title, description, estimated_minutes, servings, steps, source_priority_mode, fingerprint, created_at, user_saved_ai_recipe_ingredients(id, recipe_id, user_id, inventory_item_id, name, quantity, unit, sort_order, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }) as { data: unknown[] | null; error: { message: string } | null };

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

  if (savedRecipeError) {
    console.warn("Supabase could not load saved AI recipes:", savedRecipeError.message);
  }

  const identityIds = [...new Set((inventoryData ?? []).map((row) => typeof row.food_catalog_item_id === "string" ? row.food_catalog_item_id : "").filter(Boolean))];
  let unitMeasures = new Map();
  if (!inventoryError && identityIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("food_quantity_equivalences")
      .select("id, food_catalog_item_id, user_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed, updated_at")
      .eq("user_id", user.id)
      .eq("measure_kind", "unit")
      .eq("user_confirmed", true)
      .eq("source", "user")
      .in("food_catalog_item_id", identityIds) as { data: unknown[] | null; error: { message: string } | null };
    if (error) console.warn("Supabase could not load recipe unit measures:", error.message);
    else unitMeasures = new Map(selectInventoryUnitMeasures(data ?? [], user.id, identityIds));
  }

  const savedRecipes = (savedRecipeError ? [] : savedRecipeData ?? []).reduce<SavedAiRecipe[]>((validRecipes, row) => {
    const recipe = toSavedAiRecipe(row);
    if (!recipe) {
      console.warn("Supabase returned an invalid saved AI recipe row.");
      return validRecipes;
    }
    validRecipes.push(recipe);
    return validRecipes;
  }, []);

  const inventoryItems: RecipeInventoryItem[] = inventoryError ? [] : attachRecipeInventoryUnitMeasures(inventoryData ?? [], unitMeasures);
  const recipes = (recipeError ? [] : recipeData ?? []).map(toRecipeTemplate).filter((recipe): recipe is RecipeTemplate => Boolean(recipe));
  const recipeMatchesWithServingOptions = sortRecipeMatches(matchRecipesToInventory(recipes, inventoryItems, todayKey))
    .map((match) => buildRecipeMatchWithServingOptions(match, inventoryItems, todayKey));
  const matches = filterRecipeMatchesWithServingOptions(recipeMatchesWithServingOptions, mode);

  return (
    <AppShell>
      <div className="recipes-page">
        <header className="recipes-header">
          <div className="recipes-header__copy">
            <p className="recipes-eyebrow">Recetas</p>
            <h1>Cocina con lo que ya tienes</h1>
            <p>LaKitchen combina tu inventario, el tiempo disponible y las caducidades para proponerte recetas que encajan con tu día.</p>
          </div>
          <div className="recipes-header__actions">
            <Link className="button recipes-secondary-action" href="/inventory">Gestionar inventario</Link>
          </div>
        </header>
        {calorieBudget ? <p className="muted">Te quedan {formatNutritionValue(calorieBudget.remainingCalories)} kcal hoy. Las recetas se validan por ración.</p> : <p className="muted">Completa tu perfil nutricional para validar las recetas contra tus calorías restantes.</p>}
        <div className="recipes-messages">
          {recipeSuccessMessage ? <p className="recipes-message recipes-message--success" role="status">{recipeSuccessMessage}</p> : null}
          {recipeErrorMessage ? <p className="recipes-message recipes-message--error" role="alert">{recipeErrorMessage}</p> : null}
        </div>

        <RecipeAiGenerator />

        <SavedAiRecipes recipes={savedRecipes} />

        <section className="recipes-section recipes-catalog" aria-labelledby="recipes-catalog-title">
          <div className="recipes-section__heading">
            <div>
              <p className="recipes-eyebrow">Catálogo</p>
              <h2 id="recipes-catalog-title">Recetas con tu inventario</h2>
              <p>Compara cada propuesta con tus existencias y elige la cantidad que quieres preparar.</p>
            </div>
            <nav className="recipes-filters" aria-label="Filtros de recetas">
              {filterLinks.map((filter) => (
                <Link key={filter.mode} className={`recipes-filter${mode === filter.mode ? " recipes-filter--active" : ""}`} aria-current={mode === filter.mode ? "page" : undefined} href={`/recipes?mode=${filter.mode}`}>
                  {filter.label}{mode === filter.mode ? <span className="recipes-filter__state">Seleccionado</span> : null}
                </Link>
              ))}
            </nav>
          </div>

          {inventoryItems.length === 0 ? (
            <div className="recipes-empty"><p>Añade productos al inventario para saber qué recetas puedes preparar.</p></div>
          ) : null}

          {recipes.length === 0 ? (
            <div className="recipes-empty"><p>No hay recetas disponibles en el catálogo.</p></div>
          ) : null}

          <div className="recipes-grid">
          {matches.map(({ match, servingOptions, maxCookableServings, loggableServingOptions }) => {
          const budgetedServingOptions = loggableServingOptions.filter((option) => !calorieBudget || isRecipeServingWithinCalorieBudget(option.nutrition!.perServing!.calories, calorieBudget));
          const hasCookableButUnloggableServings = servingOptions.some((option) => option.canCookNow && !option.canLog);
          const urgentItemCount = getMaxUrgentItemCountForCookableServings(servingOptions);
          const usedConfirmedUnitMeasure = servingOptions.some((option) => option.usedConfirmedUnitMeasure)
            || match.ingredientMatches.some((ingredient) => ingredient.allocations.some((allocation) => allocation.usedConfirmedUnitMeasure));

          return (
          <article className="recipes-card" key={match.recipe.id}>
            <header className="recipes-card__header">
              <h3>{match.recipe.title}</h3>
              <p>{match.recipe.description}</p>
              <p className="recipes-card__meta">{match.recipe.prep_minutes} minutos · {match.recipe.servings} ración{match.recipe.servings === 1 ? "" : "es"}</p>
            </header>
            <div className="recipes-card__badges">
              <p className={maxCookableServings > 0 ? "recipes-badge recipes-badge--available" : "recipes-badge"}><strong>{maxCookableServings > 0 ? "Puedes cocinarla ahora." : "Te faltan productos o cantidades."}</strong></p>
            {maxCookableServings > 0 ? (
              <p className="recipes-badge">Puedes preparar hasta {maxCookableServings} de {match.recipe.servings} ración{match.recipe.servings === 1 ? "" : "es"}.</p>
            ) : null}
            {urgentItemCount > 0 ? <p className="recipes-badge recipes-badge--urgent">Usa pronto {urgentItemCount} producto{urgentItemCount === 1 ? "" : "s"}.</p> : null}
            {match.recipe.prep_minutes <= 15 ? <p className="recipes-badge">Lista en 15 minutos.</p> : null}
            </div>
            {usedConfirmedUnitMeasure ? <p className="muted">Se ha usado una medida habitual guardada para calcular las cantidades. <Link href="/inventory/equivalences">Revisar medidas habituales</Link></p> : null}

            {budgetedServingOptions.length > 0 ? (
              <section className="recipes-card__nutrition">
                <h4>Nutrición estimada</h4>
                <ul>
                  {budgetedServingOptions.map((option) => (
                    <li key={option.servings}>
                      {option.servings} ración{option.servings === 1 ? "" : "es"}: {formatNutritionLine(option.nutrition!.total!)}
                    </li>
                  ))}
                </ul>
                <p>Estimación basada en los valores nutricionales guardados en tu inventario.</p>
              </section>
            ) : maxCookableServings > 0 ? (
              <p className="muted">{calorieBudget && loggableServingOptions.length > 0 ? "Esta receta supera las calorías que te quedan hoy. Elige otra opción." : "Puedes preparar esta receta, pero faltan datos nutricionales en alguno de los productos necesarios para registrarla."}</p>
            ) : null}

            {hasCookableButUnloggableServings && budgetedServingOptions.length > 0 ? (
              <p className="muted">Algunas cantidades no están disponibles para registrar porque requieren productos sin datos nutricionales completos.</p>
            ) : null}

            {budgetedServingOptions.length > 0 ? (
              <form className="recipes-card__form" action={cookRecipeAndLogMealAction}>
                <input type="hidden" name="recipe_id" value={match.recipe.id} />
                <input type="hidden" name="mode" value={mode} />
                <label htmlFor={`servings-${match.recipe.id}`}>Raciones a preparar</label>
                <select id={`servings-${match.recipe.id}`} name="servings" defaultValue="1">
                  {budgetedServingOptions.map((option) => (
                    <option key={option.servings} value={option.servings}>{option.servings} ración{option.servings === 1 ? "" : "es"}</option>
                  ))}
                </select>
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

            <details className="recipes-card__details">
              <summary>Ingredientes</summary>
              <ul className="recipes-card__ingredients">
                {match.ingredientMatches.map((ingredientMatch) => (
                  <li key={ingredientMatch.ingredient.id}>
                    <strong>{ingredientMatch.ingredient.display_name}: {formatQuantity(ingredientMatch.ingredient.required_quantity)} {ingredientMatch.ingredient.required_unit}</strong>
                    <span>{ingredientStatusMessages[ingredientMatch.status]}</span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="recipes-card__details">
              <summary>Instrucciones</summary>
              <ol>
                {match.recipe.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
              </ol>
            </details>
          </article>
          );
        })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
