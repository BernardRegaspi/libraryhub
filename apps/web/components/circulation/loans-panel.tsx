"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi } from "@/lib/api";
import { submitScanValue } from "@/lib/circulation/scan";
import type { DeskPatron } from "@/lib/circulation/types";
import { displayName, formatPatronDate } from "@/lib/patrons/display";

import { apiErrorMessage } from "./api-error";

type LoansPanelProps = {
  permissions: string[];
};

type LoanItem = {
  checkout_id: number;
  item_id: number;
  title: string | null;
  author: string | null;
  due_date: string | null;
  overdue: boolean | null;
  external_id?: string | null;
};

type LoansResponse = {
  items: LoanItem[];
  page: number;
  per_page: number;
  total: number | null;
  has_next: boolean;
};

export function LoansPanel({ permissions: _permissions }: LoansPanelProps) {
  const cardRef = useRef<HTMLInputElement>(null);
  const [patron, setPatron] = useState<DeskPatron | null>(null);
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const loadLoans = useCallback(
    async (patronId: number, nextPage: number, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          patron_id: String(patronId),
          page: String(nextPage),
          per_page: "20",
          sort: "due_date",
          direction: "asc",
        });
        if (q.trim()) {
          params.set("q", q.trim());
        }
        const response = await fetchApi<LoansResponse>(
          `/circulation/loans?${params.toString()}`,
        );
        setLoans(response.items);
        setPage(response.page);
        setHasNext(response.has_next);
      } catch (err) {
        setLoans([]);
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const lookupCard = useCallback(
    async (cardnumber: string) => {
      setError(null);
      try {
        const found = await fetchApi<DeskPatron>(
          `/circulation/patrons/by-card?${new URLSearchParams({ cardnumber }).toString()}`,
        );
        setPatron(found);
        if (found.patron_id != null) {
          await loadLoans(found.patron_id, 1, query);
        }
      } catch (err) {
        setPatron(null);
        setLoans([]);
        setError(apiErrorMessage(err));
      }
    },
    [loadLoans, query],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== "Tab") {
      return;
    }
    const submitted = submitScanValue(event.currentTarget.value);
    if (!submitted.ok) {
      if (submitted.message) {
        setError(submitted.message);
      }
      return;
    }
    event.preventDefault();
    event.currentTarget.value = "";
    void lookupCard(submitted.value);
    event.currentTarget.focus();
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Patron card scan</span>
        <Input
          ref={cardRef}
          autoComplete="off"
          placeholder="Scan card"
          onKeyDown={handleKeyDown}
        />
      </label>

      {patron ? (
        <p className="text-sm text-foreground">
          {displayName({ ...patron, patron_id: patron.patron_id ?? 0 })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by title or barcode"
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!patron?.patron_id || loading}
          onClick={() => {
            if (patron?.patron_id != null) {
              void loadLoans(patron.patron_id, 1, query);
            }
          }}
        >
          Search
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading loans…</p>
      ) : loans.length === 0 && patron ? (
        <p className="text-sm text-muted-foreground">No open loans.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.checkout_id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">{loan.title ?? "—"}</p>
                    <p className="text-muted-foreground">{loan.author ?? "—"}</p>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatPatronDate(loan.due_date)}
                  </td>
                  <td className="px-3 py-2">
                    {loan.overdue === true ? (
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Overdue
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {patron?.patron_id != null && (page > 1 || hasNext) ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void loadLoans(patron.patron_id!, page - 1, query)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext || loading}
            onClick={() => void loadLoans(patron.patron_id!, page + 1, query)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}