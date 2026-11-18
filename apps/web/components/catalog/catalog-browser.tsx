"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { CatalogAlphabet } from "@/components/catalog/catalog-alphabet";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { CatalogResults } from "@/components/catalog/catalog-results";
import { CatalogSearchCard } from "@/components/catalog/catalog-search-card";
import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { ApiError, fetchApi } from "@/lib/api";
import {
  parseCatalogSearch,
  serializeCatalogSearch,
  type CatalogSearchState,
} from "@/lib/catalog/search-params";
import type {
  CatalogConfig,
  CatalogLibrary,
  CatalogSearchResponse,
} from "@/lib/catalog/types";

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
  if (state.letter) {
    params.set("letter", state.letter);
  }
  if (state.author) {
    params.set("author", state.author);
  }
  if (state.publisher) {
    params.set("publisher", state.publisher);
  }
  if (state.availability) {
    params.set("availability", state.availability);
  }
  if (state.library) {
    params.set("library", state.library);
  }
  return params.toString();
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
  const urlParams = useSearchParams();
  const state = parseCatalogSearch(urlParams);

  function pushState(next: CatalogSearchState) {
    router.push(`/catalog?${serializeCatalogSearch(next)}`);
  }

  const configQuery = useQuery({
    queryKey: ["catalog", "config"],
    queryFn: () => fetchApi<CatalogConfig>("/catalog/config"),
  });

  const librariesQuery = useQuery({
    queryKey: ["catalog", "libraries"],
    queryFn: () => fetchApi<CatalogLibrary[]>("/catalog/libraries"),
  });

  const searchKey = serializeCatalogSearch(state);
  const searchQuery = useQuery({
    queryKey: ["catalog", "search", searchKey],
    queryFn: () =>
      fetchApi<CatalogSearchResponse>(
        `/catalog/search?${buildApiSearchQuery(state)}`,
      ),
    placeholderData: (previous) => previous,
  });

  const config = configQuery.data;
  const opacUrl = config?.opac_url;
  const results = searchQuery.data;
  const page = results?.page ?? state.page;
  const total = results?.total;
  const hasNext = results?.has_next ?? false;
  const hits = results?.results ?? [];

  return (
    <>
      <ModuleFrame
        eyebrow="Library"
        title="Catalog"
        description="Browse and search the university catalog. Records come from Koha."
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

      <div className="flex flex-col gap-6 px-6 pb-8 lg:px-8">
        <CatalogSearchCard
          state={state}
          fieldOptions={config?.fields ?? [state.field]}
          yearFilter={config?.year_filter ?? false}
          libraries={librariesQuery.data ?? []}
          librariesFailed={librariesQuery.isError}
          total={total ?? null}
          onSearch={pushState}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-medium text-foreground">Catalog</h2>
            {typeof total === "number" ? (
              <p className="text-sm text-muted-foreground">{total} results</p>
            ) : null}
          </div>
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
        </div>

        <CatalogAlphabet
          letter={state.letter}
          onLetter={(letter) =>
            pushState({ ...state, letter, page: 1 })
          }
        />

        {searchQuery.isError ? (
          <SearchErrorPanel
            error={searchQuery.error}
            opacUrl={opacUrl}
            onRetry={() => {
              void searchQuery.refetch();
            }}
          />
        ) : (
          <CatalogResults
            hits={hits}
            pending={searchQuery.isPending}
            view={state.view}
            sort={state.sort}
            state={state}
          />
        )}

        {!searchQuery.isError ? (
          <CatalogPagination
            page={page}
            total={total ?? null}
            perPage={state.perPage}
            hasNext={hasNext}
            onPage={(nextPage) => pushState({ ...state, page: nextPage })}
          />
        ) : null}
      </div>
    </>
  );
}