"use client";

import {
  Alert02Icon,
  Bookmark02Icon,
  CheckmarkCircle02Icon,
  LibraryIcon,
  Location01Icon,
  PackageIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { KpiCard } from "@/components/kpi-card";
import {
  inventoryKpis,
  type InventoryKpiKey,
} from "@/lib/inventory/layout";
import type { InventorySessionCounters } from "@/lib/inventory/types";

const ICONS: Record<InventoryKpiKey, IconSvgElement> = {
  expected: LibraryIcon,
  verified: CheckmarkCircle02Icon,
  not_found: Search01Icon,
  misplaced: Location01Icon,
  unexpected: PackageIcon,
  damaged: Alert02Icon,
  withdrawn: Bookmark02Icon,
};

export function InventoryKpis({
  counters,
  expectedCount,
}: {
  counters: InventorySessionCounters;
  expectedCount: number;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
      {inventoryKpis(counters, expectedCount).map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value.toLocaleString("en-PH")}
          hint={card.hint}
          icon={ICONS[card.key]}
          tone={card.tone}
          loading={false}
        />
      ))}
    </div>
  );
}