"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

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
import { ApiError, fetchApi } from "@/lib/api";
import { submitScanValue } from "@/lib/circulation/scan";
import type { CirculationCapabilities, DeskItem } from "@/lib/circulation/types";
import { formatPatronDate } from "@/lib/patrons/display";

import { apiErrorMessage, circulationConfirmation } from "./api-error";
import { playTone } from "./play-tone";

const MUTE_KEY = "circulation-mute";

type CheckinPanelProps = {
  permissions: string[];
  onResult: (result: unknown) => void;
};

type CheckinSessionRow = {
  id: string;
  title: string;
  barcode: string | null;
  outcome: string;
  returnedDate?: string | null;
};

function readMuted(): boolean {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function CheckinPanel({ permissions, onResult }: CheckinPanelProps) {
  const canCheckin = permissions.includes("circulation.checkin");
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capabilities, setCapabilities] = useState<CirculationCapabilities | null>(
    null,
  );
  const [confirmItemId, setConfirmItemId] = useState<number | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [sessionRows, setSessionRows] = useState<CheckinSessionRow[]>([]);

  useEffect(() => {
    scanRef.current?.focus();
    void fetchApi<CirculationCapabilities>("/circulation/capabilities")
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);

  const postCheckin = useCallback(
    async (itemId: number, confirm: boolean) => {
      setSubmitting(true);
      setScanError(null);
      try {
        const sendConfirm =
          confirm && capabilities?.checkin_confirmation === true;
        const body = await fetchApi<Record<string, unknown>>("/circulation/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: crypto.randomUUID(),
            item_id: itemId,
            confirm: sendConfirm,
          }),
        });
        onResult(body);
        playTone(body, readMuted());
        const title = typeof body.title === "string" ? body.title : "Item";
        const outcome =
          typeof body.outcome === "string" ? body.outcome : "confirmed";
        setSessionRows((rows) => [
          {
            id: crypto.randomUUID(),
            title,
            barcode: null,
            outcome,
            returnedDate:
              typeof body.returned_date === "string" ? body.returned_date : null,
          },
          ...rows,
        ]);
        setConfirmItemId(null);
        setConfirmMessage("");
        if (scanRef.current) {
          scanRef.current.value = "";
          scanRef.current.focus();
        }
      } catch (error) {
        if (error instanceof ApiError && circulationConfirmation(error)) {
          setConfirmItemId(itemId);
          setConfirmMessage(apiErrorMessage(error));
          return;
        }
        setScanError(apiErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [capabilities?.checkin_confirmation, onResult],
  );

  const resolveAndCheckin = useCallback(
    async (barcode: string) => {
      if (!canCheckin || submitting) {
        return;
      }
      setScanError(null);
      try {
        const item = await fetchApi<DeskItem>(
          `/circulation/items/by-barcode?${new URLSearchParams({ barcode }).toString()}`,
        );
        if (item.item_id == null) {
          setScanError("That item was not found.");
          return;
        }
        await postCheckin(item.item_id, false);
      } catch (error) {
        setScanError(apiErrorMessage(error));
        if (scanRef.current) {
          scanRef.current.value = "";
          scanRef.current.focus();
        }
      }
    },
    [canCheckin, postCheckin, submitting],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== "Tab") {
      return;
    }
    const submitted = submitScanValue(event.currentTarget.value);
    if (!submitted.ok) {
      if (submitted.message) {
        setScanError(submitted.message);
      }
      return;
    }
    event.preventDefault();
    event.currentTarget.value = "";
    void resolveAndCheckin(submitted.value);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Item barcode scan</span>
        <Input
          ref={scanRef}
          autoComplete="off"
          placeholder="Scan barcode"
          disabled={!canCheckin || submitting}
          onKeyDown={handleKeyDown}
        />
      </label>

      {scanError ? (
        <p className="text-sm text-destructive" role="alert">
          {scanError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Returns this session: {sessionRows.length}
        </span>
        {!canCheckin ? (
          <span className="text-sm text-muted-foreground">
            You do not have permission for this action.
          </span>
        ) : null}
      </div>

      {sessionRows.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {sessionRows.map((row) => (
            <li key={row.id} className="px-3 py-2">
              <p className="font-medium text-foreground">{row.title}</p>
              <p className="text-muted-foreground">
                {row.outcome}
                {row.returnedDate
                  ? ` · Returned ${formatPatronDate(row.returnedDate)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={confirmItemId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmItemId(null);
            setConfirmMessage("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm check-in</DialogTitle>
            <DialogDescription>{confirmMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmItemId(null);
                setConfirmMessage("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting || capabilities?.checkin_confirmation !== true}
              onClick={() => {
                if (confirmItemId != null) {
                  void postCheckin(confirmItemId, true);
                }
              }}
            >
              Confirm return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}