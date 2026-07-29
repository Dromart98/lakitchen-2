import { deleteSavedAiRecipeAction } from "@/app/recipes/actions";
import { SavedAiRecipeCookForm } from "@/components/recipes/SavedAiRecipeCookForm";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(quantity);
}

function formatSavedDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export type SavedAiRecipeView = SavedAiRecipe & { usesConfirmedUnitMeasure: boolean };

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
          <div className="saved-recipe__actions">
            <SavedAiRecipeCookForm recipeId={recipe.id} />
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
