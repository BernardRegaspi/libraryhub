"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, fetchApi } from "@/lib/api";
import type { InventoryItemRow } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";

type ItemDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: InventoryItemRow | null;
  onChanged: () => void;
};

const VERDICTS: Record<string, { label: string; className: string }> = {
  found: {
    label: "Matched",
    className: "border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  misplaced: {
    label: "Misplaced",
    className: "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  unexpected: {
    label: "Unexpected",
    className: "border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  damaged: {
    label: "Damaged",
    className: "border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300",
  },
  withdrawn: {
    label: "Withdrawal requested",
    className: "border-violet-500/25 bg-violet-500/12 text-violet-700 dark:text-violet-300",
  },
  not_found: {
    label: "Not found",
    className: "border-orange-500/25 bg-orange-500/12 text-orange-700 dark:text-orange-300",
  },
  unverified: {
    label: "Unverified",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const REASON_CODES = [
  "CONDITION_DAMAGE",
  "SUPERSEDED_EDITION",
  "SHELF_REORDER",
  "BRANCH_TRANSFER",
  "MISSING_AFTER_SEARCH",
  "NOTE_ONLY",
] as const;

export function ItemDrawer({ open, onOpenChange, row, onChanged }: ItemDrawerProps) {
  const { sessionId, session, permissions, capabilities } = useInventoryDesk();
  const [note, setNote] = useState("");
  const [proposalField, setProposalField] = useState("");
  const [proposalTo, setProposalTo] = useState("");
  const [reasonCode, setReasonCode] = useState<(typeof REASON_CODES)[number]>("CONDITION_DAMAGE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = permissions.includes("inventory.manage");
  const canDraft =
    canManage && (session?.status === "in_progress" || session?.status === "completed");
  const inProgress = session?.status === "in_progress";

  const flagDamage = async (damaged: boolean) => {
    if (!row?.scan_id || !sessionId) {
      return;
    }
    if (!note.trim()) {
      setError("A remark is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/scans/${row.scan_id}/damage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ damaged, remark: note.trim() }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Damage update failed.");
    } finally {
      setBusy(false);
    }
  };

  const reverseNotFound = async () => {
    if (!row?.shelf_search_id || !sessionId) {
      return;
    }
    if (!note.trim()) {
      setError("A remark is required to reverse.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchApi(
        `/inventory/sessions/${sessionId}/shelf-searches/${row.shelf_search_id}/reverse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remark: note.trim() }),
        },
      );
      onChanged();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reverse failed.");
    } finally {
      setBusy(false);
    }
  };

  const draftProposal = async () => {
    if (!row || !sessionId) {
      return;
    }
    if (!proposalField || !proposalTo.trim()) {
      setError("Field and new value are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          koha_item_id: Number(row.koha_item_id),
          field: proposalField,
          to_value: proposalTo.trim(),
          reason: [reasonCode, note.trim()].filter(Boolean).join(" — "),
          from_value: null,
          expected_item_id: row.expected_item_id,
          scan_id: row.scan_id,
        }),
      });
      setProposalField("");
      setProposalTo("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Draft failed.");
    } finally {
      setBusy(false);
    }
  };

  const verdict = VERDICTS[row?.condition ?? ""] ?? {
    label: row?.condition ?? "Record",
    className: "border-border bg-muted text-muted-foreground",
  };
  const damagedFlag = row?.observed_damaged || row?.condition === "damaged" ? "1" : "0";
  const withdrawnFlag = row?.condition === "withdrawn" ? "1" : "0";
  const kohaRows: Array<[string, string, boolean]> = [
    ["status", display(row?.koha_status), false],
    ["notforloan", "—", false],
    ["damaged", damagedFlag, damagedFlag === "1"],
    ["lost", "—", false],
    ["withdrawn", withdrawnFlag, withdrawnFlag === "1"],
    ["homebranch", display(row?.home_library), false],
    ["holdingbranch", "—", false],
    ["collection code", "—", false],
    ["permanent location", display(row?.snapshot_location), false],
    ["date accessioned", "—", false],
    ["replacement price", "—", false],
    ["paid for", "—", false],
  ];

  return (
    <Sheet open={open && row !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(560px,100vw)] gap-0 overflow-y-auto p-0 sm:max-w-none"
      >
        {row ? (
          <>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-popover px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Item review
                </div>
                <SheetTitle className="font-mono text-[13px] font-semibold">
                  {row.expected_item_id ?? row.scan_id ?? "Scan"} · {display(row.koha_item_id)}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Full record for {row.title || "this item"}
                </SheetDescription>
              </div>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${verdict.className}`}
              >
                {verdict.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => onOpenChange(false)}
              >
                <span className="sr-only">Close</span>
                <CloseIcon />
              </Button>
            </div>

            <div className="space-y-5 p-5">
              <div className="min-w-0">
                <h3 className="text-[17px] leading-snug font-semibold">{row.title || "Untitled"}</h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{display(row.author)}</p>
                <p className="mt-1.5 font-mono text-[12px]">
                  {display(row.call_number)} · {display(row.item_type)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px]">
                    {display(row.barcode)}
                  </span>
                  <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px]">
                    item {display(row.koha_item_id)}
                  </span>
                </div>
              </div>

              <section>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Koha item record
                  <span className="font-medium text-emerald-700 normal-case dark:text-emerald-300">
                    — authoritative source
                  </span>
                </div>
                <div className="mt-2.5 overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-border">
                      {kohaRows.map(([label, value, alert]) => (
                        <tr key={label} className={alert ? "bg-rose-500/[.07]" : undefined}>
                          <td className="w-[46%] px-3 py-2 text-muted-foreground">{label}</td>
                          <td className="px-3 py-2 font-mono font-semibold">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Snapshot compared with the live Koha item. Library Hub does not edit these fields
                  directly — changes flow only through an approved adjustment proposal.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Inventory &amp; scan history
                  <span className="font-medium text-indigo-600 normal-case dark:text-indigo-300">
                    — PostgreSQL
                  </span>
                </div>
                <div className="mt-2.5 space-y-2">
                  <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-[12px]">
                    <HistoryRow label="Last seen (scan)" value={formatWhen(row.scanned_at)} mono />
                    <HistoryRow label="Operator" value={display(row.operator_name)} />
                    <HistoryRow label="Device" value="Keyboard wedge / manual" />
                    <HistoryRow
                      label="Capture attempts this session"
                      value={row.scanned_at ? "1" : "0"}
                      mono
                    />
                  </div>
                  <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-[12px]">
                    <HistoryRow label="Condition" value={verdict.label} />
                    <HistoryRow label="Recorded by" value={display(row.operator_name)} />
                    <HistoryRow label="Method" value="Stocktake scan" />
                    <HistoryRow label="Scanned at" value={display(row.live_or_station_location)} />
                    {row.remark ? <HistoryRow label="Remark" value={row.remark} /> : null}
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Review
                </div>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Observations, condition notes, second-search evidence…"
                  className="text-[12.5px]"
                />
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Proposed Koha field
                    </Label>
                    <Select
                      value={proposalField || "none"}
                      onValueChange={(value) => setProposalField(!value || value === "none" ? "" : value)}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="— no change —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— no change —</SelectItem>
                        {(capabilities?.update_fields ?? []).map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Reason code
                    </Label>
                    <Select
                      value={reasonCode}
                      onValueChange={(value) => {
                        if (value && REASON_CODES.includes(value as (typeof REASON_CODES)[number])) {
                          setReasonCode(value as (typeof REASON_CODES)[number]);
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REASON_CODES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                    New value
                  </Label>
                  <Input
                    className="mt-1"
                    value={proposalTo}
                    onChange={(event) => setProposalTo(event.target.value)}
                    placeholder="Value to propose"
                  />
                </div>
              </section>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[.07] p-3 text-[11.5px] leading-relaxed">
                <b className="text-amber-800 dark:text-amber-200">Guard:</b> saving here creates a
                proposal only. No Koha field changes until the proposal is approved and submitted
                while write-back capability is enabled.
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {row.scan_id && canManage && inProgress ? (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void flagDamage(true)}>
                      Flag damaged
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void flagDamage(false)}>
                      Clear damaged
                    </Button>
                  </>
                ) : null}
                {row.condition === "not_found" && row.shelf_search_id && canManage && inProgress ? (
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reverseNotFound()}>
                    Return to unverified
                  </Button>
                ) : null}
                {canDraft ? (
                  <Button type="button" size="sm" disabled={busy} onClick={() => void draftProposal()}>
                    Create proposal
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function HistoryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <b className={mono ? "font-mono" : undefined}>{value}</b>
    </div>
  );
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function formatWhen(value: string | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
