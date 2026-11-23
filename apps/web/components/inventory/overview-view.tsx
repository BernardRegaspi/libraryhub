/* eslint-disable react-hooks/set-state-in-effect -- overview fetches on session change */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { KohaUnavailableBanner, ViewEmpty, ViewLoading } from "./view-states";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "planned", label: "Planned" },
  { id: "active", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "closed", label: "Closed" },
] as const;

const COUNTING = new Set([
  "found",
  "misplaced",
  "damaged",
  "withdrawn",
  "unexpected",
]);

export function OverviewView() {
  const {
    sessionId,
    session,
    permissions,
    capabilities,
    selectSession,
    startSession,
    setView,
  } = useInventoryDesk();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [feed, setFeed] = useState<InventoryItemRow[]>([]);
  const [tableRows, setTableRows] = useState<InventorySession[]>([]);
  const [allItems, setAllItems] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>(
    "all",
  );

  const canManage = permissions.includes("inventory.manage");
  const snapshotBlocked = capabilities?.item_list === false;

  const loadAllItems = useCallback(async (id: string) => {
    const rows: InventoryItemRow[] = [];
    let page = 1;
    let total = 1;
    while (rows.length < total) {
      const data = await fetchApi<Paged<InventoryItemRow>>(
        `/inventory/sessions/${id}/items?condition=all&per_page=50&page=${page}`,
      );
      rows.push(...data.items);
      total = data.total;
      page += 1;
      if (page > 200) {
        break;
      }
    }
    return rows;
  }, []);

  const loadOverview = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      const [sum, notFound, items, sessions, fullItems] = await Promise.all([
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
        loadAllItems(sessionId),
      ]);
      setSummary(sum);
      setNotFoundCount(notFound.total);
      setFeed(items.items.filter((row) => row.scanned_at));
      setTableRows(sessions.items);
      setAllItems(fullItems);
    } finally {
      setLoading(false);
    }
  }, [loadAllItems, sessionId, statusFilter]);

  useEffect(() => {
    void loadOverview().catch(() => {
      setSummary(null);
      setLoading(false);
    });
  }, [loadOverview]);

  const locationCoverage = useMemo(() => {
    const expectedRows = allItems.filter((row) => row.expected_item_id);
    const locations = session?.locations?.length
      ? session.locations
      : ["(whole home library)"];
    return locations.map((location) => {
      const inScope =
        location === "(whole home library)"
          ? expectedRows
          : expectedRows.filter((row) => row.snapshot_location === location);
      const scanned = inScope.filter((row) => COUNTING.has(row.condition)).length;
      return { location, expected: inScope.length, scanned };
    });
  }, [allItems, session?.locations]);

  const handleStart = async (id: string) => {
    if (snapshotBlocked || !canManage) {
      return;
    }
    setStartingId(id);
    try {
      await startSession(id);
    } finally {
      setStartingId(null);
    }
  };

  const pct = Math.round((summary?.completion ?? 0) * 100);
  const barTotal = Math.max(
    1,
    (summary?.found ?? 0) +
      (summary?.misplaced ?? 0) +
      (summary?.damaged ?? 0) +
      (summary?.withdrawn ?? 0) +
      (summary?.unexpected ?? 0),
  );

  if (!sessionId) {
    return <ViewEmpty message="Select or create a session." />;
  }

  if (loading && !summary) {
    return <ViewLoading label="Loading overview…" />;
  }

  return (
    <div className="space-y-4">
      {snapshotBlocked ? <KohaUnavailableBanner /> : null}

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
            <CardTitle className="text-base">Coverage by location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {session?.status === "draft" && snapshotBlocked ? (
              <KohaUnavailableBanner />
            ) : locationCoverage.length === 0 ? (
              <ViewEmpty message="No expected items in the snapshot yet." />
            ) : (
              locationCoverage.map((row) => (
                <div
                  key={row.location}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <span className="font-medium">{row.location}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.scanned} / {row.expected} scanned
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {feed.length === 0 ? (
            <ViewEmpty message="No scan attempts yet." />
          ) : (
            feed.map((row, index) => (
              <div
                key={`${row.scan_id ?? row.expected_item_id ?? index}`}
                className="border-b border-border pb-2 last:border-0"
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
          {tableRows.length === 0 ? (
            <ViewEmpty message="No sessions match this filter." />
          ) : (
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
                      {canManage && row.status === "draft" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={snapshotBlocked || startingId === row.id}
                          onClick={() => void handleStart(row.id)}
                        >
                          Start
                        </Button>
                      ) : null}
                      {row.status === "in_progress" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            selectSession(row.id);
                            setView("scan");
                          }}
                        >
                          Scan
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
    { key: "unexpected", value: summary.unexpected, className: "bg-primary" },
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