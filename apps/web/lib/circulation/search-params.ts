import type { CirculationTab } from "./types.ts";

const TABS = new Set<CirculationTab>([
  "checkout",
  "checkin",
  "renew",
  "loans",
  "history",
]);

export function parseCirculationTab(params: URLSearchParams): CirculationTab {
  const tab = params.get("tab");
  if (tab && TABS.has(tab as CirculationTab)) {
    return tab as CirculationTab;
  }
  return "checkout";
}