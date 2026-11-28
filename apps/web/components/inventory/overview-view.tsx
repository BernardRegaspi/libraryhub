/* eslint-disable react-hooks/set-state-in-effect -- overview fetches on session change */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchApi } from "@/lib/api";
import { downloadSessionExport } from "@/lib/inventory/export";
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

export function OverviewView({ active }: { active: boolean }) {
  const {
    sessionId,
    session,
    permissions,
    capabilities,
    selectSession,
    startSession,
    setView,
    openSessionDialog,
  } = useInventoryDesk();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [feed, setFeed] = useState<InventoryItemRow[]>([]);
  const [recentScans, setRecentScans] = useState<InventoryItemRow[]>([]);
  const [tableRows, setTableRows] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedSession = useRef<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>(
    "all",
  );

  const canManage = permissions.includes("inventory.manage");
  const snapshotBlocked = capabilities?.item_list === false;

  const loadOverview = useCallback(async () => {
    const sameSession = loadedSession.current === (sessionId ?? "");
    if (!sameSession) {
      setLoading(true);
    }
    try {
      const sessions = await fetchApi<Paged<InventorySession>>(
        `/inventory/sessions?status=${statusFilter}&per_page=20&page=1`,
      );
      setTableRows(sessions.items);
      if (!sessionId) {
        setSummary(null);
        setFeed([]);
        setRecentScans([]);
        loadedSession.current = "";
        return;
      }
      const sum = await fetchApi<SessionSummary>(
        `/inventory/sessions/${sessionId}/summary`,
      );
      setSummary(sum);
      if (!sameSession) {
        const recent = await fetchApi<Paged<InventoryItemRow>>(
          `/inventory/sessions/${sessionId}/items?condition=all&sort=scanned_at&direction=desc&per_page=50`,
        );
        const scanned = recent.items.filter((row) => row.scanned_at);
        setRecentScans(scanned);
        setFeed(scanned.slice(0, 8));
      }
      loadedSession.current = sessionId;
    } catch {
      if (!sameSession) {
        setSummary(null);
        setTableRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, statusFilter]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void loadOverview();
  }, [active, loadOverview]);

  const locationCoverage = useMemo(() => {
    const label = session?.locations?.length
      ? session.locations.join(", ")
      : "Whole home library";
    return [
      {
        location: label,
        expected: summary?.expected ?? 0,
        scanned: summary?.scanned ?? 0,
      },
    ];
  }, [session?.locations, summary?.expected, summary?.scanned]);

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

  const hours = useMemo(() => hourlyScanCounts(recentScans), [recentScans]);
  const hourMax = Math.max(1, ...hours.map((bucket) => bucket.count));

  return (
    <div className="space-y-5">
      {snapshotBlocked ? <KohaUnavailableBanner /> : null}
      {loading && !summary && tableRows.length === 0 ? (
        <ViewLoading label="Loading overview…" />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Expected items" value={summary?.expected ?? 0} hint="In the frozen snapshot" />
        <MetricCard label="Scanned & verified" value={summary?.scanned ?? 0} hint="Expected copies counted" />
        <MetricCard label="Open exceptions" value={summary?.open_exceptions ?? 0} hint="Need a review" />
        <MetricCard label="Unverified" value={summary?.unverified ?? 0} hint="No scan and no shelf search" />
        <MetricCard label="Proposals in flight" value={summary?.proposals_open ?? 0} hint="Draft, approved, or failed" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="flex flex-col gap-5 pt-5 sm:flex-row">
            <CompletionRing pct={pct} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">{session?.name ?? "Session progress"}</h2>
                {session ? <StatusChip status={session.status} /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {session
                  ? `${session.home_library_id || "Home library"} · ${
                      session.locations.length > 0 ? session.locations.join(", ") : "Whole home library"
                    }`
                  : "Plan a session to freeze the shelf list."}
              </p>
              <div className="mt-4">
                <ProgressBar summary={summary} total={barTotal} />
              </div>
              <Legend summary={summary} notFound={summary?.not_found ?? 0} />
              <div className="mt-4 flex flex-wrap gap-2">
                {session?.status === "in_progress" ? (
                  <Button type="button" size="lg" onClick={() => setView("scan")}>
                    Resume scanning
                  </Button>
                ) : null}
                {canManage && session?.status === "draft" ? (
                  <Button
                    type="button"
                    size="lg"
                    disabled={snapshotBlocked || startingId === session.id}
                    onClick={() => void handleStart(session.id)}
                  >
                    Start
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={!sessionId}
                  onClick={() => setView("exceptions")}
                >
                  Review exceptions
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">Scan activity</CardTitle>
            <p className="text-xs text-muted-foreground">Scans in the last 12 hours</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-1">
              {hours.map((bucket) => (
                <div key={bucket.start} className="flex h-full flex-1 flex-col justify-end">
                  <div
                    className="rounded-sm bg-primary/80"
                    style={{ height: `${Math.max(4, (bucket.count / hourMax) * 100)}%` }}
                    title={`${bucket.count} scans`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Scanned" value={String(summary?.scanned ?? 0)} />
              <Stat label="Exceptions" value={String(summary?.open_exceptions ?? 0)} />
              <Stat label="Complete" value={`${pct}%`} />
            </div>
            <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Operators planned</span>
                <span className="font-medium text-foreground">{session?.operator_ids.length ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[15px]">Coverage by location</CardTitle>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setView("scan")}>
              Scan plan
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {session?.status === "draft" && snapshotBlocked ? (
              <KohaUnavailableBanner />
            ) : !session ? (
              <ViewEmpty message="No session selected." />
            ) : (
              locationCoverage.map((row) => {
                const rowPct = row.expected === 0 ? 0 : Math.round((row.scanned / row.expected) * 100);
                return (
                  <div key={row.location}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{row.location}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.scanned}/{row.expected} · {rowPct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${rowPct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-[15px]">Live scan feed</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Stored in Library Hub. A scan does not change Koha.
              </p>
            </div>
            <Button type="button" variant="outline" size="lg" onClick={() => setView("scan")}>
              Open station
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {feed.length === 0 ? (
              <ViewEmpty message="No scan attempts yet." />
            ) : (
              feed.map((row, index) => (
                <div
                  key={`${row.scan_id ?? row.expected_item_id ?? index}`}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.title || "Item"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatClock(row.scanned_at)} · {row.operator_name || "—"}
                    </p>
                  </div>
                  <ConditionChip condition={row.condition} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-[15px]">Stocktake sessions</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Each session freezes the expected shelf list when it starts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-0.5">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter.id ? "secondary" : "ghost"}
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            {canManage ? (
              <Button type="button" variant="outline" size="lg" onClick={openSessionDialog}>
                Plan session
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {tableRows.length === 0 ? (
            <div className="px-5 py-4">
              <ViewEmpty message="No sessions match this filter." />
            </div>
          ) : (
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Session</th>
                  <th className="px-4 py-3 font-semibold">Home library</th>
                  <th className="px-4 py-3 font-semibold">Location scope</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 font-semibold">Last activity</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const selected = row.id === sessionId;
                  const scanned = selected ? (summary?.scanned ?? 0) : null;
                  const expected = row.expected_count ?? (selected ? summary?.expected : null);
                  const rowPct =
                    scanned != null && expected
                      ? Math.round((scanned / expected) * 100)
                      : 0;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                      onClick={() => selectSession(row.id)}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{row.name}</div>
                        <StatusChip status={row.status} />
                      </td>
                      <td className="px-4 py-3">{row.home_library_id || "—"}</td>
                      <td className="px-4 py-3">
                        {row.locations.length > 0 ? row.locations.join(", ") : "Whole library"}
                      </td>
                      <td className="px-4 py-3">
                        {scanned != null && expected != null ? (
                          <div className="w-36">
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {scanned} / {expected}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-emerald-500" style={{ width: `${rowPct}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">
                            {row.expected_count ?? "—"} expected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatWhen(row.updated_at)}</td>
                      <td className="px-5 py-3 text-right" onClick={(event) => event.stopPropagation()}>
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
                        {row.status === "completed" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={exportingId === row.id}
                            onClick={() => {
                              setExportingId(row.id);
                              void downloadSessionExport(row.id, {
                                kind: "filter",
                                format: "csv",
                                condition: "all",
                              }).finally(() => setExportingId(null));
                            }}
                          >
                            {exportingId === row.id ? "Exporting…" : "Export CSV"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-2.5">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function CompletionRing({ pct }: { pct: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative size-[148px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" className="stroke-muted" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-bold leading-none tabular-nums">{pct}%</div>
          <div className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
            SCANNED
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "in_progress"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "draft"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : status === "cancelled"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return (
    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {formatStatus(status)}
    </span>
  );
}

function ConditionChip({ condition }: { condition: string }) {
  const tone =
    condition === "found"
      ? "bg-emerald-500/10 text-emerald-700"
      : condition === "misplaced"
        ? "bg-amber-500/10 text-amber-800"
        : condition === "damaged"
          ? "bg-rose-500/10 text-rose-700"
          : condition === "withdrawn"
            ? "bg-violet-500/10 text-violet-700"
            : condition === "unexpected"
              ? "bg-sky-500/10 text-sky-700"
              : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${tone}`}>
      {condition.replace(/_/g, " ")}
    </span>
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
    { key: "damaged", value: summary.damaged, className: "bg-rose-500" },
    { key: "withdrawn", value: summary.withdrawn, className: "bg-violet-500" },
    { key: "unexpected", value: summary.unexpected, className: "bg-sky-500" },
  ];
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
      {items.map(([label, value]) => (
        <li key={label} className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function hourlyScanCounts(items: InventoryItemRow[]): { start: number; count: number }[] {
  const now = Date.now();
  const windowMs = 12 * 60 * 60 * 1000;
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    start: now - windowMs + index * 60 * 60 * 1000,
    count: 0,
  }));
  for (const row of items) {
    if (!row.scanned_at) {
      continue;
    }
    const stamp = new Date(row.scanned_at).getTime();
    const index = Math.floor((stamp - (now - windowMs)) / (60 * 60 * 1000));
    if (index >= 0 && index < buckets.length) {
      buckets[index].count += 1;
    }
  }
  return buckets;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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