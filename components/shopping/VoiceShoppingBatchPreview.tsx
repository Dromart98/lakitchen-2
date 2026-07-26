"use client";

import {
  getVoiceShoppingDraftReadiness,
  getVoiceShoppingDraftStatus,
  normalizeEditedVoiceShoppingDraftItem,
  type VoiceShoppingDraftItem,
} from "@/modules/shopping/voice-shopping-batch";

const issueLabels: Record<string, string> = {
  "quantity-missing": "Cantidad pendiente",
  "unit-missing": "Unidad pendiente",
  "package-size-missing": "Falta el tamaño del paquete",
  "ambiguous-product": "Corrige el nombre ambiguo",
  "low-confidence": "Revisa los valores estimados",
};

type VoiceShoppingBatchPreviewProps = {
  items: VoiceShoppingDraftItem[];
  onChange: (items: VoiceShoppingDraftItem[]) => void;
  submissionId: string | null;
  saving: boolean;
  onSave: () => void;
};

export function VoiceShoppingBatchPreview({
  items,
  onChange,
  submissionId,
  saving,
  onSave,
}: VoiceShoppingBatchPreviewProps) {
  function update(
    id: string,
    field: "name" | "quantity" | "unit",
    value: unknown,
  ) {
    onChange(items.map((item) => (
      item.client_id === id
        ? normalizeEditedVoiceShoppingDraftItem(item, field, value)
        : item
    )));
  }

  function acknowledge(id: string, checked: boolean) {
    onChange(items.map((item) => (
      item.client_id === id ? { ...item, review_acknowledged: checked } : item
    )));
  }

  const canSave = Boolean(submissionId)
    && items.length > 0
    && items.every((item) => getVoiceShoppingDraftReadiness(item).saveReady)
    && !saving;

  return (
    <section
      className="shopping-list-add"
      aria-live="polite"
      aria-labelledby="voice-shopping-preview-title"
    >
      <h3 id="voice-shopping-preview-title">Vista previa</h3>
      <p>{items.length} productos. Revísalos antes de añadirlos a la lista de compra.</p>

      {items.map((item) => {
        const readiness = getVoiceShoppingDraftReadiness(item);

        return (
          <article key={item.client_id}>
            <p><strong>{getVoiceShoppingDraftStatus(item)}</strong></p>
            <div className="shopping-list-add__form">
              <label className="field">
                <span>Nombre</span>
                <input
                  disabled={saving}
                  value={item.name}
                  maxLength={120}
                  onChange={(event) => update(item.client_id, "name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Cantidad</span>
                <input
                  disabled={saving}
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity ?? ""}
                  onChange={(event) => update(item.client_id, "quantity", event.target.value === "" ? null : Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>Unidad</span>
                <select
                  disabled={saving}
                  value={item.unit ?? ""}
                  onChange={(event) => update(item.client_id, "unit", event.target.value || null)}
                >
                  <option value="">Pendiente</option>
                  {['ud', 'g', 'kg', 'ml', 'l'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => onChange(items.filter((draft) => draft.client_id !== item.client_id))}
              >
                Eliminar
              </button>
            </div>

            {item.issues.length ? (
              <ul>{item.issues.map((issue) => <li key={issue}>{issueLabels[issue] ?? issue}</li>)}</ul>
            ) : (
              <p>Sin avisos pendientes.</p>
            )}
            {!readiness.structuralReady ? <p>Completa los campos y avisos estructurales para continuar.</p> : null}
            {readiness.requiresReview && readiness.structuralReady ? (
              <label>
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={Boolean(item.review_acknowledged)}
                  onChange={(event) => acknowledge(item.client_id, event.target.checked)}
                />{" "}
                He revisado este producto
              </label>
            ) : null}
          </article>
        );
      })}

      <button type="button" className="button" disabled={!canSave} onClick={onSave}>
        {saving ? "Añadiendo productos…" : `Añadir ${items.length} productos a la lista`}
      </button>
    </section>
  );
}
