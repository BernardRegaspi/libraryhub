/* eslint-disable react-hooks/set-state-in-effect -- audit log reloads on filter */
"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi } from "@/lib/api";
import type { AuditLogRow, Paged } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";
import { ViewEmpty, ViewLoading } from "./view-states";

export function AuditView() {
  const { sessionId } = useInventoryDesk();
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ per_page: "50", page: "1" });
    if (actor.trim()) {
      params.set("actor_id", actor.trim());
    }
    if (action.trim()) {
      params.set("action", action.trim());
    }
    const data = await fetchApi<Paged<AuditLogRow>>(
      `/inventory/sessions/${sessionId}/audit?${params}`,
    );
    setRows(data.items);
    setLoading(false);
  }, [action, actor, sessionId]);

  useEffect(() => {
    void loadRows().catch(() => {
      setRows([]);
      setLoading(false);
    });
  }, [loadRows]);

  if (!sessionId) {
    return <ViewEmpty message="Select a session." />;
  }

  if (loading && rows.length === 0) {
    return <ViewLoading label="Loading audit…" />;
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          className="sm:max-w-xs"
          placeholder="Actor user id"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />
        <Input
          className="sm:max-w-xs"
          placeholder="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={() => void loadRows()}>
          Filter
        </Button>
      </section>

      {rows.length === 0 ? (
        <ViewEmpty message="No audit rows for this filter." />
      ) : (
        <section className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Object</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.user_id ?? "—"}</td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2">
                    {row.entity_type} {row.entity_id}
                  </td>
                  <td className="max-w-md whitespace-pre-wrap px-3 py-2 text-xs">
                    {formatDetails(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) {
    return "—";
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value && typeof value === "object" && "before" in value && "after" in value) {
      const pair = value as { before?: unknown; after?: unknown };
      parts.push(`${key}: ${String(pair.before)} → ${String(pair.after)}`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join("\n") || "—";
}