export type MacroMealMode = "manual" | "text-ai" | "photo-ai" | "ingredients";

export function getMealLogReturnPath(returnTo: unknown, mealMode: unknown) {
  const base = returnTo === "/macros" ? "/macros" : "/dashboard";
  return base === "/macros" && ["text-ai", "photo-ai"].includes(String(mealMode)) ? `/macros?mealMode=${mealMode}` : base;
}

type ModeMessage = {
  errorMessage: string | null;
  successMessage: string | null;
};

export type MacroModeMessages = {
  manual: ModeMessage;
  textAi: ModeMessage;
  photoAi: ModeMessage;
  ingredients: ModeMessage;
};

export function resolveMacroMealMode(value: string | undefined): MacroMealMode {
  if (value === "text-ai" || value === "photo-ai" || value === "ingredients") return value;
  return "manual";
}

export function getMacroModeMessages(input: {
  mode: MacroMealMode;
  genericErrorMessage: string | null;
  genericSuccessMessage: string | null;
  ingredientErrorMessage: string | null;
  ingredientSuccessMessage: string | null;
}): MacroModeMessages {
  const empty = (): ModeMessage => ({ errorMessage: null, successMessage: null });
  const messages: MacroModeMessages = {
    manual: empty(),
    textAi: empty(),
    photoAi: empty(),
    ingredients: empty(),
  };

  if (input.mode === "ingredients") {
    messages.ingredients = {
      errorMessage: input.ingredientErrorMessage,
      successMessage: input.ingredientSuccessMessage,
    };
    return messages;
  }

  const modeMessages = {
    errorMessage: input.genericErrorMessage,
    successMessage: input.genericSuccessMessage,
  };

  if (input.mode === "text-ai") messages.textAi = modeMessages;
  else if (input.mode === "photo-ai") messages.photoAi = modeMessages;
  else messages.manual = modeMessages;

  return messages;
}
