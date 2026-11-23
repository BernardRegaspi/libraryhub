const CONTROL = /[\x00-\x1f\x7f]/;
const MAX_SCAN = 64;
const INVALID_MESSAGE = "That scan is not valid.";
const QUEUE_FULL_MESSAGE = "The scan queue is full.";

export type ScanSubmitResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function submitScanValue(value: string): ScanSubmitResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: "" };
  }
  if (trimmed.length > MAX_SCAN || CONTROL.test(trimmed)) {
    return { ok: false, message: INVALID_MESSAGE };
  }
  return { ok: true, value: trimmed };
}

export function pushQueue(
  queue: string[],
  value: string,
  limit = 20,
): { queue: string[]; error?: string } {
  if (queue.length >= limit) {
    return { queue, error: QUEUE_FULL_MESSAGE };
  }
  return { queue: [...queue, value] };
}