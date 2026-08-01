"use client";

import { useRef, useState, useTransition } from "react";

import type { CreateSavedAiRecipeCookedBatchResult } from "@/modules/recipes/saved-ai-recipe-batch-creation";

type CreateAction = (input: { requestId: string }) => Promise<CreateSavedAiRecipeCookedBatchResult>;

const ERROR_MESSAGES: Record<string, string> = {
  "measurement-conflict": "La medición cambió mientras la revisabas. Comprueba los pesos y las raciones.",
  "measurement-required": "Confirma el peso previo, el peso cocinado y las raciones antes de continuar.",
  "nutrition-unavailable": "Revisa la nutrición de los productos indicados antes de cocinar.",
  "insufficient-stock": "Ya no tienes cantidad suficiente para cocinar esta receta.",
  "expired-item": "Revisa los productos caducados antes de cocinar esta receta.",
};

export function SavedAiRecipeBatchForm({ action }: { action: CreateAction }) {
  const requestId = useRef(crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!confirmed || pending) return;
    setResult(null);
    startTransition(async () => {
      const response = await action({ requestId: requestId.current });
      if (response.status === "success") {
        requestId.current = crypto.randomUUID();
        setConfirmed(false);
        setResult({ kind: "success", message: "La receta se ha guardado como comida cocinada." });
        return;
      }
      setResult({ kind: "error", message: ERROR_MESSAGES[response.code] ?? "No se pudo guardar la comida cocinada. Comprueba los datos e inténtalo de nuevo." });
    });
  }

  return <div className="cooked-batch-form">
    <label className="cooked-batch-form__confirmation">
      <input type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>Confirmo que quiero descontar del inventario los ingredientes y guardar el resultado como lote.</span>
    </label>
    <button type="button" disabled={!confirmed || pending} onClick={submit}>{pending ? "Guardando lote…" : "Cocinar y guardar lote"}</button>
    {result ? <p className={result.kind === "error" ? "cooking-yield-preview__error" : "cooking-yield-preview__success"} role={result.kind === "error" ? "alert" : "status"}>{result.message}</p> : null}
  </div>;
}
