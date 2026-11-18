"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ApiError, fetchApi } from "@/lib/api";
import type {
  CatalogConfig,
  CatalogCopy,
  CatalogItems,
  CatalogRecord,
} from "@/lib/catalog/types";

type RecordViewProps = {
  biblioId: number;
  searchParams: string;
};

function opacRecordUrl(opacUrl: string, biblioId: number): string {
  const base = opacUrl.replace(/\/$/, "");
  return `${base}/cgi-bin/koha/opac-detail.pl?biblionumber=${biblioId}`;
}

function copyFieldLines(copy: CatalogCopy): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  const push = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") {
      lines.push({ label, value: String(value) });
    }
  };

  push("Call number", copy.call_number);
  push("Copy number", copy.copy_number);
  push("Item type", copy.item_type_label ?? copy.item_type_id);
  push("Home library", copy.home_library_name ?? copy.home_library_id);
  push("Holding library", copy.holding_library_name ?? copy.holding_library_id);
  push("Location", copy.location);
  push("Status", copy.status_label ?? copy.status);
  if ("barcode" in copy) {
    push("Barcode", copy.barcode);
  }

  return lines;
}

export function RecordView({ biblioId, searchParams }: RecordViewProps) {
  const backHref = searchParams ? `/catalog?${searchParams}` : "/catalog";

  const configQuery = useQuery({
    queryKey: ["catalog", "config"],
    queryFn: () => fetchApi<CatalogConfig>("/catalog/config"),
  });

  const recordQuery = useQuery({
    queryKey: ["catalog", "biblio", biblioId],
    queryFn: () => fetchApi<CatalogRecord>(`/catalog/biblios/${biblioId}`),
  });

  const itemsQuery = useQuery({
    queryKey: ["catalog", "biblio", biblioId, "items"],
    queryFn: () => fetchApi<CatalogItems>(`/catalog/biblios/${biblioId}/items`),
  });

  const opacUrl = configQuery.data?.opac_url;

  if (recordQuery.isPending || itemsQuery.isPending) {
    return (
      <div className="px-6 py-8 lg:px-8">
        <p className="text-sm text-muted-foreground">Loading record…</p>
      </div>
    );
  }

  if (recordQuery.isError) {
    const error = recordQuery.error;
    const message =
      error instanceof ApiError
        ? (error.detail?.message ?? error.message)
        : "Could not load this record.";
    return (
      <div className="px-6 py-8 lg:px-8">
        <Button
          variant="link"
          className="h-auto p-0 text-sm"
          nativeButton={false}
          render={<Link href={backHref} />}
        >
          Back to results
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  const record = recordQuery.data;
  const items = itemsQuery.data;

  return (
    <div className="flex flex-col gap-8 px-6 py-8 lg:px-8">
      <div className="flex flex-col gap-4">
        <Button
          variant="link"
          className="h-auto w-fit p-0 text-sm"
          nativeButton={false}
          render={<Link href={backHref} />}
        >
          Back to results
        </Button>

        {typeof opacUrl === "string" ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={opacRecordUrl(opacUrl, biblioId)}
                target="_blank"
                rel="noopener"
              />
            }
          >
            View this record in the Koha OPAC
          </Button>
        ) : null}
      </div>

      <div className="flex max-w-3xl flex-col gap-3">
        {record.title != null ? (
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {record.title}
          </h1>
        ) : null}
        {record.contributors && record.contributors.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {record.contributors.join("; ")}
          </p>
        ) : null}
        {record.edition != null ? (
          <p className="text-sm text-muted-foreground">Edition: {record.edition}</p>
        ) : null}
        {record.place != null || record.publisher != null ? (
          <p className="text-sm text-muted-foreground">
            {[record.place, record.publisher].filter(Boolean).join(": ")}
          </p>
        ) : null}
        {record.year != null ? (
          <p className="text-sm text-muted-foreground">{record.year}</p>
        ) : null}
        {record.isbns && record.isbns.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            ISBN: {record.isbns.join(", ")}
          </p>
        ) : null}
        {record.subjects && record.subjects.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Subjects: {record.subjects.join("; ")}
          </p>
        ) : null}
        {record.description != null ? (
          <p className="text-sm text-foreground">{record.description}</p>
        ) : null}
      </div>

      {itemsQuery.isError ? (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Copies
          </h2>
          <p className="text-sm text-muted-foreground">Availability unavailable</p>
        </div>
      ) : items ? (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Copies
          </h2>
          {items.notice ? (
            <p className="text-sm text-muted-foreground">{items.notice}</p>
          ) : null}
          {typeof items.last_checked === "string" ? (
            <p className="text-sm text-muted-foreground">
              Last checked {items.last_checked}
            </p>
          ) : null}
          {items.copies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No copies listed.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.copies.map((copy, index) => {
                const lines = copyFieldLines(copy);
                return (
                  <li
                    key={index}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <ul className="flex flex-col gap-1">
                      {lines.map((line) => (
                        <li
                          key={line.label}
                          className="text-sm text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">
                            {line.label}:
                          </span>{" "}
                          {line.value}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}