"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExceptionReviewPanel } from "@/components/inventory/exception-review";
import { InventoryKpis } from "@/components/inventory/inventory-kpis";
import {
  DEFAULT_SCAN_FILTER,
  ScansPanel,
  type ScanListFilter,
} from "@/components/inventory/scans-panel";
import { SessionCard } from "@/components/inventory/session-card";
import { SessionSidebar } from "@/components/inventory/session-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi, getApiBaseUrl } from "@/lib/api";
import { createScanQueue } from "@/lib/inventory/queue";
import type {
  InventoryScan,
  InventoryScanListResponse,
  InventoryScanOutcome,
  InventorySession,
  InventorySessionCounters,
  InventorySessionListResponse,
} from "@/lib/inventory/types";

const ZERO_COUNT_COPY =
  "Koha returned no items for this library and location. You can still start and record unexpected barcodes.";

const SCANNER_HINT = "Set the scanner suffix to Enter.";

const WAITING_COPY = "Checking Koha…";

const SCAN_FAILURE_COPY = "Scan not saved.";

const BARCODE_VALIDATION =
  "Use 1 to 32 characters, with no control characters.";

const NO_TITLE = "No title from Koha";

const SCAN_SOUND_KEY = "libraryhub.inventory.scanSound";

const MAX_IN_FLIGHT = 2;

type InventoryAuditListResponse = {
  items: {
    action: string;
    details: Record<string, unknown>;
    actor_name: string | null;
    created_at: string;
  }[];
};

type ScanRecordResponse = {
  scan: InventoryScan;
  counters: InventorySessionCounters;
};

type LatestFinished =
  | { kind: "scan"; scan: InventoryScan }
  | { kind: "failure"; barcode: string; clientScanId: string };

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function validateBarcode(trimmed: string): string | null {
  if (trimmed.length > 32 || hasControlCharacters(trimmed)) {
    return BARCODE_VALIDATION;
  }
  return null;
}

function outcomeBadgeClass(outcome: InventoryScanOutcome): string {
  if (outcome === "verified") {
    return "bg-gold-100 text-gold-700";
  }
  if (outcome === "duplicate") {
    return "text-foreground";
  }
  return "bg-maroon-50 text-maroon-700";
}

function buildScansPath(
  sessionId: string,
  q: string,
  filter: ScanListFilter,
  page: number,
): string {
  const params = new URLSearchParams();
  params.set("per_page", "20");
  params.set("page", String(page));
  if (q.trim()) {
    params.set("q", q.trim());
  }
  if (filter.kind === "exceptions") {
    params.set("exceptions", "1");
  } else if (filter.kind === "outcome") {
    params.set("outcome", filter.outcome);
  }
  return `/inventory/sessions/${sessionId}/scans?${params.toString()}`;
}

function buildExceptionsPath(sessionId: string, page: number): string {
  const params = new URLSearchParams();
  params.set("exceptions", "1");
  params.set("per_page", "20");
  params.set("page", String(page));
  return `/inventory/sessions/${sessionId}/scans?${params.toString()}`;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const star = header.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (star?.[1]) {
    return decodeURIComponent(star[1]);
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const plain = header.match(/filename=([^;\s]+)/i);
  if (plain?.[1]) {
    return plain[1];
  }
  return null;
}

async function downloadExceptionsCsv(sessionId: string): Promise<string | null> {
  const url = `${getApiBaseUrl()}/api/v1/inventory/sessions/${sessionId}/exceptions.csv`;
  const headers = new Headers();
  headers.set("Accept", "text/csv, application/json");
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: typeof window !== "undefined" ? "include" : "same-origin",
      headers,
    });
  } catch {
    return "Exceptions could not be downloaded.";
  }
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await response.json()) as {
          detail?: { message?: string };
        };
        return body.detail?.message ?? "Exceptions could not be downloaded.";
      } catch {
        return "Exceptions could not be downloaded.";
      }
    }
    return "Exceptions could not be downloaded.";
  }
  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(
      response.headers.get("Content-Disposition"),
    ) ?? "exceptions.csv";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return null;
}

function playTone(audioContextRef: React.RefObject<AudioContext | null>, hz: number) {
  const ctx = audioContextRef.current;
  if (!ctx) {
    return;
  }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = hz;
  gain.gain.value = 0.12;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.12);
}

