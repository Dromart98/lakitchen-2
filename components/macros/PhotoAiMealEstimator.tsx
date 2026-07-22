"use client";

import { useEffect, useRef, useState } from "react";
import { estimatePhotoMealAction } from "@/app/macros/actions";
import { AiMealEstimationPreview } from "@/components/macros/AiMealEstimationPreview";
import { calculateTextMealTotals, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";
import type { MealBuilderInventoryItem } from "@/modules/meals/meal-builder";

type State = "idle" | "processing" | "ready" | "estimating" | "success" | "needs-clarification" | "error";
type PhotoAiMealEstimatorProps = {
  errorMessage?: string | null;
  successMessage?: string | null;
  items: MealBuilderInventoryItem[];
  inventoryUnavailable: boolean;
};

const errors: Record<string, string> = { "invalid-photo": "La fotografía no es válida.", "unsupported-photo": "Envía una fotografía JPEG, PNG o WebP.", "photo-too-large": "La fotografía preparada supera 5 MB.", "photo-processing-failed": "No se pudo preparar la fotografía. Elige otra.", unauthenticated: "Tu sesión ha caducado.", "missing-api-key": "El análisis no está disponible ahora.", "provider-timeout": "El análisis tardó demasiado.", "provider-error": "No se pudo analizar la fotografía.", "invalid-ai-response": "No se pudo validar la estimación.", "unexpected-error": "Ocurrió un error inesperado." };
async function prepare(file: File) { let bitmap: ImageBitmap | null = null; try { bitmap = await createImageBitmap(file); const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .85)); if (!blob) throw new Error("jpeg"); return new File([blob], "meal.jpg", { type: "image/jpeg" }); } finally { bitmap?.close(); } }

