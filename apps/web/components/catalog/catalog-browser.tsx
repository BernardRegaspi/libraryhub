"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, fetchApi } from "@/lib/api";
import {
  parseCatalogSearch,
  serializeCatalogSearch,
  type CatalogSearchState,
} from "@/lib/catalog/search-params";
import type {
  CatalogConfig,
  CatalogHit,
  CatalogSearchResponse,
  SavedSearchRow,
} from "@/lib/catalog/types";

const FIELD_LABELS: Record<string, string> = {
  keyword: "Keyword (title or author)",
  title: "Title",
  author: "Author",
  isbn: "ISBN",
  barcode: "Barcode",
  subject: "Subject",
};

function buildApiSearchQuery(state: CatalogSearchState): string {
  const params = new URLSearchParams();
  params.set("q", state.q);
  params.set("field", state.field);
  params.set("sort", state.sort);
  params.set("direction", state.direction);
  params.set("page", String(state.page));
  params.set("per_page", String(state.perPage));
  if (state.yearFrom !== null) {
    params.set("year_from", String(state.yearFrom));
  }
  if (state.yearTo !== null) {
    params.set("year_to", String(state.yearTo));
  }
  return params.toString();
}

function savedRowToState(row: SavedSearchRow): CatalogSearchState {
  return {
    q: row.q,
    field: row.field,
    sort: row.sort,
    direction: row.direction === "desc" ? "desc" : "asc",
    page: 1,
    perPage: 20,
    view: "cover",
    yearFrom: row.year_from,
    yearTo: row.year_to,
  };
}

function parseYearInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const year = Number.parseInt(trimmed, 10);
  return Number.isNaN(year) ? null : year;
}

function SearchRestoreLink({
  row,
  children,
}: {
  row: SavedSearchRow;
  children: ReactNode;
}) {
  const href = `/catalog?${serializeCatalogSearch(savedRowToState(row))}`;
  return (
    <Link href={href} className="text-sm text-primary hover:underline">
      {children}
    </Link>
  );
}

function HitTitleLink({
  hit,
  state,
}: {
  hit: CatalogHit;
  state: CatalogSearchState;
}) {
  if (hit.biblio_id == null || hit.title == null) {
    return hit.title != null ? (
      <span className="font-medium text-foreground">{hit.title}</span>
    ) : null;
  }
  const href = `/catalog/${hit.biblio_id}?${serializeCatalogSearch(state)}`;
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {hit.title}
    </Link>
  );
}

