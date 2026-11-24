"use client";

import { useEffect, useRef, type RefObject } from "react";

const SCAN_GAP_MS = 80;
const MIN_SCAN_LEN = 3;
const FLUSH_AFTER_MS = SCAN_GAP_MS + 30;

function isTypingSurface(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

type UseInventoryBarcodeWedgeOptions = {
  enabled: boolean;
  /** When focus is here, the input handles keystrokes — the wedge buffer stays idle. */
  scanInputRef?: RefObject<HTMLInputElement | null>;
  onScan: (barcode: string) => void;
};

export function useInventoryBarcodeWedge({
  enabled,
  scanInputRef,
  onScan,
}: UseInventoryBarcodeWedgeOptions): void {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let buffer = "";
    let lastKeyAt = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFlush = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const flush = () => {
      clearFlush();
      const value = buffer.trim();
      buffer = "";
      if (value.length >= MIN_SCAN_LEN) {
        onScanRef.current(value);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (isTypingSurface(target)) {
        if (scanInputRef?.current && target === scanInputRef.current) {
          return;
        }
        buffer = "";
        clearFlush();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        if (buffer.length >= MIN_SCAN_LEN) {
          event.preventDefault();
          flush();
        }
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const now = Date.now();
      if (buffer.length > 0 && now - lastKeyAt > SCAN_GAP_MS) {
        buffer = "";
      }
      lastKeyAt = now;
      buffer += event.key;

      clearFlush();
      flushTimer = setTimeout(flush, FLUSH_AFTER_MS);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearFlush();
      buffer = "";
    };
  }, [enabled, scanInputRef]);
}