function ScanResultCard({
  scan,
}: {
  scan: InventoryScan;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
      <p
        className={`inline-flex w-fit rounded-md px-2 py-0.5 font-display text-xl font-semibold ${outcomeBadgeClass(scan.outcome)}`}
      >
        {scan.outcome_label}
      </p>
      <p className="text-sm text-foreground">
        {scan.title ?? NO_TITLE}
      </p>
      {scan.call_number ? (
        <p className="text-sm text-muted-foreground">{scan.call_number}</p>
      ) : null}
      {scan.location ? (
        <p className="text-sm text-muted-foreground">{scan.location}</p>
      ) : null}
      {scan.koha_status_label ? (
        <p className="text-sm text-muted-foreground">{scan.koha_status_label}</p>
      ) : null}
      {scan.message ? (
        <p className="text-sm text-foreground">{scan.message}</p>
      ) : null}
      <p className="font-mono text-sm text-foreground">{scan.barcode}</p>
    </div>
  );
}

export type SessionViewProps = {
  sessionId: string;
};

export function SessionView({ sessionId }: SessionViewProps) {
  const queryClient = useQueryClient();
  const scanQueueRef = useRef(createScanQueue());
  const inFlightRef = useRef(0);
  const postQueueRef = useRef<{ clientScanId: string; barcode: string }[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [counters, setCounters] = useState<InventorySessionCounters | null>(
    null,
  );
  const [latestFinished, setLatestFinished] = useState<LatestFinished | null>(
    null,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"none" | "text">("none");
  const [soundOn, setSoundOn] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanSearchDraft, setScanSearchDraft] = useState("");
  const [scanSearchQ, setScanSearchQ] = useState("");
  const [scanFilter, setScanFilter] = useState<ScanListFilter>(
    DEFAULT_SCAN_FILTER,
  );
  const [scanPage, setScanPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["inventory", "session", sessionId],
    queryFn: () =>
      fetchApi<InventorySession>(`/inventory/sessions/${sessionId}`),
  });

  const session = sessionQuery.data;

  useEffect(() => {
    if (session?.counters) {
      setCounters(session.counters);
    }
  }, [session?.counters]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setSoundOn(window.localStorage.getItem(SCAN_SOUND_KEY) === "on");
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setScanSearchQ(scanSearchDraft);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [scanSearchDraft]);

  useEffect(() => {
    setScanPage(1);
  }, [scanSearchQ, scanFilter]);

  const scansPath = useMemo(
    () => buildScansPath(sessionId, scanSearchQ, scanFilter, scanPage),
    [sessionId, scanSearchQ, scanFilter, scanPage],
  );

  const scansQuery = useQuery({
    queryKey: ["inventory", "session", sessionId, "scans", scansPath],
    queryFn: () => fetchApi<InventoryScanListResponse>(scansPath),
    placeholderData: (previous) => previous,
    enabled:
      session?.status === "in_progress" ||
      session?.status === "in_review" ||
      session?.status === "cancelled",
  });

  const exceptionsPath = useMemo(
    () => buildExceptionsPath(sessionId, reviewPage),
    [sessionId, reviewPage],
  );

  const exceptionsQuery = useQuery({
    queryKey: ["inventory", "session", sessionId, "exceptions", exceptionsPath],
    queryFn: () => fetchApi<InventoryScanListResponse>(exceptionsPath),
    placeholderData: (previous) => previous,
    enabled:
      session?.status === "draft" ||
      session?.status === "in_progress" ||
      session?.status === "in_review" ||
      session?.status === "cancelled",
  });

  const sidebarScansQuery = useQuery({
    queryKey: ["inventory", "session", sessionId, "sidebar-scans"],
    queryFn: () =>
      fetchApi<InventoryScanListResponse>(
        `/inventory/sessions/${sessionId}/scans?per_page=12&sort=scanned_at&direction=desc`,
      ),
    enabled: Boolean(session),
  });

  const sidebarAuditQuery = useQuery({
    queryKey: ["inventory", "session", sessionId, "audit"],
    queryFn: () =>
      fetchApi<InventoryAuditListResponse>(
        `/inventory/sessions/${sessionId}/audit`,
      ),
    enabled: Boolean(session),
  });

  const sidebarSessionsQuery = useQuery({
    queryKey: ["inventory", "sessions", "sidebar"],
    queryFn: () =>
      fetchApi<InventorySessionListResponse>(
        "/inventory/sessions?per_page=20&sort=created_at&direction=desc",
      ),
    enabled: Boolean(session),
  });

  const refocusBarcode = useCallback(() => {
    requestAnimationFrame(() => {
      barcodeInputRef.current?.focus();
    });
  }, []);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(scanQueueRef.current.snapshot().pending);
  }, []);

  const refetchScansAndReconcile = useCallback(
    async (clientScanId: string) => {
      const reconcilePath = `/inventory/sessions/${sessionId}/scans?per_page=20`;
      const result = await fetchApi<InventoryScanListResponse>(reconcilePath);
      const savedIds = result.items
        .filter((row) => row.client_scan_id === clientScanId)
        .map((row) => row.client_scan_id);
      if (savedIds.length > 0) {
        scanQueueRef.current.reconcile(savedIds);
        refreshPendingCount();
        const saved = result.items.find(
          (row) => row.client_scan_id === clientScanId,
        );
        if (saved) {
          setLatestFinished({ kind: "scan", scan: saved });
        }
      }
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "scans"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "exceptions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "sidebar-scans"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "audit"],
      });
    },
    [queryClient, refreshPendingCount, sessionId],
  );

  const playOutcomeSound = useCallback(
    (outcome: InventoryScanOutcome) => {
      if (!soundOn) {
        return;
      }
      playTone(audioContextRef, outcome === "verified" ? 880 : 520);
    },
    [soundOn],
  );

  const pumpPostsRef = useRef<() => void>(() => {});

  const runPost = useCallback(
    async (clientScanId: string, barcode: string) => {
      try {
        const response = await fetchApi<ScanRecordResponse>(
          `/inventory/sessions/${sessionId}/scans`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_scan_id: clientScanId, barcode }),
          },
        );
        scanQueueRef.current.markDone(clientScanId);
        refreshPendingCount();
        setLatestFinished({ kind: "scan", scan: response.scan });
        setCounters(response.counters);
        playOutcomeSound(response.scan.outcome);
        void queryClient.invalidateQueries({
          queryKey: ["inventory", "session", sessionId, "scans"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["inventory", "session", sessionId, "exceptions"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["inventory", "session", sessionId, "sidebar-scans"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["inventory", "session", sessionId, "audit"],
        });
      } catch {
        scanQueueRef.current.markFailed(clientScanId);
        refreshPendingCount();
        setLatestFinished({
          kind: "failure",
          barcode,
          clientScanId,
        });
        await refetchScansAndReconcile(clientScanId);
      } finally {
        inFlightRef.current -= 1;
        pumpPostsRef.current();
      }
    },
    [
      playOutcomeSound,
      queryClient,
      refetchScansAndReconcile,
      refreshPendingCount,
      sessionId,
    ],
  );

  const pumpPosts = useCallback(() => {
    while (
      inFlightRef.current < MAX_IN_FLIGHT &&
      postQueueRef.current.length > 0
    ) {
      const next = postQueueRef.current.shift();
      if (!next) {
        break;
      }
      inFlightRef.current += 1;
      refreshPendingCount();
      void runPost(next.clientScanId, next.barcode);
    }
  }, [refreshPendingCount, runPost]);

  useEffect(() => {
    pumpPostsRef.current = pumpPosts;
  }, [pumpPosts]);

  const enqueueBarcode = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        return;
      }
      const validationError = validateBarcode(trimmed);
      if (validationError) {
        setBarcodeError(validationError);
        return;
      }
      setBarcodeError(null);
      const result = scanQueueRef.current.enqueue(trimmed);
      if (!result.accepted || !result.clientScanId) {
        setBarcodeDraft("");
        refocusBarcode();
        return;
      }
      setBarcodeDraft("");
      refocusBarcode();
      if (inputMode === "text") {
        setInputMode("none");
      }
      postQueueRef.current.push({
        clientScanId: result.clientScanId,
        barcode: trimmed,
      });
      refreshPendingCount();
      pumpPosts();
    },
    [inputMode, pumpPosts, refocusBarcode, refreshPendingCount],
  );

  const onBarcodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    enqueueBarcode(barcodeDraft);
  };

  const onTypeBarcode = () => {
    setInputMode("text");
    refocusBarcode();
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (typeof window !== "undefined") {
      if (next) {
        window.localStorage.setItem(SCAN_SOUND_KEY, "on");
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          audioContextRef.current = ctx;
          void ctx.resume();
          playTone(audioContextRef, 660);
        }
      } else {
        window.localStorage.removeItem(SCAN_SOUND_KEY);
      }
    }
  };

  const onRetry = async (clientScanId: string, barcode: string) => {
    try {
      const response = await fetchApi<ScanRecordResponse>(
        `/inventory/sessions/${sessionId}/scans`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_scan_id: clientScanId, barcode }),
        },
      );
      scanQueueRef.current.markDone(clientScanId);
      refreshPendingCount();
      setLatestFinished({ kind: "scan", scan: response.scan });
      setCounters(response.counters);
      playOutcomeSound(response.scan.outcome);
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "scans"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "exceptions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "sidebar-scans"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory", "session", sessionId, "audit"],
      });
    } catch {
      await refetchScansAndReconcile(clientScanId);
    }
  };

  const invalidateSidebarAudit = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["inventory", "session", sessionId, "audit"],
    });
  }, [queryClient, sessionId]);

  async function onStartScanning() {
    setActionPending(true);
    setActionError(null);
    try {
      await fetchApi<InventorySession>(
        `/inventory/sessions/${sessionId}/start`,
        { method: "POST" },
      );
      await sessionQuery.refetch();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (caught.detail?.message ?? caught.message)
          : "Could not start scanning. Try again.";
      setActionError(message);
    } finally {
      setActionPending(false);
    }
  }

  async function onFinishScanning() {
    setActionPending(true);
    setActionError(null);
    try {
      await fetchApi<InventorySession>(
        `/inventory/sessions/${sessionId}/finish`,
        { method: "POST" },
      );
      await sessionQuery.refetch();
      invalidateSidebarAudit();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (caught.detail?.message ?? caught.message)
          : "Could not finish scanning. Try again.";
      setActionError(message);
    } finally {
      setActionPending(false);
    }
  }

  async function onBackToScanning() {
    setActionPending(true);
    setActionError(null);
    try {
      await fetchApi<InventorySession>(
        `/inventory/sessions/${sessionId}/resume`,
        { method: "POST" },
      );
      await sessionQuery.refetch();
      invalidateSidebarAudit();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (caught.detail?.message ?? caught.message)
          : "Could not return to scanning. Try again.";
      setActionError(message);
    } finally {
      setActionPending(false);
    }
  }

  async function onExportExceptions() {
    setExportPending(true);
    setExportError(null);
    const message = await downloadExceptionsCsv(sessionId);
    if (message) {
      setExportError(message);
    } else {
      invalidateSidebarAudit();
    }
    setExportPending(false);
  }

  async function onConfirmCancel() {
    setActionPending(true);
    setActionError(null);
    try {
      await fetchApi<InventorySession>(
        `/inventory/sessions/${sessionId}/cancel`,
        { method: "POST" },
      );
      setCancelOpen(false);
      await sessionQuery.refetch();
      invalidateSidebarAudit();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (caught.detail?.message ?? caught.message)
          : "Could not cancel the session. Try again.";
      setActionError(message);
    } finally {
      setActionPending(false);
    }
  }

  useEffect(() => {
    if (session?.status === "in_progress") {
      refocusBarcode();
    }
  }, [refocusBarcode, session?.status]);

  const displayCounters = counters ?? session?.counters;

  return (
    <>
      <div className="flex w-full min-w-0 flex-col gap-6 bg-background px-4 pb-8 sm:px-6 lg:px-8">
        <div className="flex justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            nativeButton={false}
            render={<Link href="/inventory" />}
          >
            Back to sessions
          </Button>
        </div>

        {sessionQuery.isPending ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : sessionQuery.isError ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
            <p className="text-sm text-foreground">
              {sessionQuery.error instanceof Error
                ? sessionQuery.error.message
                : "This session could not be loaded."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              onClick={() => {
                void sessionQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : session ? (
          <>
            <SessionCard
              session={
                displayCounters
                  ? { ...session, counters: displayCounters }
                  : session
              }
              actionPending={actionPending}
              actionError={actionError}
              exportPending={exportPending}
              exportError={exportError}
              onStart={() => {
                void onStartScanning();
              }}
              onFinish={() => {
                void onFinishScanning();
              }}
              onResume={() => {
                void onBackToScanning();
              }}
              onCancel={() => setCancelOpen(true)}
              onExport={() => {
                void onExportExceptions();
              }}
            />
            {displayCounters ? (
              <InventoryKpis
                counters={displayCounters}
                expectedCount={session.expected_count}
              />
            ) : null}

            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                {session.status === "in_progress" ? (
                  <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                    <h2 className="font-display text-lg font-bold text-foreground">
                      Scan barcodes
                    </h2>
                    <div className="mt-4 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
                      <form
                        className="flex min-w-0 flex-col gap-3"
                        onSubmit={(event: FormEvent) => event.preventDefault()}
                      >
                        <Input
                          ref={barcodeInputRef}
                          value={barcodeDraft}
                          onChange={(event) => {
                            setBarcodeDraft(event.target.value);
                            if (barcodeError) {
                              setBarcodeError(null);
                            }
                          }}
                          onKeyDown={onBarcodeKeyDown}
                          inputMode={inputMode}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          aria-label="Barcode"
                          className="min-h-11 font-mono text-base"
                        />
                        <p className="text-sm text-muted-foreground">
                          {SCANNER_HINT}
                        </p>
                        {barcodeError ? (
                          <p className="text-sm text-destructive">
                            {barcodeError}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={onTypeBarcode}
                          >
                            Type barcode
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={toggleSound}
                          >
                            {soundOn ? "Sound on" : "Sound off"}
                          </Button>
                        </div>
                      </form>

                      <div className="min-w-0 flex flex-col gap-3">
                        {pendingCount > 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {WAITING_COPY}{" "}
                            <span className="font-medium text-foreground">
                              {pendingCount}
                            </span>
                          </p>
                        ) : null}
                        {latestFinished?.kind === "failure" ? (
                          <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
                            <p className="font-mono text-sm text-foreground">
                              {latestFinished.barcode}
                            </p>
                            <p className="text-sm text-foreground">
                              {SCAN_FAILURE_COPY}
                            </p>
                            <Button
                              type="button"
                              className="min-h-11 self-start"
                              onClick={() => {
                                void onRetry(
                                  latestFinished.clientScanId,
                                  latestFinished.barcode,
                                );
                              }}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : latestFinished?.kind === "scan" ? (
                          <ScanResultCard scan={latestFinished.scan} />
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}
                {session.status === "draft" && session.expected_count === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {ZERO_COUNT_COPY}
                  </p>
                ) : null}
                {session.status === "in_progress" ||
                session.status === "in_review" ||
                session.status === "cancelled" ? (
                  <ScansPanel
                    scansQuery={scansQuery}
                    scanSearchDraft={scanSearchDraft}
                    onScanSearchChange={setScanSearchDraft}
                    scanFilter={scanFilter}
                    onScanFilterChange={setScanFilter}
                    scanPage={scanPage}
                    onScanPageChange={setScanPage}
                  />
                ) : null}
                <ExceptionReviewPanel
                  sessionId={sessionId}
                  status={session.status}
                  exceptionsQuery={exceptionsQuery}
                  reviewPage={reviewPage}
                  onReviewPageChange={setReviewPage}
                />
              </div>
              <SessionSidebar
                className="min-w-0"
                sessionId={sessionId}
                sidebarScansQuery={sidebarScansQuery}
                sidebarAuditQuery={sidebarAuditQuery}
                sidebarSessionsQuery={sidebarSessionsQuery}
              />
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this inventory session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Scans already saved stay on the record. You cannot resume scanning
            after cancel.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={actionPending}
              onClick={() => setCancelOpen(false)}
            >
              Keep session
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={actionPending}
              onClick={() => {
                void onConfirmCancel();
              }}
            >
              Cancel session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}