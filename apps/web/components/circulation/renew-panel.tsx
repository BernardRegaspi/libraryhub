"use client";

import {
  useCallback,
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
import { fetchApi } from "@/lib/api";
import { submitScanValue } from "@/lib/circulation/scan";
import { formatPatronDate } from "@/lib/patrons/display";

import { apiErrorMessage } from "./api-error";
import { playTone } from "./play-tone";

const MUTE_KEY = "circulation-mute";

type RenewPanelProps = {
  permissions: string[];
  onResult: (result: unknown) => void;
};

type RenewalPreview = {
  checkout_id?: number;
  title?: string | null;
  due_date?: string | null;
  renewals_count?: number | null;
  patron_name?: string | null;
  cardnumber?: string | null;
  external_id?: string | null;
  renewal?: {
    status: string;
    allowed?: boolean;
    message?: string | null;
  };
};

function readMuted(): boolean {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function RenewPanel({ permissions, onResult }: RenewPanelProps) {
  const canRenew = permissions.includes("circulation.renew");
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RenewalPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadPreview = useCallback(async (barcode: string) => {
    setScanError(null);
    try {
      const data = await fetchApi<RenewalPreview>(
        `/circulation/renewals/preview?${new URLSearchParams({ barcode }).toString()}`,
      );
      setPreview(data);
    } catch (error) {
      setPreview(null);
      setScanError(apiErrorMessage(error));
    }
  }, []);

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
    void loadPreview(submitted.value).finally(() => scanRef.current?.focus());
  };

  const submitRenewal = useCallback(async () => {
    if (!canRenew || !preview?.checkout_id || submitting) {
      return;
    }
    setSubmitting(true);
    setScanError(null);
    try {
      const body = await fetchApi<Record<string, unknown>>("/circulation/renewals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          checkout_id: preview.checkout_id,
        }),
      });
      onResult(body);
      playTone(body, readMuted());
      setConfirmOpen(false);
      if (scanRef.current) {
        scanRef.current.value = "";
        scanRef.current.focus();
      }
    } catch (error) {
      setScanError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [canRenew, onResult, preview?.checkout_id, submitting]);

  const openConfirm = () => {
    const renewal = preview?.renewal;
    if (
      renewal?.status === "known" &&
      renewal.allowed === false &&
      renewal.message
    ) {
      setConfirmOpen(true);
      return;
    }
    void submitRenewal();
  };

  const denialMessage =
    preview?.renewal?.status === "known" &&
    preview.renewal.allowed === false &&
    preview.renewal.message
      ? preview.renewal.message
      : null;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Loan barcode scan</span>
        <Input
          ref={scanRef}
          autoComplete="off"
          placeholder="Scan barcode"
          disabled={!canRenew}
          onKeyDown={handleKeyDown}
        />
      </label>

      {preview ? (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
          <p className="font-medium text-foreground">{preview.title ?? "Loan"}</p>
          <p className="text-muted-foreground">
            {preview.patron_name ?? "Patron"} · {preview.cardnumber ?? "—"}
          </p>
          <p className="text-muted-foreground">
            Due {formatPatronDate(preview.due_date ?? null)}
            {preview.renewals_count != null
              ? ` · Renewals ${preview.renewals_count}`
              : ""}
          </p>
          {denialMessage ? (
            <p className="mt-2 text-muted-foreground">{denialMessage}</p>
          ) : null}
        </div>
      ) : null}

      {scanError ? (
        <p className="text-sm text-destructive" role="alert">
          {scanError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!canRenew || !preview?.checkout_id || submitting}
          onClick={openConfirm}
        >
          Confirm renewal
        </Button>
        {!canRenew ? (
          <span className="text-sm text-muted-foreground">
            You do not have permission for this action.
          </span>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koha may refuse this renewal</DialogTitle>
            <DialogDescription>{denialMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void submitRenewal()}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}