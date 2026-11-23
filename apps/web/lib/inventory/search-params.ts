import type { InventoryView } from "./types";

const VIEWS: InventoryView[] = [
  "overview",
  "scan",
  "exceptions",
  "adjustments",
  "audit",
];

export function parseInventoryView(params: URLSearchParams): InventoryView {
  const raw = params.get("view");
  if (raw && (VIEWS as string[]).includes(raw)) {
    return raw as InventoryView;
  }
  return "overview";
}