export function PhotoAiMealEstimator({ errorMessage, successMessage, items, inventoryUnavailable }: PhotoAiMealEstimatorProps) {
  const [state, setState] = useState<State>("idle"); const [photo, setPhoto] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [context, setContext] = useState(""); const [result, setResult] = useState<TextMealEstimationResult | null>(null);
  const input = useRef<HTMLInputElement>(null); const requestVersion = useRef(0); const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; requestVersion.current += 1; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function clearPhoto() { requestVersion.current += 1; setResult(null); setPhoto(null); setPreview((value) => { if (value) URL.revokeObjectURL(value); return null; }); }
  function resetInput() { if (input.current) input.current.value = ""; }
  async function choose(file?: File) {
    clearPhoto(); const version = requestVersion.current; resetInput();
    if (!file) { setState("idle"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setState("error"); setResult({ status: "error", code: "unsupported-photo" }); return; }
    setState("processing");
    try { const processed = await prepare(file); if (processed.size > 5 * 1024 * 1024) { setState("error"); setResult({ status: "error", code: "photo-too-large" }); return; } if (!mounted.current || version !== requestVersion.current) return; const url = URL.createObjectURL(processed); setPhoto(processed); setPreview(url); setState("ready"); }
    catch { if (!mounted.current || version !== requestVersion.current) return; setState("error"); setResult({ status: "error", code: "photo-processing-failed" }); }
  }
  function remove() { clearPhoto(); resetInput(); setState("idle"); }
  function changeContext(value: string) { requestVersion.current += 1; setContext(value); setResult(null); if (photo) setState("ready"); }
  async function submit() { if (state !== "ready" || !photo) return; const version = ++requestVersion.current; setResult(null); setState("estimating"); const data = new FormData(); data.set("photo", photo); data.set("context", context); try { const next = await estimatePhotoMealAction(data); if (!mounted.current || version !== requestVersion.current) return; setResult(next); setState(next.status === "success" ? "success" : next.status === "needs-clarification" ? "needs-clarification" : "error"); } catch { if (!mounted.current || version !== requestVersion.current) return; setResult({ status: "error", code: "unexpected-error" }); setState("error"); } }
  const success = result?.status === "success" ? result : null;
  function updateIngredient(index: number, field: "display_name" | "quantity" | "unit" | "calories" | "protein_g" | "carbs_g" | "fat_g", value: string) {
    if (!success) return;
    const ingredients = success.ingredients.map((ingredient, itemIndex) => {
      if (itemIndex !== index) return ingredient;
      if (field === "quantity") {
        const quantity = Number(value);
        if (!Number.isFinite(quantity) || quantity <= 0) return ingredient;
        const ratio = quantity / ingredient.quantity;
        return { ...ingredient, quantity, calories: Math.round(ingredient.calories * ratio * 10) / 10, protein_g: Math.round(ingredient.protein_g * ratio * 10) / 10, carbs_g: Math.round(ingredient.carbs_g * ratio * 10) / 10, fat_g: Math.round(ingredient.fat_g * ratio * 10) / 10 };
      }
      if (field === "display_name") return { ...ingredient, display_name: value, name: value, normalized_name: value.trim().toLowerCase() || ingredient.normalized_name };
      if (field === "unit") return { ...ingredient, unit: value as typeof ingredient.unit };
      const macro = Number(value);
      return Number.isFinite(macro) && macro >= 0 ? { ...ingredient, [field]: macro } : ingredient;
    });
    const total = calculateTextMealTotals(ingredients);
    if (total) setResult({ ...success, ingredients, total });
  }
  function removeIngredient(index: number) { if (!success || success.ingredients.length === 1) return; const ingredients = success.ingredients.filter((_, itemIndex) => itemIndex !== index); const total = calculateTextMealTotals(ingredients); if (total) setResult({ ...success, ingredients, total }); }
  function addIngredient() { if (!success || success.ingredients.length >= 20) return; const ingredients = [...success.ingredients, { normalized_name: "ingrediente añadido", display_name: "Ingrediente añadido", name: "Ingrediente añadido", quantity: 1, unit: "unidad" as const, preparation: null, confidence: "low" as const, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }]; const total = calculateTextMealTotals(ingredients); if (total) setResult({ ...success, ingredients, total }); }
  return <div className="photo-ai-estimator">{errorMessage ? <p className="auth-message error" role="alert">{errorMessage}</p> : null}{successMessage ? <p className="auth-message success" role="status">{successMessage}</p> : null}<p className="photo-ai-privacy">La fotografía se envía al servicio de análisis, pero no se guarda en LaKitchen.</p><label className="field" htmlFor="photo-ai-file"><span>Fotografía de la comida</span><input ref={input} id="photo-ai-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} disabled={state === "estimating"} /><small>JPEG, PNG o WebP. Se convierte a JPEG; máximo 5 MB tras prepararla.</small></label>{photo && preview ? <div className="photo-ai-preview"><img src={preview} alt="Vista previa de la comida seleccionada" /><p>{photo.name}</p><button type="button" className="button button-secondary" onClick={remove} disabled={state === "estimating"}>Quitar o sustituir imagen</button></div> : null}<label className="field" htmlFor="photo-ai-context"><span>Información adicional</span><textarea id="photo-ai-context" value={context} maxLength={500} onChange={(event) => changeContext(event.target.value)} disabled={state === "estimating"} placeholder="El pollo pesa aproximadamente 200 g y lleva una cucharada de aceite." /><small className="text-ai-counter">{context.length}/500</small></label><p aria-live="polite" className="photo-ai-status">{state === "processing" ? "Preparando fotografía…" : state === "estimating" ? "Analizando comida…" : state === "ready" ? "Fotografía lista para analizar." : ""}</p><button type="button" className="button" onClick={submit} disabled={state !== "ready" || !photo}>Analizar fotografía</button>{state === "needs-clarification" && result?.status === "needs-clarification" ? <p className="auth-message error" role="alert">{result.message}</p> : null}{state === "error" && result?.status === "error" ? <p className="auth-message error" role="alert">{errors[result.code]}</p> : null}{success ? <section className="text-ai-preview"><h3>Revisa los ingredientes detectados</h3><p className="muted">Las cantidades son aproximadas. Puedes corregirlas antes de registrar.</p>{success.ingredients.map((ingredient,index)=><div className="text-ai-ingredients" key={`${ingredient.normalized_name}-${index}`}><label className="field"><span>Ingrediente</span><input value={ingredient.display_name} onChange={(event)=>updateIngredient(index,"display_name",event.target.value)} /></label><label className="field"><span>Cantidad</span><input type="number" min="0.01" step="0.01" value={ingredient.quantity} onChange={(event)=>updateIngredient(index,"quantity",event.target.value)} /></label><label className="field"><span>Unidad</span><select value={ingredient.unit} onChange={(event)=>updateIngredient(index,"unit",event.target.value)}>{["g","ml","unidad","unidades","loncha","lonchas","cucharadita","cucharaditas","cucharada","cucharadas","taza","tazas","lata","latas","plato","platos"].map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label><div className="text-ai-totals">{([[["calories","kcal"],["protein_g","Proteína (g)"],["carbs_g","Carbohidratos (g)"],["fat_g","Grasa (g)"]] as const]).flat().map(([field,label])=><label className="field" key={field}><span>{label}</span><input type="number" min="0" step="0.1" value={ingredient[field]} onChange={(event)=>updateIngredient(index,field,event.target.value)} /></label>)}</div><button type="button" className="button button-secondary" onClick={()=>removeIngredient(index)} disabled={success.ingredients.length===1}>Eliminar ingrediente</button></div>)}<button type="button" className="button button-secondary" onClick={addIngredient} disabled={success.ingredients.length>=20}>Añadir ingrediente</button></section> : null}{success ? <AiMealEstimationPreview result={success} mealMode="photo-ai" warning="La foto y las cantidades visibles pueden no reflejar todos los ingredientes o porciones." items={items} inventoryUnavailable={inventoryUnavailable} /> : null}</div>;
}
