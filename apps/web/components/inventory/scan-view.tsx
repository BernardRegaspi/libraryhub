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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type LocalScanRow = {
  key: string;
  title: string;
  condition: string;
};

export function ScanView() {
  const { sessionId, session, permissions, capabilities, userId, refreshSession } =
    useInventoryDesk();
  const scanRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [flagDamaged, setFlagDamaged] = useState(false);
  const [stationLocation, setStationLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResponse | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [mineRows, setMineRows] = useState<LocalScanRow[]>([]);

  const canManage = permissions.includes("inventory.manage");
  const sessionLocations = useMemo(() => session?.locations ?? [], [session?.locations]);
  const needsStation = sessionLocations.length > 0;
  const kohaBlocked = capabilities?.item_list === false;

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

  const submitScan = useCallback(async () => {
    if (!sessionId || !canManage || session?.status !== "in_progress") {
      return;
    }
    if (needsStation && !stationLocation) {
      setError("Choose a station location.");
      return;
    }
    const accepted = acceptInventoryScan(barcode, inflightRef.current);
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
          damaged: flagDamaged,
        }),
      });
      setLastResult(body);
      if (body.koha_item_id != null) {
        setFlagDamaged(false);
      }
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
  }, [
    barcode,
    canManage,
    flagDamaged,
    loadSide,
    needsStation,
    refreshSession,
    session?.status,
    sessionId,
    stationLocation,
  ]);

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

  if (kohaBlocked) {
    return <KohaUnavailableBanner />;
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
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {needsStation ? (
              <div className="space-y-2">
                <Label htmlFor="station-location">Station location</Label>
                <Select
                  value={stationLocation}
                  onValueChange={(value) => setStationLocation(value ?? "")}
                >
                  <SelectTrigger id="station-location">
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
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
              <Input
                ref={scanRef}
                autoComplete="off"
                value={barcode}
                disabled={!canManage || submitting}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Scan or type a barcode"
                aria-label="Barcode"
              />
              <Button type="submit" disabled={!canManage || submitting}>
                Capture
              </Button>
            </form>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flagDamaged}
                onChange={(e) => setFlagDamaged(e.target.checked)}
              />
              Flag next: damaged
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        {lastResult ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Condition: </span>
                {lastResult.outcome}
              </p>
              {lastResult.title ? (
                <p>
                  <span className="text-muted-foreground">Title: </span>
                  {lastResult.title}
                </p>
              ) : null}
              {lastResult.external_id ? (
                <p>
                  <span className="text-muted-foreground">Barcode: </span>
                  {lastResult.external_id}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Locations: </span>
                {[lastResult.station_location, lastResult.live_location]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Koha status: </span>
                {lastResult.live_status ?? "—"}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session counts</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Expected" value={summary?.expected ?? 0} />
            <Stat label="Scanned" value={summary?.scanned ?? 0} />
            <Stat label="Exceptions" value={summary?.open_exceptions ?? 0} />
            <Stat label="Unverified" value={summary?.unverified ?? 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your counting scans</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {mineRows.length === 0 ? (
              <ViewEmpty message="No counting scans from you yet." />
            ) : (
              mineRows.map((row) => (
                <div key={row.key} className="border-b border-border pb-2 last:border-0">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-muted-foreground">{row.condition}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}