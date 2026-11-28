/* eslint-disable react-hooks/set-state-in-effect -- scan view loads counts and focuses field */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, fetchApi } from "@/lib/api";
import { useInventoryBarcodeWedge } from "@/lib/inventory/barcode-wedge";
import { acceptInventoryScan } from "@/lib/inventory/scan";
import type { InventoryItemRow, Paged, ScanResponse, SessionSummary } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";
import { KohaUnavailableBanner, ViewEmpty, ViewLoading } from "./view-states";

const COUNTING = new Set([
  "found",
  "misplaced",
  "damaged",
  "withdrawn",
  "unexpected",
]);

const OUTCOME_META: Record<string, { label: string; className: string; hint: string }> = {
  found: {
    label: "Matched",
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    hint: "Barcode found in the expected Koha item set. Item marked seen.",
  },
  misplaced: {
    label: "Misplaced",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    hint: "Item belongs on a different shelf than where it was scanned.",
  },
  unexpected: {
    label: "Unexpected",
    className: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200",
    hint: "Valid in Koha but outside this session’s expected scope.",
  },
  damaged: {
    label: "Damaged",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-200",
    hint: "Operator marked physical damage. Koha status unchanged until approval.",
  },
  withdrawn: {
    label: "Withdrawal req.",
    className: "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    hint: "Withdrawn in Koha within this session scope.",
  },
  duplicate: {
    label: "Duplicate",
    className: "border-border bg-muted text-muted-foreground",
    hint: "This copy was already counted in this session.",
  },
  invalid: {
    label: "Invalid",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    hint: "Barcode not recognised or ambiguous in Koha.",
  },
  koha_error: {
    label: "Koha unavailable",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    hint: "Koha did not respond. Try again when the link is healthy.",
  },
};

const SESSION_STATS: Array<{
  key: keyof SessionSummary | "matched";
  label: string;
  bar: string;
  value: (s: SessionSummary) => number;
}> = [
  { key: "matched", label: "Matched", bar: "bg-emerald-500", value: (s) => s.found ?? 0 },
  { key: "misplaced", label: "Misplaced", bar: "bg-amber-500", value: (s) => s.misplaced ?? 0 },
  { key: "unexpected", label: "Unexpected", bar: "bg-sky-500", value: (s) => s.unexpected ?? 0 },
  { key: "damaged", label: "Damaged", bar: "bg-rose-500", value: (s) => s.damaged ?? 0 },
  {
    key: "withdrawn",
    label: "Withdrawal req.",
    bar: "bg-violet-500",
    value: (s) => s.withdrawn ?? 0,
  },
  { key: "not_found", label: "Not found", bar: "bg-orange-500", value: (s) => s.not_found ?? 0 },
];

const CAPTURE_DEVICES = [
  {
    id: "wedge",
    name: "Zebra DS2278",
    type: "USB-HID keyboard wedge",
    status: "online" as const,
    active: true,
  },
  {
    id: "mc",
    name: "Zebra MC3390",
    type: "Wi-Fi · batch mode",
    status: "online" as const,
    battery: "75%",
    active: false,
  },
  {
    id: "camera",
    name: "Mobile camera",
    type: "Browser capture",
    status: "idle" as const,
    active: false,
  },
  {
    id: "manual",
    name: "Manual entry",
    type: "Keyboard",
    status: "ready" as const,
    active: false,
  },
];

type LocalScanRow = {
  key: string;
  title: string;
  condition: string;
};

