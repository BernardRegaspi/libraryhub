const CSRF_COOKIE = "libraryhub_csrf";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export type ApiErrorDetail = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail | undefined;

  constructor(status: number, detail: ApiErrorDetail | undefined) {
    super(detail?.message ?? `API request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
}

function normalizePath(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed.startsWith("/api/v1") ? trimmed : `/api/v1${trimmed}`;
}

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`),
  );
  if (!match) {
    return undefined;
  }
  return decodeURIComponent(match[1]);
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const method = (init?.method ?? "GET").toUpperCase();
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  return headers;
}

async function parseErrorDetail(
  response: Response,
): Promise<ApiErrorDetail | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (body.detail !== undefined && typeof body.detail === "object") {
      return body.detail as ApiErrorDetail;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${getApiBaseUrl()}${normalizePath(path)}`;
  const headers = buildHeaders(init);
  const isBrowser = typeof window !== "undefined";

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: isBrowser ? "include" : init?.credentials,
    });
  } catch (error) {
    throw error;
  }

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return undefined as T;
}