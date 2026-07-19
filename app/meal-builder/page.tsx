import { redirect } from "next/navigation";

import { buildMealBuilderCompatibilityDestination } from "@/modules/meals/meal-builder";

export const dynamic = "force-dynamic";

type MealBuilderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Compatibility route for saved meal-builder URLs. */
export default async function MealBuilderPage({ searchParams }: MealBuilderPageProps) {
  redirect(buildMealBuilderCompatibilityDestination(await searchParams));
}
