"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

const TONES = {
  maroon: "bg-[#F6E7E7] text-[#7D1519]",
  gold: "bg-[#FFF1D6] text-[#8A5A00]",
  blue: "bg-[#E9F1FB] text-[#1D4E89]",
  red: "bg-[#FDECEA] text-[#B42318]",
} as const;

export type KpiTone = keyof typeof TONES;

export function KpiCard({
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
  tone: KpiTone;
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