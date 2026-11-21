"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";

import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchApi } from "@/lib/api";
import {
  parseInventorySearch,
  serializeInventorySearch,
  type InventorySearchState,
} from "@/lib/inventory/search-params";
import type {
  InventorySession,
  InventorySessionListResponse,
  InventorySessionStatus,
} from "@/lib/inventory/types";

const INVENTORY_DESCRIPTION =
  "Scan a Koha library, or one shelving location, and keep a record of each barcode.";

function buildSessionsApiQuery(state: InventorySearchState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  if (state.status) {
    params.set("status", state.status);
  }
  params.set("page", String(state.page));
  params.set("per_page", "20");
  params.set("sort", state.sort);
  params.set("direction", state.direction);
  return params.toString();
}

function statusLabel(value: InventorySearchState["status"]): string {
  if (value === "draft") {
    return "Draft";
  }
  if (value === "in_progress") {
    return "In progress";
  }
  if (value === "cancelled") {
    return "Cancelled";
  }
  return "Any status";
}

function sessionStatusLabel(status: InventorySessionStatus): string {
  if (status === "draft") {
    return "Draft";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  return "Cancelled";
}

function formatStartedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function SessionTableSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }, (_, index) => (
        <tr key={index} className="border-b border-border">
          <td className="px-3 py-3" colSpan={7}>
            <Skeleton className="h-10 w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

function SessionSearchQueryInput({
  committedQ,
  state,
  onCommit,
}: {
  committedQ: string;
  state: InventorySearchState;
  onCommit: (next: InventorySearchState) => void;
}) {
  const [draftQ, setDraftQ] = useState(committedQ);

  useEffect(() => {
    if (draftQ === committedQ) {
      return;
    }
    const handle = window.setTimeout(() => {
      const q = draftQ.length > 80 ? draftQ.slice(0, 80) : draftQ;
      onCommit({ ...state, q, page: 1 });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [committedQ, draftQ, onCommit, state]);

  return (
    <div className="relative min-w-0 flex-1">
      <HugeiconsIcon
        icon={SearchIcon}
        strokeWidth={2}
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
      />
      <Input
        value={draftQ}
        onChange={(event) => setDraftQ(event.target.value)}
        placeholder="Reference or name"
        className="min-h-11 h-11 pl-9 text-sm"
      />
    </div>
  );
}

function SessionRow({ session }: { session: InventorySession }) {
  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-3 py-3">
        <Link
          href={`/inventory/${session.id}`}
          className="font-medium text-primary hover:underline"
        >
          {session.reference}
        </Link>
      </td>
      <td className="px-3 py-3 text-sm text-foreground">{session.name}</td>
      <td className="hidden px-3 py-3 text-sm text-foreground md:table-cell">
        {session.home_library_name ?? session.home_library_id}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {session.location ?? "Whole library"}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {session.expected_count}
      </td>
      <td className="px-3 py-3">
        <FilterBadge>{sessionStatusLabel(session.status)}</FilterBadge>
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {session.started_at ? formatStartedAt(session.started_at) : null}
      </td>
    </tr>
  );
}

export function SessionList() {
  const router = useRouter();
  const urlParams = useSearchParams();
  const state = parseInventorySearch(urlParams);

  const replaceState = useCallback(
    (next: InventorySearchState) => {
      const query = serializeInventorySearch(next);
      router.replace(query ? `/inventory?${query}` : "/inventory");
    },
    [router],
  );

  const searchKey = serializeInventorySearch(state);

  const sessionsQuery = useQuery({
    queryKey: ["inventory", "sessions", searchKey],
    queryFn: () =>
      fetchApi<InventorySessionListResponse>(
        `/inventory/sessions?${buildSessionsApiQuery(state)}`,
      ),
    placeholderData: (previous) => previous,
  });

  const results = sessionsQuery.data;
  const page = results?.page ?? state.page;
  const total = results?.total ?? null;
  const hasNext = results?.has_next ?? false;
  const items = results?.items ?? [];

  const pending =
    sessionsQuery.isPending || sessionsQuery.isPlaceholderData;

  return (
    <>
      <ModuleFrame
        eyebrow="Library"
        title="Inventory"
        description={INVENTORY_DESCRIPTION}
        hideModuleSentence
        actions={
          <Button
            type="button"
            className="min-h-11"
            render={<Link href="/inventory/new" />}
          >
            New session
          </Button>
        }
      />

      <div className="flex w-full min-w-0 flex-col gap-6 px-4 pb-8 sm:px-6 lg:px-8">
        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
            <SessionSearchQueryInput
              key={state.q}
              committedQ={state.q}
              state={state}
              onCommit={replaceState}
            />
            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap">
              <Select
                value={state.status}
                onValueChange={(status) => {
                  if (status == null) {
                    return;
                  }
                  replaceState({
                    ...state,
                    status: status as InventorySearchState["status"],
                    page: 1,
                  });
                }}
              >
                <SelectTrigger className="min-h-11 h-11 w-full min-w-0 text-sm md:w-auto md:min-w-36">
                  <SelectValue>
                    {(value: string | null) =>
                      statusLabel((value ?? "") as InventorySearchState["status"])
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="">Any status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-medium text-foreground">Sessions</h2>
          {typeof total === "number" ? (
            <p className="text-sm text-muted-foreground">{total} sessions</p>
          ) : null}
        </div>

        {sessionsQuery.isError ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
            <p className="text-sm text-foreground">
              {sessionsQuery.error instanceof Error
                ? sessionsQuery.error.message
                : "Inventory sessions are unavailable. Try again."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              onClick={() => {
                void sessionsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="hidden px-3 py-2 font-semibold md:table-cell">
                    Library
                  </th>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Expected</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {pending ? (
                  <SessionTableSkeleton />
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-sm text-muted-foreground"
                      colSpan={7}
                    >
                      No inventory sessions for this department.
                    </td>
                  </tr>
                ) : (
                  items.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!sessionsQuery.isError ? (
          <CatalogPagination
            page={page}
            total={total}
            perPage={20}
            hasNext={hasNext}
            onPage={(nextPage) => replaceState({ ...state, page: nextPage })}
          />
        ) : null}
      </div>
    </>
  );
}