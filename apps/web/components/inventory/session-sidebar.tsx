"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  InventoryScanListResponse,
  InventorySessionListResponse,
  InventorySessionStatus,
} from "@/lib/inventory/types";

type InventoryAuditItem = {
  action: string;
  details: Record<string, unknown>;
  actor_name: string | null;
  created_at: string;
};

type InventoryAuditListResponse = {
  items: InventoryAuditItem[];
};

function auditDetailReference(
  details: Record<string, unknown>,
): string | null {
  const reference = details.reference;
  if (typeof reference === "string" && reference.trim() !== "") {
    return reference;
  }
  return null;
}

function sessionStatusLabel(status: InventorySessionStatus): string {
  if (status === "draft") {
    return "Draft";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  if (status === "in_review") {
    return "In review";
  }
  return "Cancelled";
}

type SidebarQueryState<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

function SidebarGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SidebarError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 self-start"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

export function SessionSidebar({
  className,
  sessionId,
  sidebarScansQuery,
  sidebarAuditQuery,
  sidebarSessionsQuery,
}: {
  className?: string;
  sessionId: string;
  sidebarScansQuery: SidebarQueryState<InventoryScanListResponse>;
  sidebarAuditQuery: SidebarQueryState<InventoryAuditListResponse>;
  sidebarSessionsQuery: SidebarQueryState<InventorySessionListResponse>;
}) {
  const latestScans = sidebarScansQuery.data?.items ?? [];
  const auditItems = sidebarAuditQuery.data?.items ?? [];
  const otherSessions = (sidebarSessionsQuery.data?.items ?? [])
    .filter((row) => row.id !== sessionId)
    .slice(0, 5);

  return (
    <aside
      className={`flex min-w-0 flex-col gap-4 ${className ?? ""}`}
      aria-label="Session activity"
    >
      <SidebarGroup title="Recent scans">
        {sidebarScansQuery.isError ? (
          <SidebarError
            message="Recent scans could not be loaded."
            onRetry={() => {
              void sidebarScansQuery.refetch();
            }}
          />
        ) : sidebarScansQuery.isPending ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : latestScans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {latestScans.map((scan) => (
              <li
                key={scan.id}
                className="flex min-w-0 flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <span className="truncate font-mono text-sm text-foreground">
                  {scan.barcode}
                </span>
                <span className="text-xs text-muted-foreground">
                  {scan.outcome_label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SidebarGroup>

      <SidebarGroup title="Audit trail">
        {sidebarAuditQuery.isError ? (
          <SidebarError
            message="Audit could not be loaded."
            onRetry={() => {
              void sidebarAuditQuery.refetch();
            }}
          />
        ) : sidebarAuditQuery.isPending ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : auditItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-3">
            {auditItems.map((entry, index) => {
              const reference = auditDetailReference(entry.details);
              return (
                <li
                  key={`${entry.action}-${entry.created_at}-${index}`}
                  className="flex min-w-0 flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="break-words text-sm text-foreground">
                    {entry.action}
                  </span>
                  {reference ? (
                    <span className="text-xs text-muted-foreground">
                      {reference}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {entry.actor_name ?? "Unknown"}
                    <span aria-hidden="true"> · </span>
                    {entry.created_at}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SidebarGroup>

      <SidebarGroup title="Other sessions">
        {sidebarSessionsQuery.isError ? (
          <SidebarError
            message="Other sessions could not be loaded."
            onRetry={() => {
              void sidebarSessionsQuery.refetch();
            }}
          />
        ) : sidebarSessionsQuery.isPending ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : otherSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other sessions.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {otherSessions.map((other) => (
              <li key={other.id} className="min-w-0">
                <Link
                  href={`/inventory/${other.id}`}
                  className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="truncate font-medium text-foreground">
                    {other.reference}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {sessionStatusLabel(other.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SidebarGroup>
    </aside>
  );
}