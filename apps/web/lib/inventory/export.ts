import { getApiBaseUrl } from "@/lib/api";

import type { ExportFormat, ExportKind, ItemCondition } from "./types";

function normalizePath(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed.startsWith("/api/v1") ? trimmed : `/api/v1${trimmed}`;
}

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie.match(/(?:^|; )libraryhub_csrf=([^;]*)/);
  if (!match) {
    return undefined;
  }
  return decodeURIComponent(match[1]);
}

export async function downloadSessionExport(
  sessionId: string,
  options: {
    kind: ExportKind;
    format: ExportFormat;
    condition?: ItemCondition;
    q?: string;
    location?: string;
  },
): Promise<void> {
  const params = new URLSearchParams({
    kind: options.kind,
    format: options.format,
  });
  if (options.condition) {
    params.set("condition", options.condition);
  }
  if (options.q) {
    params.set("q", options.q);
  }
  if (options.location) {
    params.set("location", options.location);
  }
  const path = normalizePath(`/inventory/sessions/${sessionId}/exports?${params}`);
  const url = `${getApiBaseUrl()}${path}`;
  const headers = new Headers({ Accept: "*/*" });
  const csrf = readCsrfCookie();
  if (csrf) {
    headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(url, { credentials: "include", headers });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `inventory-${sessionId}.${options.format}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}