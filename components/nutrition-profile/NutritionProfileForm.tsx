"use client";

import { useMemo, useState, useTransition } from "react";

import { saveNutritionProfileAction, type NutritionProfileActionState } from "@/app/nutrition-profile/actions";
import { calculateUserNutritionTargets, type UserNutritionActivityLevel, type UserNutritionGoal, type UserNutritionSex } from "@/modules/user-nutrition/calculator";

export type NutritionProfileFormValues = {
  age: number | "";
  sex: UserNutritionSex;
  height_cm: number | "";
  weight_kg: number | "";
  goal: UserNutritionGoal;
  activity_level: UserNutritionActivityLevel;
  target_calories: number | "";
  target_protein_g: number | "";
  target_carbs_g: number | "";
  target_fat_g: number | "";
};

type Props = { initialValues: NutritionProfileFormValues };

function readNumber(value: number | "") {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function NutritionProfileForm({ initialValues }: Props) {
  const [values, setValues] = useState(initialValues);
  const [state, setState] = useState<NutritionProfileActionState>({});
  const [isPending, startTransition] = useTransition();

  const calculatedTargets = useMemo(() => {
    const age = readNumber(values.age);
    const heightCm = readNumber(values.height_cm);
    const weightKg = readNumber(values.weight_kg);
    if (!age || !heightCm || !weightKg) return null;
    return calculateUserNutritionTargets({ age, sex: values.sex, heightCm, weightKg, goal: values.goal, activityLevel: values.activity_level });
  }, [values.activity_level, values.age, values.goal, values.height_cm, values.sex, values.weight_kg]);

  function setField(field: keyof NutritionProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value === "" ? "" : Number.isNaN(Number(value)) ? value : Number(value) }));
  }

  function applyCalculatedTargets() {
    if (!calculatedTargets) return;
    setValues((current) => ({
      ...current,
      target_calories: calculatedTargets.targetCalories,
      target_protein_g: calculatedTargets.targetProteinG,
      target_carbs_g: calculatedTargets.targetCarbsG,
      target_fat_g: calculatedTargets.targetFatG,
    }));
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const nextState = await saveNutritionProfileAction(formData);
      setState(nextState);
    });
  }

  return (
    <form action={submit} className="nutrition-form">
      <section className="card form-section">
        <h2>Datos personales</h2>
        <label className="field" htmlFor="age"><span>Edad</span><input id="age" name="age" type="number" min="13" max="120" required value={values.age} onChange={(event) => setField("age", event.target.value)} /></label>
        <label className="field" htmlFor="sex"><span>Sexo</span><select id="sex" name="sex" value={values.sex} onChange={(event) => setValues((current) => ({ ...current, sex: event.target.value as UserNutritionSex }))}><option value="male">Hombre</option><option value="female">Mujer</option></select></label>
        <label className="field" htmlFor="height_cm"><span>Altura (cm)</span><input id="height_cm" name="height_cm" type="number" min="100" max="250" step="0.1" required value={values.height_cm} onChange={(event) => setField("height_cm", event.target.value)} /></label>
        <label className="field" htmlFor="weight_kg"><span>Peso (kg)</span><input id="weight_kg" name="weight_kg" type="number" min="30" max="300" step="0.1" required value={values.weight_kg} onChange={(event) => setField("weight_kg", event.target.value)} /></label>
        <label className="field" htmlFor="goal"><span>Objetivo</span><select id="goal" name="goal" value={values.goal} onChange={(event) => setValues((current) => ({ ...current, goal: event.target.value as UserNutritionGoal }))}><option value="lose_fat">Perder grasa</option><option value="maintain">Mantener peso</option><option value="gain_muscle">Ganar músculo</option></select></label>
        <label className="field" htmlFor="activity_level"><span>Actividad</span><select id="activity_level" name="activity_level" value={values.activity_level} onChange={(event) => setValues((current) => ({ ...current, activity_level: event.target.value as UserNutritionActivityLevel }))}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
      </section>

      <section className="card form-section">
        <div className="section-heading"><div><h2>Objetivos diarios</h2><p className="muted">Se calculan automáticamente y puedes ajustarlos manualmente antes de guardar.</p></div><button className="button secondary" type="button" disabled={!calculatedTargets} onClick={applyCalculatedTargets}>Recalcular</button></div>
        {calculatedTargets ? <p className="pill">Estimado: {calculatedTargets.targetCalories} kcal · P {calculatedTargets.targetProteinG}g · C {calculatedTargets.targetCarbsG}g · G {calculatedTargets.targetFatG}g</p> : <p className="muted">Completa edad, altura y peso para ver el cálculo estimado.</p>}
        <label className="field" htmlFor="target_calories"><span>Calorías objetivo</span><input id="target_calories" name="target_calories" type="number" min="1" required value={values.target_calories} onChange={(event) => setField("target_calories", event.target.value)} /></label>
        <label className="field" htmlFor="target_protein_g"><span>Proteína objetivo (g)</span><input id="target_protein_g" name="target_protein_g" type="number" min="0" required value={values.target_protein_g} onChange={(event) => setField("target_protein_g", event.target.value)} /></label>
        <label className="field" htmlFor="target_carbs_g"><span>Carbohidratos objetivo (g)</span><input id="target_carbs_g" name="target_carbs_g" type="number" min="0" required value={values.target_carbs_g} onChange={(event) => setField("target_carbs_g", event.target.value)} /></label>
        <label className="field" htmlFor="target_fat_g"><span>Grasas objetivo (g)</span><input id="target_fat_g" name="target_fat_g" type="number" min="0" required value={values.target_fat_g} onChange={(event) => setField("target_fat_g", event.target.value)} /></label>
        {state.error ? <p className="auth-message error" role="alert">{state.error}</p> : null}
        {state.message ? <p className="auth-message success" role="status">{state.message}</p> : null}
        <button className="button" type="submit" disabled={isPending}>{isPending ? "Guardando..." : "Guardar perfil"}</button>
      </section>
    </form>
  );
}
