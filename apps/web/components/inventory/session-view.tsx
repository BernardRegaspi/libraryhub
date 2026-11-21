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
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";

import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi } from "@/lib/api";
import { createScanQueue } from "@/lib/inventory/queue";
import type {
  InventoryScan,
  InventoryScanListResponse,
  InventoryScanOutcome,
  InventorySession,
  InventorySessionCounters,
} from "@/lib/inventory/types";

const INVENTORY_DESCRIPTION =
  "Scan a Koha library, or one shelving location, and keep a record of each barcode.";

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

const OUTCOME_FILTER_OPTIONS: { value: InventoryScanOutcome; label: string }[] =
  [
    { value: "verified", label: "Verified" },
    { value: "misplaced", label: "Misplaced" },
    { value: "unexpected", label: "Unexpected" },
    { value: "not_found", label: "Not found" },
    { value: "withdrawn", label: "Withdrawn" },
    { value: "damaged", label: "Damaged" },
    { value: "other_exception", label: "Other exception" },
    { value: "duplicate", label: "Duplicate" },
  ];

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
  outcome: InventoryScanOutcome | "",
): string {
  const params = new URLSearchParams();
  params.set("per_page", "20");
  if (q.trim()) {
    params.set("q", q.trim());
  }
  if (outcome) {
    params.set("outcome", outcome);
  }
  return `/inventory/sessions/${sessionId}/scans?${params.toString()}`;
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

function SessionSummary({
  session,
  statusNote,
}: {
  session: InventorySession;
  statusNote?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {session.reference}
            <span className="text-muted-foreground"> · </span>
            {session.name}
          </h2>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground">
            {session.expected_count}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              expected
            </span>
          </p>
        </div>
        {statusNote ? (
          <div className="shrink-0 text-sm font-medium text-foreground">
            {statusNote}
          </div>
        ) : null}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Library</dt>
          <dd className="text-foreground">
            {session.home_library_name ?? session.home_library_id}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location</dt>
          <dd className="text-foreground">
            {session.location ?? "Whole library"}
          </dd>
        </div>
      </dl>
      {session.expected_count === 0 ? (
        <p className="text-sm text-muted-foreground">{ZERO_COUNT_COPY}</p>
      ) : null}
    </div>
  );
}

function CountsLine({ counters }: { counters: InventorySessionCounters }) {
  const items: { label: string; value: number }[] = [
    { label: "Expected", value: counters.expected_count },
    { label: "Seen", value: counters.seen },
    { label: "Verified", value: counters.verified },
    { label: "Needs a look", value: counters.needs_a_look },
    { label: "Duplicates", value: counters.duplicates },
    { label: "Remaining", value: counters.remaining },
  ];

  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
      {items.map((item) => (
        <span key={item.label}>
          <span className="text-muted-foreground">{item.label}</span>{" "}
          <span className="font-medium tabular-nums">{item.value}</span>
        </span>
      ))}
    </p>
  );
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

function ScanRow({ scan }: { scan: InventoryScan }) {
  return (
    <tr className="border-b border-border">
      <td className="px-3 py-3 font-mono text-sm text-foreground">
        {scan.barcode}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">{scan.outcome_label}</td>
      <td className="hidden px-3 py-3 text-sm text-foreground md:table-cell">
        {scan.title ?? NO_TITLE}
      </td>
      <td className="hidden px-3 py-3 text-sm text-muted-foreground lg:table-cell">
        {scan.scanned_at}
      </td>
    </tr>
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
  const [scanOutcome, setScanOutcome] = useState<InventoryScanOutcome | "">("");

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

  const scansPath = useMemo(
    () => buildScansPath(sessionId, scanSearchQ, scanOutcome),
    [sessionId, scanSearchQ, scanOutcome],
  );

  const scansQuery = useQuery({
    queryKey: ["inventory", "session", sessionId, "scans", scansPath],
    queryFn: () => fetchApi<InventoryScanListResponse>(scansPath),
    enabled: session?.status === "in_progress" || session?.status === "cancelled",
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
    } catch {
      await refetchScansAndReconcile(clientScanId);
    }
  };

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
      <ModuleFrame
        eyebrow="Library"
        title="Inventory"
        description={INVENTORY_DESCRIPTION}
        hideModuleSentence
        actions={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            render={<Link href="/inventory" />}
          >
            Back to sessions
          </Button>
        }
      />

      <div className="flex w-full min-w-0 flex-col gap-6 px-4 pb-8 sm:px-6 lg:px-8">
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
            {session.status === "draft" ? (
              <>
                <SessionSummary session={session} />
                {actionError ? (
                  <p className="text-sm text-destructive">{actionError}</p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={actionPending}
                    onClick={() => {
                      void onStartScanning();
                    }}
                  >
                    Start scanning
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={actionPending}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel session
                  </Button>
                </div>
              </>
            ) : null}

            {session.status === "cancelled" ? (
              <>
                <SessionSummary
                  session={session}
                  statusNote="Cancelled"
                />
                <ScansPanel
                  scansQuery={scansQuery}
                  scanSearchDraft={scanSearchDraft}
                  onScanSearchChange={setScanSearchDraft}
                  scanOutcome={scanOutcome}
                  onScanOutcomeChange={setScanOutcome}
                />
              </>
            ) : null}

            {session.status === "in_progress" ? (
              <>
                <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
                  <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
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
                        <p className="text-sm text-destructive">{barcodeError}</p>
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
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={actionPending}
                          onClick={() => setCancelOpen(true)}
                        >
                          Cancel session
                        </Button>
                      </div>
                    </form>
                  </div>

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

                {displayCounters ? (
                  <CountsLine counters={displayCounters} />
                ) : null}

                <ScansPanel
                  scansQuery={scansQuery}
                  scanSearchDraft={scanSearchDraft}
                  onScanSearchChange={setScanSearchDraft}
                  scanOutcome={scanOutcome}
                  onScanOutcomeChange={setScanOutcome}
                />
              </>
            ) : null}
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

function ScansPanel({
  scansQuery,
  scanSearchDraft,
  onScanSearchChange,
  scanOutcome,
  onScanOutcomeChange,
}: {
  scansQuery: {
    data: InventoryScanListResponse | undefined;
    isPending: boolean;
    isPlaceholderData: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  };
  scanSearchDraft: string;
  onScanSearchChange: (value: string) => void;
  scanOutcome: InventoryScanOutcome | "";
  onScanOutcomeChange: (value: InventoryScanOutcome | "") => void;
}) {
  const items = scansQuery.data?.items ?? [];
  const pending =
    scansQuery.isPending || scansQuery.isPlaceholderData;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
            />
            <Input
              value={scanSearchDraft}
              onChange={(event) => onScanSearchChange(event.target.value)}
              placeholder="Barcode"
              className="min-h-11 h-11 pl-9 text-sm"
            />
          </div>
          <Select
            value={scanOutcome}
            onValueChange={(value) => {
              if (value == null) {
                return;
              }
              onScanOutcomeChange(value as InventoryScanOutcome | "");
            }}
          >
            <SelectTrigger className="min-h-11 h-11 w-full min-w-0 text-sm md:w-auto md:min-w-40">
              <SelectValue placeholder="Any outcome" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="">Any outcome</SelectItem>
              {OUTCOME_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {scansQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">
            {scansQuery.error instanceof Error
              ? scansQuery.error.message
              : "Scans could not be loaded."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => {
              void scansQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Barcode</th>
                <th className="px-3 py-2 font-semibold">Outcome</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">
                  Title
                </th>
                <th className="hidden px-3 py-2 font-semibold lg:table-cell">
                  Scanned
                </th>
              </tr>
            </thead>
            <tbody>
              {pending ? (
                <tr>
                  <td className="px-3 py-6" colSpan={4}>
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                    colSpan={4}
                  >
                    No scans yet.
                  </td>
                </tr>
              ) : (
                items.map((scan) => <ScanRow key={scan.id} scan={scan} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}