/* eslint-disable react-hooks/set-state-in-effect -- exception table reloads on filter */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, fetchApi } from "@/lib/api";
import type { InventoryItemRow, ItemCondition, Paged } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";
import { ItemDrawer } from "./item-drawer";
import { ViewEmpty, ViewLoading } from "./view-states";

const TABS: { id: ItemCondition; label: string }[] = [
  { id: "all", label: "All" },
  { id: "not_found", label: "Not Found" },
  { id: "misplaced", label: "Misplaced" },
  { id: "unexpected", label: "Unexpected" },
  { id: "damaged", label: "Damaged" },
  { id: "withdrawn", label: "Withdrawn" },
];

export function ExceptionsView() {
  const { sessionId, permissions, session } = useInventoryDesk();
  const [condition, setCondition] = useState<ItemCondition>("all");
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InventoryItemRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [remark, setRemark] = useState("");
  const [drawerRow, setDrawerRow] = useState<InventoryItemRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canManage = permissions.includes("inventory.manage");

  const loadRows = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      condition,
      per_page: "50",
      page: "1",
      sort: "condition",
      direction: "asc",
    });
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (location.trim()) {
      params.set("location", location.trim());
    }
    const data = await fetchApi<Paged<InventoryItemRow>>(
      `/inventory/sessions/${sessionId}/items?${params}`,
    );
    setRows(data.items);
    setSelected(new Set());
    setLoading(false);
  }, [condition, location, query, sessionId]);

  useEffect(() => {
    void loadRows().catch(() => {
      setRows([]);
      setLoading(false);
    });
  }, [loadRows]);

  const unverifiedIds = useMemo(
    () =>
      rows
        .filter((row) => row.condition === "unverified" && row.expected_item_id)
        .map((row) => row.expected_item_id as string),
    [rows],
  );

  const toggleRow = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const markNotFound = async () => {
    if (!sessionId || selected.size === 0 || !remark.trim()) {
      setError("Select unverified rows and enter a remark.");
      return;
    }
    setError(null);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/shelf-searches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_item_ids: [...selected],
          remark: remark.trim(),
        }),
      });
      setRemark("");
      setCondition("not_found");
      await loadRows();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mark not found failed.");
    }
  };

  if (!sessionId) {
    return <ViewEmpty message="Select a session." />;
  }

  if (loading && rows.length === 0) {
    return <ViewLoading label="Loading exceptions…" />;
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Exception conditions">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={condition === tab.id ? "default" : "outline"}
            onClick={() => setCondition(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          className="sm:max-w-xs"
          placeholder="Filter by location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Input
          className="sm:max-w-xs"
          placeholder="Search title, author, call number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={() => void loadRows()}>
          Apply
        </Button>
      </div>

      {canManage && session?.status === "in_progress" ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">Mark not found</p>
          <Textarea
            placeholder="One remark for the selected set"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() => void markNotFound()}
          >
            Mark not found
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <ViewEmpty message="No rows match this filter." />
      ) : (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-muted-foreground">
            <tr>
              {canManage && session?.status === "in_progress" ? (
                <th className="w-10 px-3 py-2" />
              ) : null}
              <th className="px-3 py-2 font-medium">Barcode</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Author</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Snapshot</th>
              <th className="px-3 py-2 font-medium">Live / station</th>
              <th className="px-3 py-2 font-medium">Condition</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Operator</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const id = row.expected_item_id ?? row.scan_id ?? String(index);
              const selectable =
                canManage &&
                session?.status === "in_progress" &&
                row.condition === "unverified" &&
                row.expected_item_id;
              return (
                <tr
                  key={id}
                  className="cursor-pointer border-b border-border last:border-0"
                  onClick={() => setDrawerRow(row)}
                >
                  {canManage && session?.status === "in_progress" ? (
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={selected.has(row.expected_item_id!)}
                          onChange={() => toggleRow(row.expected_item_id!)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">{row.barcode ?? "—"}</td>
                  <td className="px-3 py-2">{row.title}</td>
                  <td className="px-3 py-2">{row.author}</td>
                  <td className="px-3 py-2">{row.item_type}</td>
                  <td className="px-3 py-2">{row.snapshot_location}</td>
                  <td className="px-3 py-2">{row.live_or_station_location}</td>
                  <td className="px-3 py-2">{row.condition}</td>
                  <td className="px-3 py-2">{formatTime(row.scanned_at)}</td>
                  <td className="px-3 py-2">{row.operator_name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Unverified rows on this page: {unverifiedIds.length}. Select checkboxes to mark not found.
      </p>

      <ItemDrawer
        open={drawerRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerRow(null);
          }
        }}
        row={drawerRow}
        onChanged={() => void loadRows()}
      />
    </div>
  );
}

function formatTime(value: string): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}