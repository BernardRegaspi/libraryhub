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
import { pushQueue, submitScanValue } from "@/lib/circulation/scan";
import type { DeskItem, DeskPatron } from "@/lib/circulation/types";
import {
  displayName,
  formatPatronDate,
  formatPeso,
  statusBadges,
} from "@/lib/patrons/display";
import type { PatronDirectoryItem, PatronSearchResponse } from "@/lib/patrons/types";

import { apiErrorMessage } from "./api-error";
import { toastCirculationResult } from "./circulation-toast";
import { playTone } from "./play-tone";

const MUTE_KEY = "circulation-mute";

type CheckoutPanelProps = {
  permissions: string[];
  patron: DeskPatron | null;
  items: DeskItem[];
  onPatronChange: (patron: DeskPatron | null) => void;
  onItemsChange: (items: DeskItem[]) => void;
};

type CheckoutResponse = {
  items?: Array<{ item_id: number; outcome: string }>;
};

function readMuted(): boolean {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function patronStatusInput(patron: DeskPatron) {
  return {
    expired: Number(patron.expired) || 0,
    restricted: Number(patron.restricted) || 0,
    patron_card_lost: Number(patron.patron_card_lost) || 0,
  };
}

function patronBalance(patron: DeskPatron): number | null {
  if (patron.balance === null || patron.balance === undefined) {
    return null;
  }
  const value =
    typeof patron.balance === "string"
      ? Number(patron.balance)
      : patron.balance;
  return Number.isFinite(value) ? value : null;
}

function itemBarcode(item: DeskItem): string | null {
  const code = item.external_id;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

export function CheckoutPanel({
  permissions,
  patron,
  items,
  onPatronChange,
  onItemsChange,
}: CheckoutPanelProps) {
  const canCheckout = permissions.includes("circulation.checkout");
  const cardRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const pendingBarcodes = useRef<string[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [patronQuery, setPatronQuery] = useState("");
  const [patronHits, setPatronHits] = useState<PatronDirectoryItem[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    if (patron) {
      itemRef.current?.focus();
    } else {
      cardRef.current?.focus();
    }
  }, [patron]);

  const lookupCard = useCallback(
    async (cardnumber: string) => {
      setScanError(null);
      try {
        const found = await fetchApi<DeskPatron>(
          `/circulation/patrons/by-card?${new URLSearchParams({ cardnumber }).toString()}`,
        );
        onPatronChange(found);
        setPatronHits([]);
      } catch (error) {
        setScanError(apiErrorMessage(error));
      }
    },
    [onPatronChange],
  );

  const lookupItem = useCallback(
    async (barcode: string) => {
      if (!patron) {
        setScanError("Scan a patron card first.");
        return;
      }
      const current = itemsRef.current;
      const dup =
        current.some((row) => itemBarcode(row) === barcode) ||
        pendingBarcodes.current.includes(barcode);
      if (dup) {
        setScanError("That barcode is already in the list.");
        return;
      }
      const queueKeys = [
        ...current.map((row) => itemBarcode(row) ?? String(row.item_id ?? "")),
        ...pendingBarcodes.current,
      ];
      const queued = pushQueue(queueKeys, barcode);
      if (queued.error) {
        setScanError(queued.error);
        return;
      }
      pendingBarcodes.current = [...pendingBarcodes.current, barcode];
      setScanError(null);
      try {
        const found = await fetchApi<DeskItem>(
          `/circulation/items/by-barcode?${new URLSearchParams({ barcode }).toString()}`,
        );
        const latest = itemsRef.current;
        const next = [...latest, found];
        itemsRef.current = next;
        onItemsChange(next);
      } catch (error) {
        setScanError(apiErrorMessage(error));
      } finally {
        pendingBarcodes.current = pendingBarcodes.current.filter(
          (value) => value !== barcode,
        );
      }
    },
    [onItemsChange, patron],
  );

  const handleCardKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    void lookupCard(submitted.value);
    event.currentTarget.focus();
  };

  const handleItemKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    void lookupItem(submitted.value).finally(() => itemRef.current?.focus());
  };

  const searchPatrons = useCallback(async () => {
    const q = patronQuery.trim();
    if (!q) {
      return;
    }
    setSearchBusy(true);
    setScanError(null);
    try {
      const response = await fetchApi<PatronSearchResponse>(
        `/patrons?${new URLSearchParams({
          q,
          page: "1",
          per_page: "10",
          sort: "relevance",
          direction: "desc",
        }).toString()}`,
      );
      setPatronHits(response.items);
    } catch (error) {
      setScanError(apiErrorMessage(error));
      setPatronHits([]);
    } finally {
      setSearchBusy(false);
    }
  }, [patronQuery]);

  const pickPatronHit = useCallback(
    async (hit: PatronDirectoryItem) => {
      setSearchBusy(true);
      setScanError(null);
      try {
        const detail = await fetchApi<DeskPatron>(
          `/circulation/patrons/${hit.patron_id}`,
        );
        onPatronChange(detail);
        setPatronHits([]);
        setPatronQuery("");
      } catch (error) {
        setScanError(apiErrorMessage(error));
      } finally {
        setSearchBusy(false);
      }
    },
    [onPatronChange],
  );

  const warningLines = useCallback((): string[] => {
    if (!patron) {
      return [];
    }
    const lines: string[] = [];
    const badges = statusBadges(patronStatusInput(patron));
    for (const badge of badges) {
      if (badge === "Expired" || badge === "Restricted" || badge === "Card lost") {
        lines.push(badge);
      }
    }
    const balance = patronBalance(patron);
    if (balance !== null && balance > 0) {
      lines.push(`Balance ${formatPeso(balance)}`);
    }
    for (const item of items) {
      if (item.status && item.status !== "available") {
        lines.push(
          `${item.title ?? "Item"}: ${item.status_label ?? item.status}`,
        );
      }
    }
    return lines;
  }, [items, patron]);

  const runCheckout = useCallback(async () => {
    if (!canCheckout || !patron?.patron_id || items.length === 0 || submitting) {
      return;
    }
    const itemIds = items
      .map((row) => row.item_id)
      .filter((id): id is number => typeof id === "number" && id > 0);
    if (itemIds.length === 0) {
      return;
    }
    setSubmitting(true);
    setScanError(null);
    try {
      const body = await fetchApi<CheckoutResponse>("/circulation/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          patron_id: patron.patron_id,
          item_ids: itemIds,
        }),
      });
      toastCirculationResult({
        ...body,
        circulation_action: "checkout",
        items: (body.items ?? []).map((line) => ({
          ...line,
          title: items.find((row) => row.item_id === line.item_id)?.title,
        })),
      });
      playTone(body, readMuted());
      const outcomes = body.items ?? [];
      const outcomeByItem = new Map(
        outcomes.map((line) => [line.item_id, line.outcome] as const),
      );
      onItemsChange(
        items.filter((row) => {
          if (row.item_id == null) {
            return false;
          }
          const outcome = outcomeByItem.get(row.item_id);
          if (outcome === "unsent") {
            return true;
          }
          if (outcome === "confirmed" || outcome === "refused" || outcome === "unknown") {
            return false;
          }
          return true;
        }),
      );
      itemRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiError) {
        setScanError(apiErrorMessage(error));
      } else {
        setScanError(apiErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [canCheckout, items, onItemsChange, patron, submitting]);

  const startConfirm = () => {
    if (!patron || items.length === 0 || submitting) {
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Patron card scan</span>
          <Input
            ref={cardRef}
            autoComplete="off"
            placeholder="Scan card"
            onKeyDown={handleCardKeyDown}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Item barcode scan</span>
          <Input
            ref={itemRef}
            autoComplete="off"
            placeholder="Scan barcode"
            disabled={!patron}
            onKeyDown={handleItemKeyDown}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Patron search</p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={patronQuery}
            onChange={(event) => setPatronQuery(event.target.value)}
            placeholder="Name or card"
            className="max-w-md"
          />
          <Button
            type="button"
            variant="outline"
            disabled={searchBusy}
            onClick={() => void searchPatrons()}
          >
            Search
          </Button>
        </div>
        {patronHits.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {patronHits.map((hit) => (
              <li key={hit.patron_id}>
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => void pickPatronHit(hit)}
                >
                  {displayName(hit)} · {hit.cardnumber ?? "No card"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {patron ? (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
          <p className="font-medium text-foreground">
            {displayName({ ...patron, patron_id: patron.patron_id ?? 0 })}
          </p>
          <p className="text-muted-foreground">
            {patron.cardnumber ?? "—"} · Expires{" "}
            {formatPatronDate(patron.expiry_date)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {statusBadges(patronStatusInput(patron)).join(", ")}
            {patronBalance(patron) !== null
              ? ` · Balance ${formatPeso(patronBalance(patron)!)}`
              : ""}
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {items.map((item, index) => (
            <li
              key={`${item.item_id ?? "x"}-${index}`}
              className="flex items-start justify-between gap-2 px-3 py-2"
            >
              <div>
                <p className="font-medium text-foreground">{item.title ?? "Item"}</p>
                <p className="text-muted-foreground">
                  {item.author ?? "—"} · {item.call_number ?? "—"} ·{" "}
                  {item.status_label ?? item.status ?? "—"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onItemsChange(items.filter((_, rowIndex) => rowIndex !== index))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {scanError ? (
        <p className="text-sm text-destructive" role="alert">
          {scanError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canCheckout || !patron || items.length === 0 || submitting}
          onClick={startConfirm}
        >
          Confirm checkout
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={items.length === 0}
          onClick={() => onItemsChange([])}
        >
          Clear
        </Button>
        <span className="text-sm text-muted-foreground">{items.length} / 20 items</span>
        {!canCheckout ? (
          <span className="text-sm text-muted-foreground">
            You do not have permission for this action.
          </span>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm checkout</DialogTitle>
            <DialogDescription>
              Koha still decides whether these items circulate.
            </DialogDescription>
          </DialogHeader>
          {patron ? (
            <p className="text-sm text-foreground">
              {displayName({ ...patron, patron_id: patron.patron_id ?? 0 })}
              {" · "}
              {patron.cardnumber ?? "No card"}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm text-foreground">
            {items.map((item, index) => (
              <li key={`${item.item_id ?? "item"}-${index}`}>{item.title ?? "Item"}</li>
            ))}
          </ul>
          {warningLines().length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {warningLines().map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void runCheckout()}>
              Confirm checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}