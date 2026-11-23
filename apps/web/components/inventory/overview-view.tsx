/* eslint-disable react-hooks/set-state-in-effect -- overview fetches on session change */
"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchApi } from "@/lib/api";
import type {
  InventoryItemRow,
  InventorySession,
  Paged,
  SessionSummary,
} from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";

type OverviewViewProps = {
  onOpenScan: () => void;
};

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "planned", label: "Planned" },
  { id: "active", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "closed", label: "Closed" },
] as const;

export function OverviewView({ onOpenScan }: OverviewViewProps) {
  const { sessionId, session, permissions, refreshSessions } = useInventoryDesk();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [feed, setFeed] = useState<InventoryItemRow[]>([]);
  const [tableRows, setTableRows] = useState<InventorySession[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>(
    "all",
  );

  const canManage = permissions.includes("inventory.manage");

  const loadOverview = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    const [sum, notFound, items, sessions] = await Promise.all([
      fetchApi<SessionSummary>(`/inventory/sessions/${sessionId}/summary`),
      fetchApi<Paged<InventoryItemRow>>(
        `/inventory/sessions/${sessionId}/items?condition=not_found&per_page=1`,
      ),
      fetchApi<Paged<InventoryItemRow>>(
        `/inventory/sessions/${sessionId}/items?condition=all&sort=scanned_at&direction=desc&per_page=8`,
      ),
      fetchApi<Paged<InventorySession>>(
        `/inventory/sessions?status=${statusFilter}&per_page=20&page=1`,
      ),
    ]);
    setSummary(sum);
    setNotFoundCount(notFound.total);
    setFeed(items.items.filter((row) => row.scanned_at));
    setTableRows(sessions.items);
  }, [sessionId, statusFilter]);

  useEffect(() => {
    void loadOverview().catch(() => {
      setSummary(null);
    });
  }, [loadOverview]);

  const startDraft = useCallback(async () => {
    if (!sessionId || session?.status !== "draft") {
      return;
    }
    await fetchApi(`/inventory/sessions/${sessionId}/start`, { method: "POST" });
    await refreshSessions();
    onOpenScan();
  }, [onOpenScan, refreshSessions, session?.status, sessionId]);

  const pct = Math.round((summary?.completion ?? 0) * 100);
  const barTotal = Math.max(
    1,
    (summary?.found ?? 0) +
      (summary?.misplaced ?? 0) +
      (summary?.damaged ?? 0) +
      (summary?.withdrawn ?? 0) +
      (summary?.unexpected ?? 0),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Expected items" value={summary?.expected ?? 0} />
        <MetricCard label="Scanned expected items" value={summary?.scanned ?? 0} />
        <MetricCard label="Open exceptions" value={summary?.open_exceptions ?? 0} />
        <MetricCard label="Unverified items" value={summary?.unverified ?? 0} />
        <MetricCard label="Open proposals" value={summary?.proposals_open ?? 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Completion</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div
              className="relative flex size-28 items-center justify-center rounded-full border-4 border-primary/20"
              style={{
                background: `conic-gradient(hsl(var(--primary)) ${pct}%, transparent 0)`,
              }}
            >
              <span className="rounded-full bg-background px-3 py-1 text-lg font-semibold">
                {pct}%
              </span>
            </div>
            <ProgressBar summary={summary} total={barTotal} />
            <Legend summary={summary} notFound={notFoundCount} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Scan feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {feed.length === 0 ? (
              <p className="text-muted-foreground">No scan attempts yet.</p>
            ) : (
              feed.map((row, index) => (
                <div
                  key={`${row.scan_id ?? row.expected_item_id ?? index}`}
                  className="border-b pb-2 last:border-0"
                >
                  <p className="font-medium">{row.title || "Item"}</p>
                  <p className="text-muted-foreground">
                    {row.condition} · {row.operator_name || "—"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Sessions</CardTitle>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                size="sm"
                variant={statusFilter === filter.id ? "default" : "outline"}
                onClick={() => setStatusFilter(filter.id)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{formatStatus(row.status)}</td>
                  <td className="px-3 py-2">{row.expected_count ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage && row.status === "draft" && row.id === sessionId ? (
                      <Button type="button" size="sm" onClick={() => void startDraft()}>
                        Start
                      </Button>
                    ) : null}
                    {row.status === "in_progress" && row.id === sessionId ? (
                      <Button type="button" size="sm" variant="outline" onClick={onOpenScan}>
                        Scan
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ProgressBar({
  summary,
  total,
}: {
  summary: SessionSummary | null;
  total: number;
}) {
  if (!summary) {
    return null;
  }
  const segments = [
    { key: "found", value: summary.found, className: "bg-emerald-500" },
    { key: "misplaced", value: summary.misplaced, className: "bg-amber-500" },
    { key: "damaged", value: summary.damaged, className: "bg-orange-500" },
    { key: "withdrawn", value: summary.withdrawn, className: "bg-slate-500" },
    { key: "unexpected", value: summary.unexpected, className: "bg-rose-500" },
  ];
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={segment.className}
          style={{ width: `${(segment.value / total) * 100}%` }}
          title={`${segment.key}: ${segment.value}`}
        />
      ))}
    </div>
  );
}

function Legend({
  summary,
  notFound,
}: {
  summary: SessionSummary | null;
  notFound: number;
}) {
  if (!summary) {
    return null;
  }
  const items = [
    ["Found", summary.found],
    ["Misplaced", summary.misplaced],
    ["Damaged", summary.damaged],
    ["Withdrawn", summary.withdrawn],
    ["Unexpected", summary.unexpected],
    ["Unverified", summary.unverified],
    ["Not Found", notFound],
  ] as const;
  return (
    <ul className="grid w-full grid-cols-2 gap-1 text-xs text-muted-foreground">
      {items.map(([label, value]) => (
        <li key={label}>
          {label}: {value}
        </li>
      ))}
    </ul>
  );
}

function formatStatus(status: string): string {
  if (status === "draft") {
    return "Planned";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  return status.replace("_", " ");
}
