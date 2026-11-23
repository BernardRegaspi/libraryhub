import { ApiError } from "@/lib/api";

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.detail?.message;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

export function circulationConfirmation(error: ApiError): boolean {
  return error.detail?.code === "circulation_confirmation";
}