"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BanknoteIcon,
  Mortarboard01Icon,
  Presentation01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import type { PatronSummary } from "@/lib/patrons/types";

type PatronKpisProps = {
  summary: PatronSummary | undefined;
  loading: boolean;
  scopeHint: string;
};

const TONES = {
  maroon: "bg-[#F6E7E7] text-[#7D1519]",
  gold: "bg-[#FFF1D6] text-[#8A5A00]",
  blue: "bg-[#E9F1FB] text-[#1D4E89]",
  red: "bg-[#FDECEA] text-[#B42318]",
} as const;

function formatCount(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return "";
  }
  if (value == null) {
    return "Unavailable";
  }
  return value.toLocaleString("en-PH");
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconSvgElement;
  tone: keyof typeof TONES;
  loading: boolean;
}) {
  const unavailable = value === "Unavailable";
  return (
    <Card className="rounded-[0.9rem] p-4 shadow-[0_1px_2px_rgba(34,26,24,0.05),0_6px_18px_-12px_rgba(34,26,24,0.12)] ring-foreground/7 [--card-spacing:--spacing(4)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p
              className={cn(
                "font-display mt-1 leading-none text-foreground",
                unavailable ? "text-lg font-medium" : "text-2xl font-bold lg:text-[1.7rem]",
              )}
            >
              {value}
            </p>
          )}
          {hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "flex size-[2.6rem] shrink-0 items-center justify-center rounded-[0.7rem]",
            TONES[tone],
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
        </span>
      </div>
    </Card>
  );
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
