"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { buildPrintPayload } from "@/lib/circulation/print";
import type { DeskItem, DeskPatron, PrintInput } from "@/lib/circulation/types";
import { formatPatronDate } from "@/lib/patrons/display";

const MUTE_KEY = "circulation-mute";
const PLACEHOLDER = "Koha's confirmation will appear here.";

type ResultPanelProps = {
  result: unknown;
  patron: DeskPatron | null;
  checkoutItems: DeskItem[];
};

type OutcomeRow = {
  key: string;
  label: string;
  detail?: string;
};

function readMuted(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  return sessionStorage.getItem(MUTE_KEY) === "true";
}

function outcomeLabel(code: string): string {
  switch (code) {
    case "confirmed":
      return "Confirmed";
    case "refused":
      return "Refused";
    case "unknown":
      return "Unknown";
    case "unsent":
      return "Unsent";
    case "not_applied":
      return "Not applied";
    case "confirmation_required":
      return "Confirmation required";
    default:
      return code;
  }
}

function extractRows(result: unknown): OutcomeRow[] {
  if (!result || typeof result !== "object") {
    return [];
  }
  const record = result as Record<string, unknown>;
  const rows: OutcomeRow[] = [];
  if (Array.isArray(record.items)) {
    for (const line of record.items) {
      if (!line || typeof line !== "object") {
        continue;
      }
      const row = line as Record<string, unknown>;
      const itemId = row.item_id;
      const outcome = typeof row.outcome === "string" ? row.outcome : "unknown";
      const parts: string[] = [];
      if (typeof row.due_date === "string") {
        parts.push(`Due ${formatPatronDate(row.due_date)}`);
      }
      if (typeof row.checkout_id === "number") {
        parts.push(`Checkout ${row.checkout_id}`);
      }
      if (typeof row.message === "string") {
        parts.push(row.message);
      }
      rows.push({
        key: `item-${String(itemId)}-${outcome}`,
        label: `${outcomeLabel(outcome)}${itemId != null ? ` (item ${itemId})` : ""}`,
        detail: parts.length > 0 ? parts.join(" · ") : undefined,
      });
    }
    return rows;
  }
  if (typeof record.outcome === "string") {
    const parts: string[] = [];
    if (typeof record.title === "string") {
      parts.push(record.title);
    }
    if (typeof record.due_date === "string") {
      parts.push(`Due ${formatPatronDate(record.due_date)}`);
    }
    if (typeof record.previous_due_date === "string") {
      parts.push(`Was due ${formatPatronDate(record.previous_due_date)}`);
    }
    if (typeof record.message === "string") {
      parts.push(record.message);
    }
    rows.push({
      key: `single-${record.outcome}`,
      label: outcomeLabel(record.outcome),
      detail: parts.length > 0 ? parts.join(" · ") : undefined,
    });
  }
  return rows;
}

function buildPrintInput(
  result: unknown,
  patron: DeskPatron | null,
  checkoutItems: DeskItem[],
): PrintInput | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  const patronName =
    patron != null
      ? [patron.preferred_name, patron.firstname, patron.surname]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => v.length > 0) ?? "Patron"
      : "Patron";
  const cardnumber =
    typeof patron?.cardnumber === "string" ? patron.cardnumber : "—";
  const titles = new Map<number, string>();
  for (const item of checkoutItems) {
    if (item.item_id != null && item.title) {
      titles.set(item.item_id, item.title);
    }
  }
  if (Array.isArray(record.items)) {
    const lines = record.items
      .filter(
        (line): line is Record<string, unknown> =>
          !!line && typeof line === "object",
      )
      .map((line) => {
        const itemId =
          typeof line.item_id === "number" ? line.item_id : undefined;
        const title =
          (typeof line.title === "string" ? line.title : undefined) ??
          (itemId != null ? titles.get(itemId) : undefined) ??
          `Item ${itemId ?? "?"}`;
        return {
          outcome: typeof line.outcome === "string" ? line.outcome : "",
          title,
          dueDate:
            typeof line.due_date === "string" ? line.due_date : undefined,
          checkoutId:
            typeof line.checkout_id === "number" ? line.checkout_id : undefined,
        };
      });
    const hasConfirmed = lines.some((line) => line.outcome === "confirmed");
    if (!hasConfirmed) {
      return null;
    }
    return {
      type: "checkout",
      patronName,
      cardnumber,
      confirmedAt: new Date().toLocaleString(),
      lines,
    };
  }
  if (record.outcome === "confirmed") {
    const actionType =
      record.circulation_action === "renew" ? "renew" : "checkin";
    return {
      type: actionType,
      patronName,
      cardnumber,
      confirmedAt: new Date().toLocaleString(),
      lines: [
        {
          outcome: "confirmed",
          title:
            typeof record.title === "string" ? record.title : "Returned item",
          dueDate:
            typeof record.returned_date === "string"
              ? record.returned_date
              : typeof record.due_date === "string"
                ? record.due_date
                : undefined,
          checkoutId:
            typeof record.checkout_id === "number"
              ? record.checkout_id
              : undefined,
        },
      ],
    };
  }
  return null;
}

export function ResultPanel({ result, patron, checkoutItems }: ResultPanelProps) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(readMuted());
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      sessionStorage.setItem(MUTE_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  const rows = useMemo(() => extractRows(result), [result]);
  const printInput = useMemo(
    () => buildPrintInput(result, patron, checkoutItems),
    [result, patron, checkoutItems],
  );
  const printText = printInput ? buildPrintPayload(printInput) : "";

  const handlePrint = useCallback(() => {
    const region = document.getElementById("circulation-print");
    if (!region) {
      return;
    }
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(`<pre style="font-family:monospace;font-size:12px">${printText.replace(/</g, "&lt;")}</pre>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 500);
  }, [printText]);

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Result</h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={toggleMute}>
            {muted ? "Unmute" : "Mute"}
          </Button>
          {printInput ? (
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              Print
            </Button>
          ) : null}
        </div>
      </div>
      <pre
        id="circulation-print"
        className="sr-only"
        aria-hidden
      >
        {printText}
      </pre>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{PLACEHOLDER}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="font-medium text-foreground">{row.label}</p>
              {row.detail ? (
                <p className="mt-1 text-muted-foreground">{row.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}