function CoverCard({ hit, state }: { hit: CatalogHit; state: CatalogSearchState }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {hit.has_cover && hit.biblio_id != null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/v1/catalog/biblios/${hit.biblio_id}/cover`}
          alt=""
          className="aspect-[3/4] w-full rounded-md object-cover"
        />
      ) : (
        <div
          className="aspect-[3/4] w-full rounded-md border border-border bg-muted"
          aria-hidden
        />
      )}
      <HitTitleLink hit={hit} state={state} />
      {hit.author != null ? (
        <p className="text-xs text-muted-foreground">{hit.author}</p>
      ) : null}
      {hit.publication_year != null ? (
        <p className="text-xs text-muted-foreground">{hit.publication_year}</p>
      ) : null}
      {hit.availability.label != null ? (
        <p className="text-xs text-muted-foreground">{hit.availability.label}</p>
      ) : null}
    </article>
  );
}

function ListRow({ hit, state }: { hit: CatalogHit; state: CatalogSearchState }) {
  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3">
      <HitTitleLink hit={hit} state={state} />
      <dl className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {hit.author != null ? (
          <div>
            <dt className="sr-only">Author</dt>
            <dd>{hit.author}</dd>
          </div>
        ) : null}
        {hit.edition != null ? (
          <div>
            <dt className="sr-only">Edition</dt>
            <dd>{hit.edition}</dd>
          </div>
        ) : null}
        {hit.isbn != null ? (
          <div>
            <dt className="sr-only">ISBN</dt>
            <dd>{hit.isbn}</dd>
          </div>
        ) : null}
        {hit.item_type != null ? (
          <div>
            <dt className="sr-only">Item type</dt>
            <dd>{hit.item_type}</dd>
          </div>
        ) : null}
        {hit.publication_year != null ? (
          <div>
            <dt className="sr-only">Year</dt>
            <dd>{hit.publication_year}</dd>
          </div>
        ) : null}
        {hit.availability.label != null ? (
          <div>
            <dt className="sr-only">Availability</dt>
            <dd>{hit.availability.label}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function SearchErrorPanel({
  error,
  opacUrl,
  onRetry,
}: {
  error: unknown;
  opacUrl: string | null | undefined;
  onRetry: () => void;
}) {
  let primary: string | null = null;
  if (error instanceof ApiError) {
    if (error.status === 503) {
      primary = "The catalog is unavailable. Try again.";
    } else if (error.status === 504) {
      primary = "The catalog took too long to respond. Try again.";
    } else if (error.status === 422) {
      primary = "That search is not valid.";
    } else if (error.status === 403) {
      primary = "You do not have access to the catalog.";
    } else {
      const detailMessage = error.detail?.message;
      primary =
        typeof detailMessage === "string" && detailMessage.length > 0
          ? detailMessage
          : error.message;
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
      {primary ? (
        <p className="text-sm text-foreground">{primary}</p>
      ) : null}
      {opacUrl == null ? (
        <p className="text-sm text-muted-foreground">
          The OPAC address is not configured.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <Link
            href={opacUrl}
            target="_blank"
            rel="noopener"
            className="text-sm text-primary hover:underline"
          >
            Open the Koha OPAC
          </Link>
          <p className="text-sm text-muted-foreground">
            This link leaves ULMS and opens the Koha OPAC.
          </p>
        </div>
      )}
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function CatalogBrowser() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const urlParams = useSearchParams();
  const state = parseCatalogSearch(urlParams);

  const [draftQ, setDraftQ] = useState(state.q);
  const [draftField, setDraftField] = useState(state.field);
  const [draftYearFrom, setDraftYearFrom] = useState(
    state.yearFrom != null ? String(state.yearFrom) : "",
  );
  const [draftYearTo, setDraftYearTo] = useState(
    state.yearTo != null ? String(state.yearTo) : "",
  );
  const [saveLabel, setSaveLabel] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    setDraftQ(state.q);
    setDraftField(state.field);
    setDraftYearFrom(state.yearFrom != null ? String(state.yearFrom) : "");
    setDraftYearTo(state.yearTo != null ? String(state.yearTo) : "");
  }, [state.q, state.field, state.yearFrom, state.yearTo]);

  function pushState(next: CatalogSearchState) {
    router.push(`/catalog?${serializeCatalogSearch(next)}`);
  }

  const configQuery = useQuery({
    queryKey: ["catalog", "config"],
    queryFn: () => fetchApi<CatalogConfig>("/catalog/config"),
  });

  const recentQuery = useQuery({
    queryKey: ["catalog", "recent-searches"],
    queryFn: () => fetchApi<SavedSearchRow[]>("/catalog/recent-searches"),
  });

  const savedQuery = useQuery({
    queryKey: ["catalog", "saved-searches"],
    queryFn: () => fetchApi<SavedSearchRow[]>("/catalog/saved-searches"),
  });

  const searchKey = serializeCatalogSearch(state);
  const searchQuery = useQuery({
    queryKey: ["catalog", "search", searchKey],
    queryFn: () =>
      fetchApi<CatalogSearchResponse>(
        `/catalog/search?${buildApiSearchQuery(state)}`,
      ),
    enabled: state.q.length > 0,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!searchQuery.isSuccess || state.q.length === 0) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["catalog", "recent-searches"],
    });
  }, [queryClient, searchQuery.dataUpdatedAt, searchQuery.isSuccess, state.q]);

  const config = configQuery.data;
  const opacUrl = config?.opac_url;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pushState({
      ...state,
      q: draftQ.trim(),
      field: draftField,
      yearFrom: parseYearInput(draftYearFrom),
      yearTo: parseYearInput(draftYearTo),
      page: 1,
    });
  }

  async function onSaveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.q.trim()) {
      return;
    }
    setSaveBusy(true);
    try {
      await fetchApi<SavedSearchRow>("/catalog/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: saveLabel.trim(),
          q: state.q,
          field: state.field,
          sort: state.sort,
          direction: state.direction,
          year_from: state.yearFrom,
          year_to: state.yearTo,
        }),
      });
      setSaveLabel("");
      await queryClient.invalidateQueries({
        queryKey: ["catalog", "saved-searches"],
      });
    } finally {
      setSaveBusy(false);
    }
  }

  async function onDeleteSaved(id: string) {
    if (!window.confirm("Remove this saved search?")) {
      return;
    }
    await fetchApi<void>(`/catalog/saved-searches/${id}`, { method: "DELETE" });
    await queryClient.invalidateQueries({
      queryKey: ["catalog", "saved-searches"],
    });
  }

  const results = searchQuery.data;
  const page = results?.page ?? state.page;
  const total = results?.total;
  const hasNext = results?.has_next ?? false;

  let statusMessage: string | null = null;
  if (!state.q) {
    statusMessage = "Search the catalog.";
  } else if (searchQuery.isPending) {
    statusMessage = "Searching the catalog.";
  }

  const sidebar = (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-medium text-foreground">Recent searches</h2>
        {recentQuery.isPending ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : recentQuery.data && recentQuery.data.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {recentQuery.data.map((row) => (
              <li key={row.id}>
                <SearchRestoreLink row={row}>
                  {row.label ?? row.q}
                </SearchRestoreLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No recent searches.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-foreground">Saved searches</h2>
        {savedQuery.isPending ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : savedQuery.data && savedQuery.data.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {savedQuery.data.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-2"
              >
                <SearchRestoreLink row={row}>
                  {row.label ?? row.q}
                </SearchRestoreLink>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onDeleteSaved(row.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No saved searches.</p>
        )}

        {state.q ? (
          <form className="mt-4 flex flex-col gap-2" onSubmit={onSaveSearch}>
            <Label htmlFor="save-label">Save this search</Label>
            <Input
              id="save-label"
              value={saveLabel}
              onChange={(event) => setSaveLabel(event.target.value)}
              required
            />
            <Button type="submit" variant="outline" disabled={saveBusy}>
              Save
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );

  return (
  <>
    <ModuleFrame
      eyebrow="Library"
      title="Catalog search"
      description="Search the Koha catalog. Results are fetched from Koha with pagination. The ULMS does not store a copy of the catalog."
      hideModuleSentence
      actions={
        typeof opacUrl === "string" ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={opacUrl} target="_blank" rel="noopener" />
            }
          >
            Open Koha OPAC
          </Button>
        ) : undefined
      }
    />

    <div className="flex flex-col gap-8 px-6 pb-8 lg:flex-row lg:px-8">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="catalog-q">Search</Label>
            <Input
              id="catalog-q"
              value={draftQ}
              onChange={(event) => setDraftQ(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="catalog-field">Field</Label>
            <select
              id="catalog-field"
              className="h-7 w-full max-w-xs rounded-md border border-input bg-input/20 px-2 text-xs/relaxed"
              value={draftField}
              onChange={(event) => setDraftField(event.target.value)}
            >
              {(config?.fields ?? [draftField]).map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field] ?? field}
                </option>
              ))}
            </select>
          </div>
          {config?.year_filter ? (
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-year-from">Year from</Label>
                <Input
                  id="catalog-year-from"
                  inputMode="numeric"
                  value={draftYearFrom}
                  onChange={(event) => setDraftYearFrom(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-year-to">Year to</Label>
                <Input
                  id="catalog-year-to"
                  inputMode="numeric"
                  value={draftYearTo}
                  onChange={(event) => setDraftYearTo(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <Button type="submit">Search</Button>
        </form>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={state.view === "cover" ? "default" : "outline"}
            onClick={() => pushState({ ...state, view: "cover" })}
          >
            Cover
          </Button>
          <Button
            type="button"
            variant={state.view === "list" ? "default" : "outline"}
            onClick={() => pushState({ ...state, view: "list" })}
          >
            List
          </Button>
        </div>

        {statusMessage ? (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        ) : null}

        {searchQuery.isError ? (
          <SearchErrorPanel
            error={searchQuery.error}
            opacUrl={opacUrl}
            onRetry={() => {
              void searchQuery.refetch();
            }}
          />
        ) : null}

        {state.q && searchQuery.isSuccess && results ? (
          <>
            {results.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No records matched this search.
              </p>
            ) : state.view === "cover" ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
                {results.results.map((hit, index) => (
                  <CoverCard
                    key={hit.biblio_id ?? index}
                    hit={hit}
                    state={state}
                  />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {results.results.map((hit, index) => (
                  <li key={hit.biblio_id ?? index}>
                    <ListRow hit={hit} state={state} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Page {page}
                {typeof total === "number" ? (
                  <>
                    {" "}
                    {total} results
                  </>
                ) : null}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={state.page <= 1}
                onClick={() =>
                  pushState({ ...state, page: Math.max(1, state.page - 1) })
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!hasNext}
                onClick={() => pushState({ ...state, page: state.page + 1 })}
              >
                Next
              </Button>
            </div>
          </>
        ) : null}

        <div className="lg:hidden">{sidebar}</div>
      </div>

      <aside className="hidden w-72 shrink-0 lg:block">{sidebar}</aside>
    </div>
    </>
  );
}