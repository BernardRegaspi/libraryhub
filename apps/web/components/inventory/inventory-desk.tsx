/* eslint-disable react-hooks/set-state-in-effect -- session lists load on mount */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchApi } from "@/lib/api";
import { downloadSessionExport } from "@/lib/inventory/export";
import { parseInventoryView } from "@/lib/inventory/search-params";
import type {
  InventoryCapabilities,
  InventorySession,
  InventoryView,
  Paged,
  ScopeOptions,
} from "@/lib/inventory/types";

import { AdjustmentsView } from "./adjustments-view";
import { AuditView } from "./audit-view";
import { ExceptionsView } from "./exceptions-view";
import { OverviewView } from "./overview-view";
import { ScanView } from "./scan-view";
import { SessionDialog } from "./session-dialog";

const NO_SESSION = "none" as const;

const VIEWS: { id: InventoryView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scan", label: "Scan station" },
  { id: "exceptions", label: "Exceptions" },
  { id: "adjustments", label: "Adjustments" },
  { id: "audit", label: "Audit trail" },
];

export type InventoryDeskContextValue = {
  permissions: string[];
  userId: string;
  departmentId: string | null;
  sessionId: string | null;
  session: InventorySession | null;
  capabilities: InventoryCapabilities | null;
  scopeOptions: ScopeOptions | null;
  refreshSession: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  selectSession: (id: string) => void;
  startSession: (id: string) => Promise<void>;
  setView: (view: InventoryView) => void;
  openSessionDialog: () => void;
};

const InventoryDeskContext = createContext<InventoryDeskContextValue | null>(null);

export function useInventoryDesk(): InventoryDeskContextValue {
  const value = useContext(InventoryDeskContext);
  if (!value) {
    throw new Error("useInventoryDesk must be used within InventoryDesk");
  }
  return value;
}

type InventoryDeskProps = {
  permissions: string[];
  departmentId: string | null;
  userId: string;
};

