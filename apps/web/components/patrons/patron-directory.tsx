"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon, SearchIcon } from "@hugeicons/core-free-icons";

import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { displayName, initials, statusBadges } from "@/lib/patrons/display";
import {
  parsePatronSearch,
  serializePatronSearch,
  type PatronSearchState,
} from "@/lib/patrons/search-params";
import { PatronFormDialog } from "@/components/patrons/patron-form-dialog";
import type {
  PatronDirectoryItem,
  PatronOptionsResponse,
  PatronSearchResponse,
} from "@/lib/patrons/types";

const PATRON_DESCRIPTION =
  "Search Koha patron records by name, card number, or userid. People who share a name stay separate records. Records are never merged.";

function buildPatronApiQuery(state: PatronSearchState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  if (state.categoryId) {
    params.set("category_id", state.categoryId);
  }
  if (state.libraryId) {
    params.set("library_id", state.libraryId);
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

function statusLabel(value: PatronSearchState["status"]): string {
  if (value === "active") {
    return "Active";
  }
  if (value === "expired") {
    return "Expired";
  }
  if (value === "restricted") {
    return "Restricted";
  }
  return "Any status";
}

function countCell(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }
  return String(value);
}

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function PatronTableSkeleton() {
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

function PatronRow({
  patron,
  canUpdate,
}: {
  patron: PatronDirectoryItem;
  canUpdate: boolean;
}) {
  const name = displayName(patron);
  const badgeList = statusBadges(patron);

  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
            aria-hidden
          >
            {initials(name)}
          </div>
          <div className="min-w-0">
            <Link
              href={`/patrons/${patron.patron_id}`}
              className="font-medium text-primary hover:underline"
            >
              {name}
            </Link>
            {patron.cardnumber ? (
              <p className="text-xs text-muted-foreground">{patron.cardnumber}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {patron.category_name ? (
          <FilterBadge>{patron.category_name}</FilterBadge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        {patron.library_name ?? (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {countCell(patron.checkouts_count)}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {countCell(patron.overdues_count)}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        {patron.expiry_date ?? "—"}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {badgeList.map((badge) => (
              <FilterBadge key={badge}>{badge}</FilterBadge>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Patron actions"
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/patrons/${patron.patron_id}`} />}
              >
                View
              </DropdownMenuItem>
              {canUpdate ? (
                <DropdownMenuItem>Edit</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

export type PatronDirectoryProps = {
  canUpdate: boolean;
  canSensitive: boolean;
};

export function PatronDirectory({
  canUpdate,
  canSensitive,
}: PatronDirectoryProps) {
  const router = useRouter();
  const urlParams = useSearchParams();
  const state = parsePatronSearch(urlParams);
  const [draftQ, setDraftQ] = useState(state.q);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setDraftQ(state.q);
  }, [state.q]);

  function replaceState(next: PatronSearchState) {
    const query = serializePatronSearch(next);
    router.replace(query ? `/patrons?${query}` : "/patrons");
  }

  useEffect(() => {
    if (draftQ === state.q) {
      return;
    }
    const handle = window.setTimeout(() => {
      const q = draftQ.length > 80 ? draftQ.slice(0, 80) : draftQ;
      replaceState({ ...state, q, page: 1 });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draftQ, state, router]);

  const searchKey = serializePatronSearch(state);

  const optionsQuery = useQuery({
    queryKey: ["patrons", "options"],
    queryFn: () => fetchApi<PatronOptionsResponse>("/patrons/options"),
  });

  const patronsQuery = useQuery({
    queryKey: ["patrons", "search", searchKey],
    queryFn: () =>
      fetchApi<PatronSearchResponse>(
        `/patrons?${buildPatronApiQuery(state)}`,
      ),
    placeholderData: (previous) => previous,
  });

  const categories = optionsQuery.data?.categories ?? null;
  const libraries = optionsQuery.data?.libraries ?? null;
  const categoriesUnavailable = categories === null;
  const librariesUnavailable = libraries === null;

  const results = patronsQuery.data;
  const page = results?.page ?? state.page;
  const total = results?.total ?? null;
  const hasNext = results?.has_next ?? false;
  const items = results?.items ?? [];

  const pending =
    patronsQuery.isPending || patronsQuery.isPlaceholderData;

  function resetFilters() {
    replaceState({
      ...state,
      q: "",
      categoryId: "",
      libraryId: "",
      status: "",
      page: 1,
    });
  }

  return (
    <>
      <ModuleFrame
        eyebrow="Library"
        title="Patron Management"
        description={PATRON_DESCRIPTION}
        hideModuleSentence
        actions={
          canUpdate ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Add patron
            </Button>
          ) : undefined
        }
      />

      <div className="flex w-full min-w-0 flex-col gap-6 px-4 pb-8 sm:px-6 lg:px-8">
        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <HugeiconsIcon
                icon={SearchIcon}
                strokeWidth={2}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
              />
              <Input
                value={draftQ}
                onChange={(event) => setDraftQ(event.target.value)}
                placeholder="Name, card number, or userid"
                className="h-9 pl-9 text-sm"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap">
              <Select
                value={categoriesUnavailable ? "" : state.categoryId}
                disabled={categoriesUnavailable}
                onValueChange={(categoryId) => {
                  if (categoryId == null) {
                    return;
                  }
                  replaceState({ ...state, categoryId, page: 1 });
                }}
              >
                <SelectTrigger className="h-9 w-full min-w-0 text-sm md:w-auto md:min-w-40">
                  <SelectValue placeholder="Unavailable">
                    {(value: string | null) =>
                      categoriesUnavailable
                        ? "Unavailable"
                        : value
                          ? (categories?.find(
                              (cat) => cat.patron_category_id === value,
                            )?.name ?? value)
                          : "Any category"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="">Any category</SelectItem>
                  {(categories ?? []).map((cat) => (
                    <SelectItem
                      key={cat.patron_category_id}
                      value={cat.patron_category_id}
                    >
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={librariesUnavailable ? "" : state.libraryId}
                disabled={librariesUnavailable}
                onValueChange={(libraryId) => {
                  if (libraryId == null) {
                    return;
                  }
                  replaceState({ ...state, libraryId, page: 1 });
                }}
              >
                <SelectTrigger className="h-9 w-full min-w-0 text-sm md:w-auto md:min-w-40">
                  <SelectValue placeholder="Unavailable">
                    {(value: string | null) =>
                      librariesUnavailable
                        ? "Unavailable"
                        : value
                          ? (libraries?.find((lib) => lib.id === value)?.name ??
                            value)
                          : "Any library"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="">Any library</SelectItem>
                  {(libraries ?? []).map((lib) => (
                    <SelectItem key={lib.id} value={lib.id}>
                      {lib.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={state.status}
                onValueChange={(status) => {
                  if (status == null) {
                    return;
                  }
                  replaceState({
                    ...state,
                    status: status as PatronSearchState["status"],
                    page: 1,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full min-w-0 text-sm md:w-auto md:min-w-36">
                  <SelectValue>
                    {(value: string | null) =>
                      statusLabel((value ?? "") as PatronSearchState["status"])
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="">Any status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={resetFilters}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-medium text-foreground">Patrons</h2>
          {typeof total === "number" ? (
            <p className="text-sm text-muted-foreground">{total} patrons</p>
          ) : null}
        </div>

        {patronsQuery.isError ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
            <p className="text-sm text-foreground">
              {patronsQuery.error instanceof Error
                ? patronsQuery.error.message
                : "Patron records are unavailable. Try again."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void patronsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Patron</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="hidden px-3 py-2 font-semibold md:table-cell">
                    Library
                  </th>
                  <th className="px-3 py-2 font-semibold">On loan</th>
                  <th className="px-3 py-2 font-semibold">Overdue</th>
                  <th className="px-3 py-2 font-semibold">Expiry</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {pending ? (
                  <PatronTableSkeleton />
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-sm text-muted-foreground"
                      colSpan={7}
                    >
                      No patrons matched.
                    </td>
                  </tr>
                ) : (
                  items.map((patron) => (
                    <PatronRow
                      key={patron.patron_id}
                      patron={patron}
                      canUpdate={canUpdate}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!patronsQuery.isError ? (
          <CatalogPagination
            page={page}
            total={total}
            perPage={20}
            hasNext={hasNext}
            onPage={(nextPage) => replaceState({ ...state, page: nextPage })}
          />
        ) : null}
      </div>

      {canUpdate ? (
        <PatronFormDialog
          mode="create"
          canSensitive={canSensitive}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}
    </>
  );
}