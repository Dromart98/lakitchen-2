"use client";

type InventoryNutritionCtaProps = {
  manageId: string;
  editId: string;
  nutritionControlId: string;
  nutritionButtonId: string;
};

export function InventoryNutritionCta({
  manageId,
  editId,
  nutritionControlId,
  nutritionButtonId,
}: InventoryNutritionCtaProps) {
  function openNutritionControls() {
    const manage = document.getElementById(manageId);
    const edit = document.getElementById(editId);
    const nutritionControl = document.getElementById(nutritionControlId);
    const nutritionButton = document.getElementById(nutritionButtonId);

    if (
      !(manage instanceof HTMLDetailsElement)
      || !(edit instanceof HTMLDetailsElement)
      || !nutritionControl
    ) return;

    manage.open = true;
    edit.open = true;
    nutritionControl.scrollIntoView({ behavior: "auto", block: "nearest" });
    window.requestAnimationFrame(() => nutritionButton?.focus({ preventScroll: true }));
  }

  return (
    <button
      className="inventory-primary-link"
      type="button"
      aria-controls={nutritionControlId}
      onClick={openNutritionControls}
    >
      Completar macros
    </button>
  );
}
