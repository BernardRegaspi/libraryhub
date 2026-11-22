"use client";

import {
  BanknoteIcon,
  Mortarboard01Icon,
  Presentation01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { KpiCard } from "@/components/kpi-card";
import type { PatronSummary } from "@/lib/patrons/types";

type PatronKpisProps = {
  summary: PatronSummary | undefined;
  loading: boolean;
  scopeHint: string;
};

function formatCount(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return "";
  }
  if (value == null) {
    return "Unavailable";
  }
  return value.toLocaleString("en-PH");
}

export function PatronKpis({ summary, loading, scopeHint }: PatronKpisProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard
        label="Registered patrons"
        value={formatCount(summary?.total, loading)}
        hint={loading ? undefined : scopeHint}
        icon={UserGroupIcon}
        tone="maroon"
        loading={loading}
      />
      <KpiCard
        label="Students"
        value={formatCount(summary?.students, loading)}
        icon={Mortarboard01Icon}
        tone="gold"
        loading={loading}
      />
      <KpiCard
        label="Faculty & staff"
        value={formatCount(summary?.faculty_staff, loading)}
        icon={Presentation01Icon}
        tone="blue"
        loading={loading}
      />
      <KpiCard
        label="With outstanding fines"
        value={formatCount(summary?.outstanding_fines, loading)}
        icon={BanknoteIcon}
        tone="red"
        loading={loading}
      />
    </div>
  );
}