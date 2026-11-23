/* eslint-disable react-hooks/set-state-in-effect -- adjustments load on session */
"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, fetchApi } from "@/lib/api";
import { downloadSessionExport } from "@/lib/inventory/export";
import type { InventoryAdjustment } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";
import { KohaUnavailableBanner, ViewEmpty, ViewLoading } from "./view-states";

export function AdjustmentsView() {
  const { sessionId, permissions, capabilities } = useInventoryDesk();
  const [rows, setRows] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canApprove = permissions.includes("inventory.adjustments.approve");
  const canSubmit = canApprove && capabilities?.item_update === true;
  const kohaItemListBlocked = capabilities?.item_list === false;

  const loadRows = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApi<{ items: InventoryAdjustment[] }>(
        `/inventory/sessions/${sessionId}/adjustments`,
      );
      setRows(data.items);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadRows().catch(() => {
      setRows([]);
      setLoading(false);
    });
  }, [loadRows]);

  const decide = async (id: string, action: "approve" | "reject" | "submit") => {
    setError(null);
    try {
      if (action === "reject") {
        await fetchApi(`/inventory/adjustments/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        });
        setRejectId(null);
        setRejectReason("");
      } else {
        await fetchApi(`/inventory/adjustments/${id}/${action}`, { method: "POST" });
      }
      await loadRows();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed.");
    }
  };

  if (!sessionId) {
    return <ViewEmpty message="Select a session." />;
  }

  if (loading && rows.length === 0) {
    return <ViewLoading label="Loading proposals…" />;
  }

  return (
    <div className="space-y-4">
      {kohaItemListBlocked ? <KohaUnavailableBanner /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Koha item update</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {capabilities?.item_update ? (
            <p>
              Item update is recorded. Allowed fields:{" "}
              {(capabilities.update_fields ?? []).join(", ") || "none listed."}
            </p>
          ) : (
            <KohaUnavailableBanner />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!sessionId}
          onClick={() => {
            if (!sessionId) {
              return;
            }
            void downloadSessionExport(sessionId, { kind: "work_order", format: "csv" });
          }}
        >
          Export work order
        </Button>
      </div>

      {rows.length === 0 ? (
        <ViewEmpty message="No proposals for this session." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Drafter</th>
                <th className="px-3 py-2 font-medium">Decider</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.field}</td>
                  <td className="px-3 py-2">{row.from_value ?? "—"}</td>
                  <td className="px-3 py-2">{row.to_value}</td>
                  <td className="px-3 py-2">{row.reason}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.drafted_by ?? "—"}</td>
                  <td className="px-3 py-2">{row.decided_by ?? "—"}</td>
                  <td className="space-x-2 px-3 py-2 text-right">
                    {canApprove && row.status === "draft" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void decide(row.id, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectId(row.id)}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {row.status === "approved" || row.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canSubmit}
                        onClick={() => void decide(row.id, "submit")}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {!canSubmit && (row.status === "approved" || row.status === "failed") ? (
                      <span className="text-xs text-muted-foreground">Submit inactive</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reject proposal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button type="button" onClick={() => void decide(rejectId, "reject")}>
              Confirm reject
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}