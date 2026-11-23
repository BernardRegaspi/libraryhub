"use client";

import { toast } from "sonner";

import { formatPatronDate } from "@/lib/patrons/display";

function duePhrase(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return `Due ${formatPatronDate(value)}`;
}

function announce(outcome: string, title: string, description?: string) {
  const options = description ? { description } : undefined;
  if (outcome === "confirmed") {
    toast.success(title, options);
    return;
  }
  if (outcome === "refused" || outcome === "not_applied") {
    toast.error(title, options);
    return;
  }
  if (outcome === "unknown" || outcome === "confirmation_required") {
    toast.warning(title, options);
    return;
  }
  toast.message(title, options);
}

function itemTitle(row: Record<string, unknown>): string {
  return typeof row.title === "string" && row.title.trim().length > 0
    ? row.title
    : "Item";
}

export function toastCirculationResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return;
  }
  const record = result as Record<string, unknown>;
  const action = record.circulation_action;
  if (Array.isArray(record.items)) {
    for (const line of record.items) {
      if (!line || typeof line !== "object") {
        continue;
      }
      const row = line as Record<string, unknown>;
      const outcome = typeof row.outcome === "string" ? row.outcome : "unknown";
      if (outcome === "unsent") {
        continue;
      }
      const name = itemTitle(row);
      const message = typeof row.message === "string" ? row.message : undefined;
      if (outcome === "confirmed") {
        announce("confirmed", `Checked out ${name}`, duePhrase(row.due_date));
      } else if (outcome === "refused") {
        announce("refused", message ?? "Koha refused this transaction.", name);
      } else if (outcome === "unknown") {
        announce("unknown", "The outcome is unknown.", name);
      } else {
        announce(outcome, name, message);
      }
    }
    return;
  }
  const outcome = typeof record.outcome === "string" ? record.outcome : null;
  if (!outcome) {
    return;
  }
  const name = itemTitle(record);
  const message = typeof record.message === "string" ? record.message : undefined;
  if (action === "checkin" && outcome === "confirmed") {
    const returned =
      typeof record.returned_date === "string"
        ? `Returned ${formatPatronDate(record.returned_date)}`
        : undefined;
    announce("confirmed", `Checked in ${name}`, returned);
    return;
  }
  if (action === "renew" && outcome === "confirmed") {
    announce("confirmed", `Renewed ${name}`, duePhrase(record.due_date));
    return;
  }
  if (outcome === "confirmed") {
    announce("confirmed", name, duePhrase(record.due_date));
    return;
  }
  if (outcome === "refused") {
    announce("refused", message ?? "Koha refused this transaction.");
    return;
  }
  if (outcome === "unknown") {
    announce("unknown", "The outcome is unknown.", name);
    return;
  }
  announce(outcome, message ?? name);
}
