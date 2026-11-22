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
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";

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
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { InventoryKpis } from "@/components/inventory/inventory-kpis";
import { SessionCard } from "@/components/inventory/session-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi, getApiBaseUrl } from "@/lib/api";
import { actionsFor } from "@/lib/inventory/actions";
import { createScanQueue } from "@/lib/inventory/queue";
import type {
  InventoryScan,
  InventoryScanListResponse,
  InventoryScanOutcome,
  InventorySession,
  InventorySessionCounters,
  InventorySessionListResponse,
  InventorySessionStatus,
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

type ScanListFilter =
  | { kind: "all" }
  | { kind: "exceptions" }
  | { kind: "outcome"; outcome: InventoryScanOutcome };

const DEFAULT_SCAN_FILTER: ScanListFilter = { kind: "all" };

const SCAN_FILTER_CHIPS: { label: string; filter: ScanListFilter }[] = [
  { label: "All", filter: { kind: "all" } },
  { label: "Exceptions", filter: { kind: "exceptions" } },
  ...OUTCOME_FILTER_OPTIONS.map((option) => ({
    label: option.label,
    filter: { kind: "outcome" as const, outcome: option.value },
  })),
];

const NO_EXCEPTIONS_COPY = "No exceptions to review.";

type DecisionResponse = {
  scan_id: string;
  action: string;
  decision: "approved" | "no_action" | null;
  decided_by: string | null;
  decided_at: string | null;
};

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

function scanFiltersEqual(a: ScanListFilter, b: ScanListFilter): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "outcome" && b.kind === "outcome") {
    return a.outcome === b.outcome;
  }
  return true;
}

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

            {session.status === "draft" && session.expected_count === 0 ? (
              <p className="text-sm text-muted-foreground">{ZERO_COUNT_COPY}</p>
            ) : null}

            {session.status === "in_progress" ? (
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
            ) : null}

            {session.status === "in_progress" ||
            session.status === "in_review" ||
            session.status === "cancelled" ? (
              <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
                <ScansPanel
                  scansQuery={scansQuery}
                  scanSearchDraft={scanSearchDraft}
                  onScanSearchChange={setScanSearchDraft}
                  scanFilter={scanFilter}
                  onScanFilterChange={setScanFilter}
                  scanPage={scanPage}
                  onScanPageChange={setScanPage}
                />
                <WorkstationSidebar
                  className="hidden min-w-0 lg:flex"
                  sessionId={sessionId}
                  sidebarScansQuery={sidebarScansQuery}
                  sidebarAuditQuery={sidebarAuditQuery}
                  sidebarSessionsQuery={sidebarSessionsQuery}
                />
              </div>
            ) : null}

            {session.status === "draft" ||
            session.status === "in_progress" ||
            session.status === "in_review" ||
            session.status === "cancelled" ? (
              <ExceptionReviewPanel
                sessionId={sessionId}
                status={session.status}
                exceptionsQuery={exceptionsQuery}
                reviewPage={reviewPage}
                onReviewPageChange={setReviewPage}
              />
            ) : null}

            {session.status === "draft" ||
            session.status === "in_progress" ||
            session.status === "in_review" ||
            session.status === "cancelled" ? (
              <WorkstationSidebar
                className={
                  session.status === "in_progress" ||
                  session.status === "in_review" ||
                  session.status === "cancelled"
                    ? "min-w-0 lg:hidden"
                    : "min-w-0"
                }
                sessionId={sessionId}
                sidebarScansQuery={sidebarScansQuery}
                sidebarAuditQuery={sidebarAuditQuery}
                sidebarSessionsQuery={sidebarSessionsQuery}
              />
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
  scanFilter,
  onScanFilterChange,
  scanPage,
  onScanPageChange,
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
  scanFilter: ScanListFilter;
  onScanFilterChange: (filter: ScanListFilter) => void;
  scanPage: number;
  onScanPageChange: (page: number) => void;
}) {
  const items = scansQuery.data?.items ?? [];
  const pending =
    scansQuery.isPending || scansQuery.isPlaceholderData;
  const page = scansQuery.data?.page ?? scanPage;
  const total = scansQuery.data?.total ?? null;
  const hasNext = scansQuery.data?.has_next ?? false;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative min-w-0">
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
          <div className="flex min-w-0 flex-wrap gap-2">
            {SCAN_FILTER_CHIPS.map((chip) => {
              const active = scanFiltersEqual(scanFilter, chip.filter);
              return (
                <Button
                  key={chip.label}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="min-h-11 shrink-0 text-sm"
                  onClick={() => {
                    onScanFilterChange(chip.filter);
                  }}
                >
                  {chip.label}
                </Button>
              );
            })}
          </div>
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

      {!scansQuery.isError ? (
        <CatalogPagination
          page={page}
          total={total}
          perPage={20}
          hasNext={hasNext}
          onPage={onScanPageChange}
        />
      ) : null}
    </div>
  );
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

type SidebarQueryState<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

function WorkstationSidebar({
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
      className={`min-w-0 flex-col gap-4 ${className ?? ""}`}
      aria-label="Session activity"
    >
      <SidebarGroup title="Latest scans">
        {sidebarScansQuery.isError ? (
          <SidebarError
            message="Latest scans could not be loaded."
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

      <SidebarGroup title="Audit">
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

function ExceptionReviewPanel({
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