"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, fetchApi } from "@/lib/api";
import type { InventoryOperator, InventorySession } from "@/lib/inventory/types";

import { useInventoryDesk } from "./inventory-desk";

type SessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (sessionId: string) => void;
  onStarted: () => void;
};

const KOHA_UNAVAILABLE = "This Koha operation is not available.";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function SessionDialog({
  open,
  onOpenChange,
  onCreated,
  onStarted,
}: SessionDialogProps) {
  const { capabilities, scopeOptions, refreshSessions } = useInventoryDesk();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startOn, setStartOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetOn, setTargetOn] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");
  const [locations, setLocations] = useState<string[]>([]);
  const [operatorIds, setOperatorIds] = useState<string[]>([]);
  const [operators, setOperators] = useState<InventoryOperator[]>([]);
  const [submitting, setSubmitting] = useState<"draft" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const homeLibrary = scopeOptions?.home_library_id ?? null;
  const saveBlocked = !homeLibrary;
  const startBlocked = !capabilities?.item_list || !homeLibrary;

  useEffect(() => {
    if (!open) {
      return;
    }
    void fetchApi<{ items: InventoryOperator[] }>("/inventory/operators")
      .then((data) => setOperators(data.items))
      .catch(() => setOperators([]));
  }, [open]);

  const buildBody = useCallback(() => {
    return {
      name: name.trim(),
      description: description.trim() || null,
      start_on: startOn,
      target_on: targetOn || null,
      locations,
      item_type_id: itemTypeId ? Number(itemTypeId) : null,
      operator_ids: operatorIds,
    };
  }, [description, itemTypeId, locations, name, operatorIds, startOn, targetOn]);

  const validate = useCallback(() => {
    if (!name.trim()) {
      setError("Session name is required.");
      return false;
    }
    if (!startOn) {
      setError("Start date is required.");
      return false;
    }
    setError(null);
    return true;
  }, [name, startOn]);

  const saveDraft = useCallback(async () => {
    if (!validate() || saveBlocked) {
      return;
    }
    setSubmitting("draft");
    try {
      const row = await fetchApi<InventorySession>("/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      onCreated(row.id);
      await refreshSessions();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the draft.");
    } finally {
      setSubmitting(null);
    }
  }, [buildBody, onCreated, onOpenChange, refreshSessions, saveBlocked, validate]);

  const startSession = useCallback(async () => {
    if (!validate() || startBlocked) {
      return;
    }
    setSubmitting("start");
    try {
      const row = await fetchApi<InventorySession>("/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      await fetchApi<InventorySession>(`/inventory/sessions/${row.id}/start`, {
        method: "POST",
      });
      onCreated(row.id);
      await refreshSessions();
      onOpenChange(false);
      onStarted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the session.");
    } finally {
      setSubmitting(null);
    }
  }, [buildBody, onCreated, onOpenChange, onStarted, refreshSessions, startBlocked, validate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New stocktake session</DialogTitle>
          <DialogDescription>
            Scope stays within the department home library. Locations are optional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <Input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
            </Field>
            <Field label="Target date">
              <Input type="date" value={targetOn} onChange={(e) => setTargetOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Home library">
            <p className="text-sm font-medium">
              {homeLibrary ?? "This department has no Koha library."}
            </p>
          </Field>
          <Field label="Item type (optional)">
            <Select
              value={itemTypeId || "none"}
              onValueChange={(value) => setItemTypeId(value === "none" || value == null ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All types</SelectItem>
                {(scopeOptions?.item_types ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {(scopeOptions?.locations ?? []).length > 0 ? (
            <Field label="Locations">
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {(scopeOptions?.locations ?? []).map((row) => (
                  <label key={row.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={locations.includes(row.id)}
                      onChange={() => {
                        setLocations((current) =>
                          current.includes(row.id)
                            ? current.filter((value) => value !== row.id)
                            : [...current, row.id],
                        );
                      }}
                    />
                    <span>{row.label}</span>
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          <Field label="Operators">
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
              {operators.map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={operatorIds.includes(row.id)}
                    onChange={() => {
                      setOperatorIds((current) =>
                        current.includes(row.id)
                          ? current.filter((value) => value !== row.id)
                          : [...current, row.id],
                      );
                    }}
                  />
                  <span>{row.display_name}</span>
                </label>
              ))}
            </div>
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={submitting !== null || saveBlocked}
            onClick={() => void saveDraft()}
          >
            Save draft
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              disabled={submitting !== null || startBlocked}
              onClick={() => void startSession()}
            >
              Start and pull snapshot
            </Button>
            {!capabilities?.item_list ? (
              <span className="text-sm text-muted-foreground">{KOHA_UNAVAILABLE}</span>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}