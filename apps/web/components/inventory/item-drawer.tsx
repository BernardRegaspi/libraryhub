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
  SheetHeader,
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

export function ItemDrawer({ open, onOpenChange, row, onChanged }: ItemDrawerProps) {
  const { sessionId, session, permissions, capabilities } = useInventoryDesk();
  const [damageRemark, setDamageRemark] = useState("");
  const [reverseRemark, setReverseRemark] = useState("");
  const [proposalField, setProposalField] = useState("");
  const [proposalTo, setProposalTo] = useState("");
  const [proposalReason, setProposalReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = permissions.includes("inventory.manage");
  const canDraft =
    canManage && (session?.status === "in_progress" || session?.status === "completed");

  if (!row || !sessionId) {
    return null;
  }

  const toggleDamage = async (damaged: boolean) => {
    if (!row.scan_id || !damageRemark.trim()) {
      setError("A remark is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/scans/${row.scan_id}/damage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ damaged, remark: damageRemark.trim() }),
      });
      setDamageRemark("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Damage update failed.");
    } finally {
      setBusy(false);
    }
  };

  const reverseNotFound = async () => {
    if (!row.shelf_search_id || !reverseRemark.trim()) {
      setError("A remark is required to reverse.");
      return;
    }
    setBusy(true);
    try {
      await fetchApi(
        `/inventory/sessions/${sessionId}/shelf-searches/${row.shelf_search_id}/reverse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remark: reverseRemark.trim() }),
        },
      );
      setReverseRemark("");
      onChanged();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reverse failed.");
    } finally {
      setBusy(false);
    }
  };

  const draftProposal = async () => {
    if (!proposalField || !proposalTo.trim() || !proposalReason.trim()) {
      setError("Field, value, and reason are required.");
      return;
    }
    setBusy(true);
    try {
      await fetchApi(`/inventory/sessions/${sessionId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          koha_item_id: Number(row.koha_item_id),
          field: proposalField,
          to_value: proposalTo.trim(),
          reason: proposalReason.trim(),
          from_value: null,
          expected_item_id: row.expected_item_id,
          scan_id: row.scan_id,
        }),
      });
      setProposalField("");
      setProposalTo("");
      setProposalReason("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Draft failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.title || "Item"}</SheetTitle>
          <SheetDescription>{row.condition}</SheetDescription>
        </SheetHeader>
        <dl className="mt-4 space-y-2 text-sm">
          {"barcode" in row && row.barcode ? (
            <Field label="Barcode" value={row.barcode} />
          ) : null}
          <Field label="Author" value={row.author} />
          <Field label="Type" value={row.item_type} />
          <Field label="Snapshot location" value={row.snapshot_location} />
          <Field label="Live or station" value={row.live_or_station_location} />
          <Field label="Koha status" value={row.koha_status} />
          {row.remark ? <Field label="Remark" value={row.remark} /> : null}
        </dl>

        {row.scan_id && canManage && session?.status === "in_progress" ? (
          <div className="mt-6 space-y-2">
            <Label htmlFor="damage-remark">Damage remark</Label>
            <Textarea
              id="damage-remark"
              value={damageRemark}
              onChange={(e) => setDamageRemark(e.target.value)}
            />
            <Flow className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void toggleDamage(true)}
              >
                Flag damaged
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void toggleDamage(false)}
              >
                Clear damaged
              </Button>
            </Flow>
          </div>
        ) : null}

        {row.condition === "not_found" &&
        row.shelf_search_id &&
        canManage &&
        session?.status === "in_progress" ? (
          <div className="mt-6 space-y-2">
            <Label htmlFor="reverse-remark">Return to unverified</Label>
            <Textarea
              id="reverse-remark"
              value={reverseRemark}
              onChange={(e) => setReverseRemark(e.target.value)}
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void reverseNotFound()}>
              Return to unverified
            </Button>
          </div>
        ) : null}

        {canDraft ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium">Draft proposal</p>
            <Select
              value={proposalField}
              onValueChange={(value) => setProposalField(value ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {(capabilities?.update_fields ?? []).map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="New value"
              value={proposalTo}
              onChange={(e) => setProposalTo(e.target.value)}
            />
            <Textarea
              placeholder="Reason"
              value={proposalReason}
              onChange={(e) => setProposalReason(e.target.value)}
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void draftProposal()}>
              Save draft proposal
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function Flow({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}
