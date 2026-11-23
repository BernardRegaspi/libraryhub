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

const BANNER =
  "An unscanned item stays unverified. Koha is unchanged until an approved proposal is submitted.";

const VIEWS: { id: InventoryView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scan", label: "Scan" },
  { id: "exceptions", label: "Exceptions" },
  { id: "adjustments", label: "Adjustments" },
  { id: "audit", label: "Audit" },
];

export type InventoryDeskContextValue = {
  permissions: string[];
  departmentId: string;
  sessionId: string | null;
  session: InventorySession | null;
  capabilities: InventoryCapabilities | null;
  scopeOptions: ScopeOptions | null;
  refreshSession: () => Promise<void>;
  refreshSessions: () => Promise<void>;
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
  departmentId: string;
};

export function InventoryDesk({ permissions, departmentId }: InventoryDeskProps) {
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
  }, [listSearch, sessionId]);

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
      departmentId,
      sessionId,
      session,
      capabilities,
      scopeOptions,
      refreshSession,
      refreshSessions,
    }),
    [
      permissions,
      departmentId,
      sessionId,
      session,
      capabilities,
      scopeOptions,
      refreshSession,
      refreshSessions,
    ],
  );

  return (
    <InventoryDeskContext.Provider value={contextValue}>
      <div className="space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {BANNER}
        </p>

        <NavButtons view={view} setView={setView} />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={sessionId ?? undefined}
              onValueChange={(value) => setSessionId(value)}
              disabled={sessions.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Choose a session" />
              </SelectTrigger>
              <SelectContent>
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
            <Button type="button" variant="outline" onClick={() => void refreshSessions()}>
              Refresh
            </Button>
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
            {canManage ? (
              <Button type="button" onClick={() => setDialogOpen(true)}>
                New session
              </Button>
            ) : null}
          </div>
        </div>

        {!sessionId ? (
          <p className="text-sm text-muted-foreground">
            No inventory session yet. {canManage ? "Create one to begin." : ""}
          </p>
        ) : null}

        {sessionId ? (
          <div className="min-w-0">
            {view === "overview" ? <OverviewView onOpenScan={() => setView("scan")} /> : null}
            {view === "scan" ? <ScanView /> : null}
            {view === "exceptions" ? <ExceptionsView /> : null}
            {view === "adjustments" ? <AdjustmentsView /> : null}
            {view === "audit" ? <AuditView /> : null}
          </div>
        ) : null}
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
          variant={view === entry.id ? "default" : "outline"}
          onClick={() => setView(entry.id)}
        >
          {entry.label}
        </Button>
      ))}
    </nav>
  );
}