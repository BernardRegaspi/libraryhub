const CONTROL = /[\x00-\x1f\x7f]/;
const MAX_SCAN = 64;
const INVALID_MESSAGE = "That scan is not valid.";

export type InventoryScanResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function submitInventoryScan(value: string): InventoryScanResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: "" };
  }
  if (trimmed.length > MAX_SCAN || CONTROL.test(trimmed)) {
    return { ok: false, message: INVALID_MESSAGE };
  }
  return { ok: true, value: trimmed };
}

export function acceptInventoryScan(
  value: string,
  inflight: string | null,
): InventoryScanResult {
  const result = submitInventoryScan(value);
  if (!result.ok) {
    return result;
  }
  if (inflight === result.value) {
    return { ok: false, message: "" };
  }
  return result;
}