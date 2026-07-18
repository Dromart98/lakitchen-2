import Link from "next/link";

import { formatInventoryExpirationLabel } from "@/modules/inventory/inventory-expiration";
import type { InventoryItemRecord, InventoryLocation } from "@/modules/inventory/inventory.types";

const locationLabels: Record<InventoryLocation, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

export function ExpiringList({ items, todayKey }: { items: InventoryItemRecord[]; todayKey: string }) {
  return (
    <div className="card">
      <h2>Próximos a caducar</h2>
      {items.length === 0 ? (
        <p className="muted">No hay productos urgentes.</p>
      ) : (
        <div className="grid">
          {items.map((item) => (
            <div key={item.id}>
              <span className="pill">{locationLabels[item.location]}</span>
              <strong className="expiring-list__item-name">{item.name}</strong>
              <span className="muted">
                {item.quantity} {item.unit} · {formatInventoryExpirationLabel(item.expires_at, todayKey)}
              </span>
            </div>
          ))}
        </div>
      )}
      <Link className="logout-link" href="/inventory">
        Ver inventario
      </Link>
    </div>
  );
}
