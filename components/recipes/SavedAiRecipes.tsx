import { deleteSavedAiRecipeAction } from "@/app/recipes/actions";
import { SavedAiRecipeBatchForm } from "@/components/recipes/SavedAiRecipeBatchForm";
import { CookingYieldPreview } from "@/components/recipes/CookingYieldPreview";
import type { SavedRecipeCookingYieldNutrition } from "@/modules/recipes/saved-ai-recipe-cooking-yield";
import type { SavedRecipeCookingYieldMeasurement } from "@/modules/recipes/saved-ai-recipe-cooking-yield-measurement";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(quantity);
}

function formatSavedDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export type SavedAiRecipeView = SavedAiRecipe & {
  usesConfirmedUnitMeasure: boolean;
  cookingYieldNutrition: SavedRecipeCookingYieldNutrition;
  cookingYieldMeasurement: SavedRecipeCookingYieldMeasurement | null;
  createBatch: ((input: { requestId: string }) => Promise<import("@/modules/recipes/saved-ai-recipe-batch-creation").CreateSavedAiRecipeCookedBatchResult>) | null;
};

export function SavedAiRecipes({ recipes }: { recipes: SavedAiRecipeView[] }) {
  return (
    <section className="recipes-section saved-recipes" aria-labelledby="saved-recipes-title">
      <div className="recipes-section__heading">
        <div>
          <p className="recipes-eyebrow">Tu colección</p>
          <h2 id="saved-recipes-title">Recetas guardadas</h2>
        </div>
      </div>
      {recipes.length === 0 ? <div className="recipes-empty"><p>Todavía no has guardado ninguna receta generada por IA.</p></div> : null}
      <div className="saved-recipes__grid">
      {recipes.map((recipe) => (
        <article className="saved-recipe" key={recipe.id}>
          <p className="recipes-eyebrow">{recipe.source_priority_mode === "expiration" ? "Guardada desde modo antidesperdicio" : "Receta equilibrada"}</p>
          <h3>{recipe.title}</h3>
          <p>{recipe.description}</p>
          <p className="recipes-card__meta">{recipe.estimated_minutes} minutos · {recipe.servings} ración{recipe.servings === 1 ? "" : "es"} · Guardada el {formatSavedDate(recipe.created_at)}</p>
          {recipe.usesConfirmedUnitMeasure ? <p className="muted">La nutrición actual usa una medida habitual guardada.</p> : null}
          <details className="recipes-card__details">
            <summary>Ingredientes</summary>
            <ul>{recipe.ingredients.map((ingredient) => <li key={ingredient.id}>{ingredient.name}: {formatQuantity(ingredient.quantity)} {ingredient.unit}</li>)}</ul>
          </details>
          <details className="recipes-card__details">
            <summary>Preparación</summary>
            <ol>{recipe.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </details>
          <CookingYieldPreview recipeId={recipe.id} nutrition={recipe.cookingYieldNutrition} initialMeasurement={recipe.cookingYieldMeasurement} />
          <div className="saved-recipe__actions">
            {recipe.createBatch ? <SavedAiRecipeBatchForm action={recipe.createBatch} /> : recipe.cookingYieldMeasurement === null ? <p className="cooking-yield-preview__notice">Confirma el peso previo, el peso cocinado y las raciones para poder guardar un lote.</p> : <p className="cooking-yield-preview__notice">Revisa la nutrición de {recipe.cookingYieldNutrition.status === "incomplete" ? recipe.cookingYieldNutrition.itemsToReview : 1} producto{recipe.cookingYieldNutrition.status === "incomplete" && recipe.cookingYieldNutrition.itemsToReview === 1 ? "" : "s"} antes de guardar un lote.</p>}
            <form className="saved-recipe__delete" action={deleteSavedAiRecipeAction}>
              <input type="hidden" name="recipe_id" value={recipe.id} />
              <button type="submit">Eliminar receta</button>
            </form>
          </div>
        </article>
      ))}
      </div>
    </section>
  );
}
