import { deleteSavedAiRecipeAction } from "@/app/recipes/actions";
import { SavedAiRecipeCookForm } from "@/components/recipes/SavedAiRecipeCookForm";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(quantity);
}

function formatSavedDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SavedAiRecipes({ recipes }: { recipes: SavedAiRecipe[] }) {
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Mis recetas guardadas</h2>
      {recipes.length === 0 ? <p className="muted">Todavía no has guardado ninguna receta generada por IA.</p> : null}
      {recipes.map((recipe) => (
        <article className="card" key={recipe.id} style={{ marginTop: 16 }}>
          <p className="muted">{recipe.source_priority_mode === "expiration" ? "Guardada desde modo antidesperdicio" : "Receta equilibrada"}</p>
          <h3>{recipe.title}</h3>
          <p>{recipe.description}</p>
          <p>{recipe.estimated_minutes} minutos · {recipe.servings} ración{recipe.servings === 1 ? "" : "es"}</p>
          <p className="muted">Guardada el {formatSavedDate(recipe.created_at)}</p>
          <h4>Ingredientes</h4>
          <ul>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.name}: {formatQuantity(ingredient.quantity)} {ingredient.unit}</li>
            ))}
          </ul>
          <h4>Preparación</h4>
          <ol>
            {recipe.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <SavedAiRecipeCookForm recipeId={recipe.id} />
          <form action={deleteSavedAiRecipeAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="recipe_id" value={recipe.id} />
            <button type="submit">Eliminar receta</button>
          </form>
        </article>
      ))}
    </section>
  );
}
