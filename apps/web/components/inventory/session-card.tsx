import { Button } from "@/components/ui/button";
import { SessionProgress } from "@/components/inventory/session-progress";
import { SessionStepper } from "@/components/inventory/session-stepper";
import { savedScanCount } from "@/lib/inventory/layout";
import type { InventorySession } from "@/lib/inventory/types";

function sessionStatusLabel(
  status: InventorySession["status"],
): string {
  if (status === "draft") {
    return "Draft";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  if (status === "in_review") {
    return "In review";
  }
  return "Cancelled";
}

export type SessionCardProps = {
  session: InventorySession;
  actionPending: boolean;
  actionError: string | null;
  exportPending: boolean;
  exportError: string | null;
  onStart: () => void;
  onFinish: () => void;
  onResume: () => void;
  onCancel: () => void;
  onExport: () => void;
};

export function SessionCard({
  session,
  actionPending,
  actionError,
  exportPending,
  exportError,
  onStart,
  onFinish,
  onResume,
  onCancel,
  onExport,
}: SessionCardProps) {
  const { status } = session;
  const exportEnabled = status === "in_review" || status === "cancelled";
  const libraryLabel =
    session.home_library_name ?? session.home_library_id;
  const locationLabel = session.location ?? "Whole library.";

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {session.reference}
            <span className="text-muted-foreground"> · </span>
            {session.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {libraryLabel}
            <span aria-hidden="true"> · </span>
            {locationLabel}
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
          {sessionStatusLabel(status)}
        </span>
      </div>

      {status === "cancelled" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-sm font-medium text-foreground">Cancelled</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:ml-auto"
            disabled={exportPending}
            onClick={onExport}
          >
            Export exceptions
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {status === "draft" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={actionPending}
              onClick={onStart}
            >
              Start scanning
            </Button>
          ) : null}
          {status === "in_progress" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={actionPending}
              onClick={onFinish}
            >
              Finish scanning
            </Button>
          ) : null}
          {status === "in_review" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={actionPending}
              onClick={onResume}
            >
              Back to scanning
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={actionPending}
            onClick={onCancel}
          >
            Cancel session
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!exportEnabled || exportPending}
            onClick={onExport}
          >
            Export exceptions
          </Button>
        </div>
      )}

      <SessionStepper status={status} />
      <SessionProgress
        seen={session.counters.seen}
        expectedCount={session.expected_count}
        scanCount={savedScanCount(session.counters)}
      />

      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}
      {exportError ? (
        <p className="text-sm text-destructive">{exportError}</p>
      ) : null}
    </section>
  );
}