export function ScanView() {
  const {
    sessionId,
    session,
    permissions,
    capabilities,
    userId,
    refreshSession,
    setView,
  } = useInventoryDesk();
  const scanRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [beamVisible, setBeamVisible] = useState(false);
  const [stationLocation, setStationLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [markingDamage, setMarkingDamage] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResponse | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [mineRows, setMineRows] = useState<LocalScanRow[]>([]);

  const canManage = permissions.includes("inventory.manage");
  const sessionLocations = useMemo(() => session?.locations ?? [], [session?.locations]);
  const needsStation = sessionLocations.length > 0;
  const kohaBlocked = capabilities?.item_list === false;
  const scanningAllowed = Boolean(
    sessionId && canManage && session?.status === "in_progress" && !kohaBlocked,
  );

  const loadSide = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      const [sum, items] = await Promise.all([
        fetchApi<SessionSummary>(`/inventory/sessions/${sessionId}/summary`),
        fetchApi<Paged<InventoryItemRow>>(
          `/inventory/sessions/${sessionId}/items?condition=all&sort=scanned_at&direction=desc&per_page=50`,
        ),
      ]);
      setSummary(sum);
      const fromApi = items.items
        .filter(
          (row) =>
            row.scanned_at &&
            COUNTING.has(row.condition) &&
            (row.operator_id == null || row.operator_id === userId),
        )
        .map((row) => ({
          key: row.scan_id ?? `${row.expected_item_id}-${row.scanned_at}`,
          title: row.title || "Item",
          condition: row.condition,
        }));
      setMineRows((current) => {
        const apiKeys = new Set(fromApi.map((row) => row.key));
        const locals = current.filter((row) => !apiKeys.has(row.key));
        return [...locals, ...fromApi].slice(0, 20);
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, userId]);

  useEffect(() => {
    scanRef.current?.focus();
    void loadSide().catch(() => {
      setSummary(null);
      setLoading(false);
    });
  }, [loadSide]);

  useEffect(() => {
    if (sessionLocations.length === 1) {
      setStationLocation(sessionLocations[0]);
    }
  }, [sessionLocations]);

  const submitScan = useCallback(
    async (raw?: string) => {
      const value = (raw ?? barcode).trim();
      if (!sessionId || !canManage || session?.status !== "in_progress") {
        return;
      }
      if (needsStation && !stationLocation) {
        setError("Choose a station location.");
        return;
      }
      const accepted = acceptInventoryScan(value, inflightRef.current);
      if (!accepted.ok) {
        if (accepted.message) {
          setError(accepted.message);
        }
        return;
      }
      setError(null);
      inflightRef.current = accepted.value;
      setSubmitting(true);
      try {
        const body = await fetchApi<ScanResponse>(`/inventory/sessions/${sessionId}/scans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: accepted.value,
            station_location: needsStation ? stationLocation : null,
            damaged: false,
          }),
        });
        setLastResult(body);
        if (body.counts) {
          setMineRows((rows) =>
            [
              {
                key: body.id ?? `${accepted.value}-${Date.now()}`,
                title: body.title ?? "Item",
                condition: body.outcome,
              },
              ...rows,
            ].slice(0, 20),
          );
        }
        setBarcode("");
        await loadSide();
        await refreshSession();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Scan failed.");
      } finally {
        inflightRef.current = null;
        setSubmitting(false);
        scanRef.current?.focus();
      }
    },
    [
      barcode,
      canManage,
      loadSide,
      needsStation,
      refreshSession,
      session?.status,
      sessionId,
      stationLocation,
    ],
  );

  useInventoryBarcodeWedge({
    enabled: scanningAllowed,
    scanInputRef: scanRef,
    onScan: (value) => {
      void submitScan(value);
    },
  });

  const markLastDamaged = useCallback(async () => {
    if (!sessionId || !lastResult?.id || !canManage) {
      return;
    }
    if (lastResult.outcome === "damaged" && lastResult.observed_damaged) {
      return;
    }
    setMarkingDamage(true);
    setError(null);
    try {
      const body = await fetchApi<ScanResponse>(
        `/inventory/sessions/${sessionId}/scans/${lastResult.id}/damage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            damaged: true,
            remark: "Marked damaged at scan station",
          }),
        },
      );
      setLastResult(body);
      setMineRows((rows) =>
        rows.map((row) =>
          row.key === body.id ? { ...row, condition: body.outcome } : row,
        ),
      );
      await loadSide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark as damaged.");
    } finally {
      setMarkingDamage(false);
    }
  }, [canManage, lastResult, loadSide, sessionId]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitScan();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitScan();
  };

  const finishSession = useCallback(async () => {
    if (!sessionId || !canManage || session?.status !== "in_progress") {
      return;
    }
    setFinishing(true);
    setError(null);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/complete`, { method: "POST" });
      setConfirmFinish(false);
      await refreshSession();
      await loadSide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not finish the session.");
    } finally {
      setFinishing(false);
    }
  }, [canManage, loadSide, refreshSession, session?.status, sessionId]);

  const canMarkDamaged = Boolean(
    lastResult?.id &&
      lastResult.counts &&
      ["found", "misplaced", "unexpected", "withdrawn", "damaged"].includes(
        lastResult.outcome,
      ),
  );

  const lastDamaged = lastResult?.outcome === "damaged" || lastResult?.observed_damaged;

  if (kohaBlocked) {
    return <KohaUnavailableBanner />;
  }

  if (session?.status === "completed") {
    return (
      <FinishedResults sessionId={sessionId} summary={summary} loading={loading && !summary} />
    );
  }

  if (session?.status !== "in_progress") {
    return (
      <ViewEmpty message="Scanning is available while the session is in progress." />
    );
  }

  if (loading && !summary) {
    return <ViewLoading label="Loading scan view…" />;
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setConfirmFinish(true)}>
            Finish session
          </Button>
        </div>
      ) : null}
      <FinishSessionDialog
        open={confirmFinish}
        finishing={finishing}
        onOpenChange={setConfirmFinish}
        onConfirm={() => void finishSession()}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card className="overflow-hidden py-0">
          <ScanCaptureHeader />
          <CardContent className="space-y-0 px-0 pb-0">
            {needsStation ? (
              <div className="space-y-2 border-b border-border px-5 py-4">
                <Label htmlFor="station-location">Station location</Label>
                <Select
                  value={stationLocation}
                  onValueChange={(value) => setStationLocation(value ?? "")}
                >
                  <SelectTrigger id="station-location" className="w-full sm:max-w-xs">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessionLocations.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="px-5 py-5">
              <div className="relative">
                <div
                  className={`pointer-events-none absolute inset-0 overflow-hidden rounded-2xl transition-opacity ${
                    beamVisible ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                >
                  <div className="inventory-scan-beam absolute inset-0 rounded-2xl" />
                </div>
                <form
                  className="relative flex items-center gap-3 rounded-2xl border-2 border-indigo-500/40 bg-muted/30 px-4 py-3.5 focus-within:border-indigo-500"
                  onSubmit={onSubmit}
                >
                  <BarcodeIcon />
                  <Input
                    ref={scanRef}
                    autoComplete="off"
                    spellCheck={false}
                    value={barcode}
                    disabled={!canManage || submitting}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={() => setBeamVisible(true)}
                    onBlur={() => setBeamVisible(false)}
                    placeholder="Scan or type barcode, then press Enter…"
                    aria-label="Barcode"
                    className="h-auto border-0 bg-transparent font-mono text-lg tracking-wide shadow-none focus-visible:ring-0"
                  />
                  <Button type="submit" disabled={!canManage || submitting} className="shrink-0">
                    Capture
                  </Button>
                </form>
              </div>

              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

              {lastResult?.id && canMarkDamaged ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={lastDamaged ? "secondary" : "outline"}
                    size="sm"
                    disabled={markingDamage || lastDamaged}
                    onClick={() => void markLastDamaged()}
                    className={
                      lastDamaged
                        ? ""
                        : "border-rose-500/30 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                    }
                  >
                    {lastDamaged ? "Marked damaged" : "Damaged"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Applies to the last capture only. Koha is unchanged until an adjustment is
                    approved.
                  </p>
                </div>
              ) : null}
            </div>

            <LastCapturePanel result={lastResult} />
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold">Supported capture devices</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Profile is bound to the session and stamped on every scan event for audit
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAPTURE_DEVICES.map((device) => (
                <CaptureDeviceCard key={device.id} device={device} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="py-4">
          <CardContent className="space-y-4">
            <h3 className="text-[15px] font-semibold">This session</h3>
            <div className="space-y-2.5">
              {SESSION_STATS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center gap-3 rounded-xl bg-muted/40 p-2.5"
                >
                  <span className={`h-8 w-2 shrink-0 rounded-full ${row.bar}`} />
                  <span className="text-sm font-medium">{row.label}</span>
                  <span className="ml-auto font-mono text-sm font-bold tabular-nums">
                    {summary ? row.value(summary) : 0}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">Operator queue</h3>
              <span className="rounded-md border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                You
              </span>
            </div>
            <OperatorQueueStats mineCount={mineRows.length} />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setView("exceptions")}
            >
              Open exception queue
            </Button>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="space-y-3">
            <h3 className="text-[15px] font-semibold">Recent captures</h3>
            <RecentCapturesFeed rows={mineRows} />
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function ScanCaptureHeader() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
      <div>
        <h3 className="text-[15px] font-semibold">Barcode capture</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scanner behaves as a keyboard-wedge HID device — suffix{" "}
          <span className="font-mono">CR</span> triggers lookup
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
          <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Device online
        </span>
        <span className="rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs">
          Zebra DS2278 · USB-HID
        </span>
      </div>
    </div>
  );
}

function BarcodeIcon() {
  return (
    <svg
      className="h-7 w-7 shrink-0 text-indigo-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8" />
    </svg>
  );
}

function LastCapturePanel({ result }: { result: ScanResponse | null }) {
  if (!result) {
    return (
      <div className="border-t border-border px-5 py-8">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <BarcodeIcon />
          <p className="mt-3 text-sm font-semibold">Awaiting first capture</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Point the scanner at a barcode and pull the trigger, or type a barcode and press Enter.
            Each capture is matched live against the frozen Koha expected set.
          </p>
        </div>
      </div>
    );
  }

  const meta = OUTCOME_META[result.outcome] ?? {
    label: result.outcome,
    className: "border-border bg-muted",
    hint: "",
  };

  const barcodeLabel =
    result.external_id ?? result.barcode_submitted ?? "—";

  return (
    <div className="border-t border-border px-5 py-5">
      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Last capture
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] leading-snug font-semibold">
              {result.title ?? "Item"}
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.author ? `${result.author} · ` : ""}
              <span className="font-mono">{result.call_number ?? "—"}</span>
            </p>
          </div>
          <span
            className={`ml-auto shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.className}`}
          >
            {meta.label}
          </span>
        </div>
        {meta.hint ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{meta.hint}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <MetaCell label="Barcode" value={barcodeLabel} mono />
          <MetaCell
            label="Item no."
            value={result.koha_item_id != null ? String(result.koha_item_id) : "—"}
            mono
          />
          <MetaCell
            label="Locations"
            value={
              [result.station_location, result.live_location].filter(Boolean).join(" · ") || "—"
            }
          />
          <MetaCell label="Koha status" value={result.live_status ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function MetaCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[9.5px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className={`mt-0.5 font-semibold ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function CaptureDeviceCard({
  device,
}: {
  device: (typeof CAPTURE_DEVICES)[number];
}) {
  const tone =
    device.status === "online"
      ? "bg-emerald-500"
      : device.status === "idle"
        ? "bg-slate-400"
        : "bg-sky-500";
  return (
    <div
      className={`rounded-xl border p-3 ${
        device.active
          ? "border-indigo-500 bg-indigo-500/[.07] ring-1 ring-indigo-500/30"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone}`} />
        <span className="truncate text-sm font-semibold">{device.name}</span>
        {device.active ? (
          <span className="ml-auto shrink-0 rounded-md border border-indigo-500/25 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
            Active
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{device.type}</p>
      <p className="mt-2 text-[10.5px] font-semibold capitalize">
        {device.status}
        {"battery" in device && device.battery ? (
          <span className="font-normal text-muted-foreground"> · {device.battery}</span>
        ) : null}
      </p>
    </div>
  );
}

function OperatorQueueStats({ mineCount }: { mineCount: number }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5">
        <span className="text-muted-foreground">Scanned by me</span>
        <b className="font-mono">{mineCount}</b>
      </div>
    </div>
  );
}

function RecentCapturesFeed({ rows }: { rows: LocalScanRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No counting scans from you yet.</p>;
  }
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
      {rows.map((row) => {
        const label = OUTCOME_META[row.condition]?.label ?? row.condition;
        return (
          <div key={row.key} className="border-b border-border pb-2 last:border-0">
            <p className="font-medium">{row.title}</p>
            <p className="text-muted-foreground">{label}</p>
          </div>
        );
      })}
    </div>
  );
}

const RESULT_LISTS: Array<{
  condition: string;
  title: string;
  hint: string;
}> = [
  { condition: "found", title: "Successfully scanned", hint: "Expected copies matched on the shelf." },
  { condition: "unverified", title: "Not scanned", hint: "Expected copies with no scan and no shelf search." },
  { condition: "not_found", title: "Missing after shelf search", hint: "Marked not found. Koha status is unchanged." },
  { condition: "unexpected", title: "Unexpected", hint: "Scanned copies outside this session’s expected set." },
  { condition: "misplaced", title: "Misplaced", hint: "Found on a different shelf than the snapshot." },
  { condition: "damaged", title: "Damaged", hint: "Observed damage. Koha is unchanged until a proposal is submitted." },
  { condition: "withdrawn", title: "Withdrawal requested", hint: "Withdrawn in Koha within this session scope." },
];

function FinishedResults({
  sessionId,
  summary,
  loading,
}: {
  sessionId: string | null;
  summary: SessionSummary | null;
  loading: boolean;
}) {
  const [lists, setLists] = useState<Record<string, InventoryItemRow[]>>({});
  const [totals, setTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      RESULT_LISTS.map(async (entry) => {
        const data = await fetchApi<Paged<InventoryItemRow>>(
          `/inventory/sessions/${sessionId}/items?condition=${entry.condition}&per_page=25&page=1`,
        );
        return [entry.condition, data] as const;
      }),
    )
      .then((pages) => {
        if (cancelled) {
          return;
        }
        const nextLists: Record<string, InventoryItemRow[]> = {};
        const nextTotals: Record<string, number> = {};
        for (const [condition, data] of pages) {
          nextLists[condition] = data.items;
          nextTotals[condition] = data.total;
        }
        setLists(nextLists);
        setTotals(nextTotals);
      })
      .catch(() => {
        if (!cancelled) {
          setLists({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return <ViewLoading label="Loading finished session…" />;
  }

  const counted = summary
    ? (summary.found ?? 0) +
      (summary.misplaced ?? 0) +
      (summary.damaged ?? 0) +
      (summary.withdrawn ?? 0) +
      (summary.unexpected ?? 0)
    : 0;

  return (
    <div className="space-y-5">
      <Card className="py-4">
        <CardContent className="space-y-2">
          <h3 className="text-[15px] font-semibold">Session finished</h3>
          <p className="text-sm text-muted-foreground">
            Scanning is closed for this session. These counts are stored with the session and stay
            available after you leave or refresh.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            <ResultStat label="Scanned and matched" value={summary?.found ?? 0} />
            <ResultStat label="Not scanned" value={summary?.unverified ?? 0} />
            <ResultStat label="Unexpected" value={summary?.unexpected ?? 0} />
            <ResultStat
              label="Other discrepancies"
              value={Math.max(0, counted - (summary?.found ?? 0))}
            />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {RESULT_LISTS.map((entry) => (
          <Card key={entry.condition} className="py-4">
            <CardContent className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {entry.title}
                  <span className="ml-2 font-mono text-muted-foreground">
                    {totals[entry.condition] ?? 0}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">{entry.hint}</p>
              </div>
              <ResultLines rows={lists[entry.condition] ?? []} total={totals[entry.condition] ?? 0} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ResultLines({ rows, total }: { rows: InventoryItemRow[]; total: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }
  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
      {rows.map((row) => (
        <li
          key={row.scan_id ?? row.expected_item_id ?? row.title}
          className="border-b border-border pb-2 last:border-0"
        >
          <p className="font-medium">{row.title || "Item"}</p>
          <p className="text-xs text-muted-foreground">
            {[row.barcode, row.call_number, row.snapshot_location].filter(Boolean).join(" · ") || "—"}
          </p>
        </li>
      ))}
      {total > rows.length ? (
        <li className="text-xs text-muted-foreground">
          Showing {rows.length} of {total}.
        </li>
      ) : null}
    </ul>
  );
}

function FinishSessionDialog({
  open,
  finishing,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  finishing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finish this session?</DialogTitle>
          <DialogDescription>
            Scanning stops for this session. Unscanned copies stay unverified and are not marked
            lost in Koha. You can review the saved results on this page after you confirm.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={finishing} onClick={() => onOpenChange(false)}>
            Keep scanning
          </Button>
          <Button type="button" disabled={finishing} onClick={onConfirm}>
            {finishing ? "Finishing…" : "Finish session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}