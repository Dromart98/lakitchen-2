"use client";

type InventoryAddCtaProps = {
  fieldId: string;
};

export function InventoryAddCta({ fieldId }: InventoryAddCtaProps) {
  function openAddForm() {
    const details = document.getElementById("anadir-producto");
    const nameField = document.getElementById(fieldId);

    if (!(details instanceof HTMLDetailsElement)) return;

    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() =>
      nameField?.focus({ preventScroll: true }),
    );
  }

  return (
    <button
      className="inventory-primary-link"
      type="button"
      onClick={openAddForm}
    >
      Añadir producto
    </button>
  );
}
