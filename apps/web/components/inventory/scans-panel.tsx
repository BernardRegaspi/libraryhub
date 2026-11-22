"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  InventoryScan,
  InventoryScanListResponse,
  InventoryScanOutcome,
} from "@/lib/inventory/types";

const NO_TITLE = "No title from Koha";

const OUTCOME_FILTER_OPTIONS: { value: InventoryScanOutcome; label: string }[] =
  [
    { value: "verified", label: "Verified" },
    { value: "misplaced", label: "Misplaced" },
    { value: "unexpected", label: "Unexpected" },
    { value: "not_found", label: "Not found" },
    { value: "withdrawn", label: "Withdrawn" },
    { value: "damaged", label: "Damaged" },
    { value: "other_exception", label: "Other exception" },
    { value: "duplicate", label: "Duplicate" },
  ];

export type ScanListFilter =
  | { kind: "all" }
  | { kind: "exceptions" }
  | { kind: "outcome"; outcome: InventoryScanOutcome };

export const DEFAULT_SCAN_FILTER: ScanListFilter = { kind: "all" };

const SCAN_FILTER_CHIPS: { label: string; filter: ScanListFilter }[] = [
  { label: "All", filter: { kind: "all" } },
  { label: "Exceptions", filter: { kind: "exceptions" } },
  ...OUTCOME_FILTER_OPTIONS.map((option) => ({
    label: option.label,
    filter: { kind: "outcome" as const, outcome: option.value },
  })),
];

function scanFiltersEqual(a: ScanListFilter, b: ScanListFilter): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "outcome" && b.kind === "outcome") {
    return a.outcome === b.outcome;
  }
  return true;
}

function ScanRow({ scan }: { scan: InventoryScan }) {
  return (
    <tr className="border-b border-border">
      <td className="px-3 py-3 font-mono text-sm text-foreground">
        {scan.barcode}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">{scan.outcome_label}</td>
      <td className="hidden px-3 py-3 text-sm text-foreground md:table-cell">
        {scan.title ?? NO_TITLE}
      </td>
      <td className="hidden px-3 py-3 text-sm text-muted-foreground lg:table-cell">
        {scan.scanned_at}
      </td>
    </tr>
  );
}

export function ScansPanel({
  scansQuery,
  scanSearchDraft,
  onScanSearchChange,
  scanFilter,
  onScanFilterChange,
  scanPage,
  onScanPageChange,
}: {
  scansQuery: {
    data: InventoryScanListResponse | undefined;
    isPending: boolean;
    isPlaceholderData: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  };
  scanSearchDraft: string;
  onScanSearchChange: (value: string) => void;
  scanFilter: ScanListFilter;
  onScanFilterChange: (filter: ScanListFilter) => void;
  scanPage: number;
  onScanPageChange: (page: number) => void;
}) {
  const items = scansQuery.data?.items ?? [];
  const pending =
    scansQuery.isPending || scansQuery.isPlaceholderData;
  const page = scansQuery.data?.page ?? scanPage;
  const total = scansQuery.data?.total ?? null;
  const hasNext = scansQuery.data?.has_next ?? false;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-foreground">
          Scans
        </h2>
        <p className="text-sm text-muted-foreground">
          Saved barcodes compared with Koha item records.
        </p>
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative min-w-0">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
            />
            <Input
              value={scanSearchDraft}
              onChange={(event) => onScanSearchChange(event.target.value)}
              placeholder="Barcode"
              className="min-h-11 h-11 pl-9 text-sm"
            />
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {SCAN_FILTER_CHIPS.map((chip) => {
              const active = scanFiltersEqual(scanFilter, chip.filter);
              return (
                <Button
                  key={chip.label}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="min-h-11 shrink-0 text-sm"
                  onClick={() => {
                    onScanFilterChange(chip.filter);
                  }}
                >
                  {chip.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {scansQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">
            {scansQuery.error instanceof Error
              ? scansQuery.error.message
              : "Scans could not be loaded."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => {
              void scansQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Barcode</th>
                <th className="px-3 py-2 font-semibold">Outcome</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">
                  Title
                </th>
                <th className="hidden px-3 py-2 font-semibold lg:table-cell">
                  Scanned
                </th>
              </tr>
            </thead>
            <tbody>
              {pending ? (
                <tr>
                  <td className="px-3 py-6" colSpan={4}>
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                    colSpan={4}
                  >
                    No scans yet.
                  </td>
                </tr>
              ) : (
                items.map((scan) => <ScanRow key={scan.id} scan={scan} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {!scansQuery.isError ? (
        <CatalogPagination
          page={page}
          total={total}
          perPage={20}
          hasNext={hasNext}
          onPage={onScanPageChange}
        />
      ) : null}
    </div>
  );
}