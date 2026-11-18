"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogLibrary } from "@/lib/catalog/types";
import type { CatalogSearchState } from "@/lib/catalog/search-params";

const FIELD_LABELS: Record<string, string> = {
  keyword: "Keyword (title or author)",
  title: "Title",
  author: "Author",
  isbn: "ISBN",
  barcode: "Barcode",
  subject: "Subject",
};

function fieldOptionLabel(field: string): string {
  if (field === "keyword") {
    return "Keyword";
  }
  return FIELD_LABELS[field] ?? field;
}

function parseYearInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const year = Number.parseInt(trimmed, 10);
  return Number.isNaN(year) ? null : year;
}

const SORT_LABELS: Record<string, string> = {
  "title:asc": "Title A–Z",
  "title:desc": "Title Z–A",
  "author:asc": "Author A–Z",
  "author:desc": "Author Z–A",
};

function sortValue(sort: string, direction: string): string {
  return `${sort}:${direction}`;
}

function availabilityLabel(value: string | null): string {
  if (value === "available") {
    return "Available now";
  }
  if (value === "on_loan") {
    return "All copies on loan";
  }
  return "Any availability";
}

function parseSortValue(value: string): { sort: string; direction: "asc" | "desc" } {
  const [sort, dir] = value.split(":");
  return { sort, direction: dir === "desc" ? "desc" : "asc" };
}

export type CatalogSearchCardProps = {
  state: CatalogSearchState;
  fieldOptions: string[];
  yearFilter: boolean;
  libraries: CatalogLibrary[];
  librariesFailed: boolean;
  total: number | null;
  onSearch: (next: CatalogSearchState) => void;
};

export function CatalogSearchCard({
  state,
  fieldOptions,
  yearFilter,
  libraries,
  librariesFailed,
  total,
  onSearch,
}: CatalogSearchCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftQ, setDraftQ] = useState(state.q);
  const [draftAuthor, setDraftAuthor] = useState(state.author);
  const [draftPublisher, setDraftPublisher] = useState(state.publisher);
  const [draftYearFrom, setDraftYearFrom] = useState(
    state.yearFrom != null ? String(state.yearFrom) : "",
  );
  const [draftYearTo, setDraftYearTo] = useState(
    state.yearTo != null ? String(state.yearTo) : "",
  );

  useEffect(() => {
    setDraftQ(state.q);
    setDraftAuthor(state.author);
    setDraftPublisher(state.publisher);
    setDraftYearFrom(state.yearFrom != null ? String(state.yearFrom) : "");
    setDraftYearTo(state.yearTo != null ? String(state.yearTo) : "");
  }, [state.q, state.author, state.publisher, state.yearFrom, state.yearTo]);

  function commitTextFields() {
    onSearch({
      ...state,
      q: draftQ.trim(),
      author: draftAuthor.trim(),
      publisher: draftPublisher.trim(),
      yearFrom: parseYearInput(draftYearFrom),
      yearTo: parseYearInput(draftYearTo),
      page: 1,
    });
  }

  function onTextKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTextFields();
    }
  }

  const libraryValue = librariesFailed ? "" : state.library;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon
            icon={SearchIcon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
          />
          <Input
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
            onBlur={commitTextFields}
            onKeyDown={onTextKeyDown}
            placeholder="Search by title, author, ISBN, or keyword…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={state.field}
            onValueChange={(field) => {
              if (field == null) {
                return;
              }
              onSearch({ ...state, field, page: 1 });
            }}
          >
            <SelectTrigger className="h-9 min-w-36 text-sm">
              <SelectValue>
                {(value: string | null) => fieldOptionLabel(value ?? state.field)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {fieldOptions.map((field) => (
                <SelectItem key={field} value={field}>
                  {fieldOptionLabel(field)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.availability}
            onValueChange={(availability) => {
              if (availability == null) {
                return;
              }
              onSearch({
                ...state,
                availability: availability as CatalogSearchState["availability"],
                page: 1,
              });
            }}
          >
            <SelectTrigger className="h-9 min-w-36 text-sm">
              <SelectValue>
                {(value: string | null) => availabilityLabel(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="">Any availability</SelectItem>
              <SelectItem value="available">Available now</SelectItem>
              <SelectItem value="on_loan">All copies on loan</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={libraryValue}
            disabled={librariesFailed}
            onValueChange={(library) => {
              if (library == null) {
                return;
              }
              onSearch({ ...state, library, page: 1 });
            }}
          >
            <SelectTrigger className="h-9 min-w-36 text-sm">
              <SelectValue placeholder="Any library">
                {(value: string | null) =>
                  value
                    ? (libraries.find((lib) => lib.id === value)?.name ?? value)
                    : "Any library"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="">Any library</SelectItem>
              {libraries.map((lib) => (
                <SelectItem key={lib.id} value={lib.id}>
                  {lib.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortValue(state.sort, state.direction)}
            onValueChange={(value) => {
              if (value == null) {
                return;
              }
              const { sort, direction } = parseSortValue(value);
              onSearch({ ...state, sort, direction, page: 1 });
            }}
          >
            <SelectTrigger className="h-9 min-w-36 text-sm">
              <SelectValue>
                {(value: string | null) =>
                  (value && SORT_LABELS[value]) || "Title A–Z"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="title:asc">Title A–Z</SelectItem>
              <SelectItem value="title:desc">Title Z–A</SelectItem>
              <SelectItem value="author:asc">Author A–Z</SelectItem>
              <SelectItem value="author:desc">Author Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {advancedOpen ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Author contains
            </Label>
            <Input
              value={draftAuthor}
              onChange={(event) => setDraftAuthor(event.target.value)}
              onBlur={commitTextFields}
              onKeyDown={onTextKeyDown}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Publisher
            </Label>
            <Input
              value={draftPublisher}
              onChange={(event) => setDraftPublisher(event.target.value)}
              onBlur={commitTextFields}
              onKeyDown={onTextKeyDown}
              className="h-9 text-sm"
            />
          </div>
          {yearFilter ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Year from
                </Label>
                <Input
                  inputMode="numeric"
                  value={draftYearFrom}
                  onChange={(event) => setDraftYearFrom(event.target.value)}
                  onBlur={commitTextFields}
                  onKeyDown={onTextKeyDown}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Year to
                </Label>
                <Input
                  inputMode="numeric"
                  value={draftYearTo}
                  onChange={(event) => setDraftYearTo(event.target.value)}
                  onBlur={commitTextFields}
                  onKeyDown={onTextKeyDown}
                  className="h-9 text-sm"
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        {typeof total === "number" ? (
          <span>{total} records found</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          Advanced search
        </button>
      </div>
    </div>
  );
}