export function InventoryDesk({ permissions, departmentId, userId }: InventoryDeskProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = parseInventoryView(searchParams);
  const [capabilities, setCapabilities] = useState<InventoryCapabilities | null>(null);
  const [scopeOptions, setScopeOptions] = useState<ScopeOptions | null>(null);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<InventorySession | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canManage = permissions.includes("inventory.manage");

  const refreshSessions = useCallback(async () => {
    const params = new URLSearchParams({ status: "all", per_page: "50", page: "1" });
    if (listSearch.trim()) {
      params.set("q", listSearch.trim());
    }
    const data = await fetchApi<Paged<InventorySession>>(
      `/inventory/sessions?${params}`,
    );
    setSessions(data.items);
    if (data.items.length === 0) {
      setSessionId(null);
      setSession(null);
      return;
    }
    if (!sessionId || !data.items.some((row) => row.id === sessionId)) {
      setSessionId(data.items[0].id);
    }
  }, [departmentId, listSearch, sessionId]);

  const refreshSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    const row = await fetchApi<InventorySession>(`/inventory/sessions/${sessionId}`);
    setSession(row);
  }, [sessionId]);

  useEffect(() => {
    void fetchApi<InventoryCapabilities>("/inventory/capabilities")
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
    void fetchApi<ScopeOptions>("/inventory/scope-options")
      .then(setScopeOptions)
      .catch(() => setScopeOptions(null));
  }, [departmentId]);

  useEffect(() => {
    void refreshSessions().catch(() => {
      setSessions([]);
    });
  }, [refreshSessions]);

  useEffect(() => {
    void refreshSession().catch(() => setSession(null));
  }, [refreshSession]);

  const setView = useCallback(
    (next: InventoryView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const selectSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const startSession = useCallback(
    async (id: string) => {
      if (!departmentId || !capabilities?.item_list) {
        return;
      }
      await fetchApi(`/inventory/sessions/${id}/start`, { method: "POST" });
      setSessionId(id);
      await refreshSessions();
      await fetchApi<InventorySession>(`/inventory/sessions/${id}`).then(setSession);
      setView("scan");
    },
    [capabilities?.item_list, departmentId, refreshSessions, setView],
  );

  const runExport = useCallback(
    async (kind: "findings" | "filter" | "unverified" | "work_order", format: "csv" | "xlsx") => {
      if (!sessionId) {
        return;
      }
      setExporting(true);
      try {
        await downloadSessionExport(sessionId, { kind, format });
      } finally {
        setExporting(false);
      }
    },
    [sessionId],
  );

  const contextValue = useMemo(
    () => ({
      permissions,
      userId,
      departmentId,
      sessionId,
      session,
      capabilities,
      scopeOptions,
      refreshSession,
      refreshSessions,
      selectSession,
      startSession,
      setView,
      openSessionDialog: () => setDialogOpen(true),
    }),
    [
      capabilities,
      departmentId,
      permissions,
      refreshSession,
      refreshSessions,
      selectSession,
      session,
      sessionId,
      scopeOptions,
      setView,
      startSession,
      userId,
    ],
  );

  return (
    <InventoryDeskContext.Provider value={contextValue}>
      <div className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Library</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
              Inventory &amp; stocktaking
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Plan stocktake sessions, scan the shelf, and review every exception. Session and
              scan records stay in Library Hub. Item status stays in Koha.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline" disabled={!sessionId || exporting} />
                }
              >
                Export
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Session export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["findings", "filter", "unverified", "work_order"] as const).map((kind) => (
                  <DropdownMenuSub key={kind}>
                    <DropdownMenuSubTrigger>{kind.replace("_", " ")}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => void runExport(kind, "csv")}>
                        CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void runExport(kind, "xlsx")}>
                        Excel
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" size="lg" onClick={() => void refreshSessions()}>
              Refresh
            </Button>
            {canManage ? (
              <Button type="button" size="lg" onClick={() => setDialogOpen(true)}>
                New stocktake session
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="min-w-0 text-sm leading-relaxed">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Safeguard rule active — no automatic status changes
            </p>
            <p className="mt-1 text-muted-foreground">
              A missing scan never marks an item lost, withdrawn, or deleted. Unscanned records
              stay unverified until staff finish a shelf search and file a reviewed adjustment.
              Koha changes only after an approved proposal is submitted.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="ml-auto hidden shrink-0 sm:inline-flex"
            onClick={() => setView("audit")}
          >
            View policy log
          </Button>
        </div>

        <NavButtons view={view} setView={setView} />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={sessionId ?? NO_SESSION}
            onValueChange={(value) =>
              setSessionId(value === NO_SESSION || value == null ? null : value)
            }
            disabled={sessions.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue placeholder="Choose a session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SESSION}>Choose a session</SelectItem>
              {sessions.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-full sm:max-w-xs"
            placeholder="Search sessions"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void refreshSessions();
              }
            }}
          />
        </div>

        <div className="min-w-0">
          <div hidden={view !== "overview"}>
            <OverviewView active={view === "overview"} />
          </div>
          {sessionId && view === "scan" ? <ScanView /> : null}
          {sessionId && view === "exceptions" ? <ExceptionsView /> : null}
          {sessionId && view === "adjustments" ? <AdjustmentsView /> : null}
          {sessionId && view === "audit" ? <AuditView /> : null}
          {!sessionId && view !== "overview" ? (
            <p className="text-sm text-muted-foreground">
              Select a session, or plan one from the overview.
            </p>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <SessionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(id) => {
            setSessionId(id);
            void refreshSessions();
          }}
          onStarted={() => {
            void refreshSessions();
            setView("scan");
          }}
        />
      ) : null}
    </InventoryDeskContext.Provider>
  );
}

function NavButtons({
  view,
  setView,
}: {
  view: InventoryView;
  setView: (v: InventoryView) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Inventory views">
      {VIEWS.map((entry) => (
        <Button
          key={entry.id}
          type="button"
          size="lg"
          variant={view === entry.id ? "default" : "outline"}
          onClick={() => setView(entry.id)}
        >
          {entry.label}
        </Button>
      ))}
    </nav>
  );
}