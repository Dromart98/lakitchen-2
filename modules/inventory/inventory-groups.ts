import type {
  InventoryItemRecord,
  InventoryLocation,
} from "@/modules/inventory/inventory.types";

export type InventoryGroup = {
  location: InventoryLocation;
  label: string;
  items: InventoryItemRecord[];
};

const inventoryLocations: InventoryLocation[] = ["pantry", "fridge", "freezer"];

const locationLabels: Record<InventoryLocation, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

export function groupInventoryItems(
  items: InventoryItemRecord[],
  hasActiveFilters: boolean,
): InventoryGroup[] {
  const groups = inventoryLocations.map((location) => ({
    location,
    label: locationLabels[location],
    items: items.filter((item) => item.location === location),
  }));

  return hasActiveFilters
    ? groups.filter((group) => group.items.length > 0)
    : groups;
}
