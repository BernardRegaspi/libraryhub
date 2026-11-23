"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api";
import type { CirculationCapabilities } from "@/lib/circulation/types";
import { formatPatronDate } from "@/lib/patrons/display";

import { apiErrorMessage } from "./api-error";

type HistoryPanelProps = {
  permissions: string[];
};

type HistoryItem = {
  checkout_id: number;
  title: string | null;
  type?: string | null;
  due_date?: string | null;
  returned_date?: string | null;
  patron_name?: string | null;
};

type HistoryResponse = {
  items: HistoryItem[];
  page: number;
  has_next: boolean;
};

export function HistoryPanel({ permissions: _permissions }: HistoryPanelProps) {
  const [capabilities, setCapabilities] = useState<CirculationCapabilities | null>(
    null,
  );
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchApi<CirculationCapabilities>("/circulation/capabilities")
      .then((caps) => {
        if (!cancelled) {
          setCapabilities(caps);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(apiErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCaps(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadHistory = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi<HistoryResponse>(
        `/circulation/history?${new URLSearchParams({
          page: String(nextPage),
          per_page: "20",
        }).toString()}`,
      );
      setItems(response.items);
      setPage(response.page);
      setHasNext(response.has_next);
    } catch (err) {
      setItems([]);
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capabilities?.history) {
      void loadHistory(1);
    }
  }, [capabilities?.history, loadHistory]);

  if (loadingCaps) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!capabilities?.history) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        This Koha operation is not available.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Patron</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Dates</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={`${row.checkout_id}-${row.type ?? "loan"}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.patron_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.title ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.type ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatPatronDate(row.due_date ?? null)}
                    {row.returned_date
                      ? ` · Returned ${formatPatronDate(row.returned_date)}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page > 1 || hasNext ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void loadHistory(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext || loading}
            onClick={() => void loadHistory(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}