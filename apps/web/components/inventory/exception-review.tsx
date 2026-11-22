"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi } from "@/lib/api";
import { actionsFor } from "@/lib/inventory/actions";
import type {
  InventoryScan,
  InventoryScanListResponse,
  InventoryScanOutcome,
  InventorySessionStatus,
} from "@/lib/inventory/types";

const NO_TITLE = "No title from Koha";

const NO_EXCEPTIONS_COPY = "No exceptions to review.";

type DecisionResponse = {
  scan_id: string;
  action: string;
  decision: "approved" | "no_action" | null;
  decided_by: string | null;
  decided_at: string | null;
};

function outcomeBadgeClass(outcome: InventoryScanOutcome): string {
  if (outcome === "verified") {
    return "bg-gold-100 text-gold-700";
  }
  if (outcome === "duplicate") {
    return "text-foreground";
  }
  return "bg-maroon-50 text-maroon-700";
}

function reviewDecisionStatusLine(
  review: InventoryScan["decision"],
): string | null {
  if (!review || review.decision === null) {
    return null;
  }
  const word = review.decision === "approved" ? "Approve" : "No action";
  if (review.decided_by && review.decided_by.trim() !== "") {
    return `${word} · ${review.decided_by}`;
  }
  return word;
}

function ExceptionReviewRow({
  sessionId,
  scan,
  controlsEnabled,
}: {
  sessionId: string;
  scan: InventoryScan;
  controlsEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const pairs = actionsFor(scan.outcome);
  const [selectedAction, setSelectedAction] = useState(
    () => scan.decision?.action ?? "",
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowPending, setRowPending] = useState(false);

  useEffect(() => {
    setSelectedAction(scan.decision?.action ?? "");
  }, [scan.id, scan.decision?.action]);

  const buttonsDisabled =
    !controlsEnabled || !selectedAction || rowPending;
  const decisionStatus = reviewDecisionStatusLine(scan.decision);

  async function saveDecision(
    action: string,
    decision: "approved" | "no_action" | null,
  ) {
    setRowPending(true);
    setRowError(null);
    try {
      const response = await fetchApi<DecisionResponse>(
        `/inventory/sessions/${sessionId}/scans/${scan.id}/decision`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, decision }),
        },
      );
      setSelectedAction(response.action);
      queryClient.setQueriesData<InventoryScanListResponse>(
        { queryKey: ["inventory", "session", sessionId, "exceptions"] },
        (cached) => {
          if (!cached) {
            return cached;
          }
          return {
            ...cached,
            items: cached.items.map((row) =>
              row.id === response.scan_id
                ? {
                    ...row,
                    decision: {
                      action: response.action,
                      decision: response.decision,
                      decided_by: response.decided_by,
                      decided_at: response.decided_at,
                    },
                  }
                : row,
            ),
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "audit"],
      });
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (caught.detail?.message ?? caught.message)
          : caught instanceof Error
            ? caught.message
            : "Decision not saved.";
      setRowError(message);
    } finally {
      setRowPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <p className="font-mono text-sm text-foreground">{scan.barcode}</p>
        <p
          className={`inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium ${outcomeBadgeClass(scan.outcome)}`}
        >
          {scan.outcome_label}
        </p>
      </div>
      <p className="text-sm text-foreground">{scan.title ?? NO_TITLE}</p>
      {scan.message ? (
        <p className="text-sm text-muted-foreground">{scan.message}</p>
      ) : null}
      {decisionStatus ? (
        <p className="text-sm text-foreground">{decisionStatus}</p>
      ) : null}
      {pairs ? (
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={selectedAction}
            disabled={!controlsEnabled || rowPending}
            onValueChange={(value) => {
              if (value == null || value === "") {
                return;
              }
              setSelectedAction(value);
              void saveDecision(value, null);
            }}
          >
            <SelectTrigger className="min-h-11 w-full min-w-0 text-sm sm:min-w-64 sm:flex-1">
              <SelectValue placeholder="Choose an action" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {pairs.map((sentence) => (
                <SelectItem key={sentence} value={sentence}>
                  {sentence}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={buttonsDisabled}
              onClick={() => {
                void saveDecision(selectedAction, "approved");
              }}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={buttonsDisabled}
              onClick={() => {
                void saveDecision(selectedAction, "no_action");
              }}
            >
              No action
            </Button>
          </div>
        </div>
      ) : null}
      {rowError ? (
        <p className="text-sm text-destructive">{rowError}</p>
      ) : null}
    </div>
  );
}

export function ExceptionReviewPanel({
  sessionId,
  status,
  exceptionsQuery,
  reviewPage,
  onReviewPageChange,
}: {
  sessionId: string;
  status: InventorySessionStatus;
  exceptionsQuery: {
    data: InventoryScanListResponse | undefined;
    isPending: boolean;
    isPlaceholderData: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  };
  reviewPage: number;
  onReviewPageChange: (page: number) => void;
}) {
  const items = exceptionsQuery.data?.items ?? [];
  const pending =
    exceptionsQuery.isPending || exceptionsQuery.isPlaceholderData;
  const page = exceptionsQuery.data?.page ?? reviewPage;
  const total = exceptionsQuery.data?.total ?? null;
  const hasNext = exceptionsQuery.data?.has_next ?? false;
  const controlsEnabled = status === "in_review";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-foreground">
        Exception review
      </h2>
      {exceptionsQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">
            {exceptionsQuery.error instanceof Error
              ? exceptionsQuery.error.message
              : "Exceptions could not be loaded."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => {
              void exceptionsQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : pending ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{NO_EXCEPTIONS_COPY}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {items.map((scan) => (
            <ExceptionReviewRow
              key={scan.id}
              sessionId={sessionId}
              scan={scan}
              controlsEnabled={controlsEnabled}
            />
          ))}
        </div>
      )}

      {!exceptionsQuery.isError && !pending && (total ?? 0) > 0 ? (
        <CatalogPagination
          page={page}
          total={total}
          perPage={20}
          hasNext={hasNext}
          onPage={onReviewPageChange}
        />
      ) : null}
    </div>
  );
}