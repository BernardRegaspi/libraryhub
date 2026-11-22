import { progressText } from "@/lib/inventory/layout";

export function SessionProgress({
  seen,
  expectedCount,
  scanCount,
}: {
  seen: number;
  expectedCount: number;
  scanCount: number;
}) {
  const widthPercent =
    expectedCount === 0
      ? 0
      : Math.min(100, (seen / expectedCount) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Scan progress</p>
      <p className="text-sm text-muted-foreground">
        {progressText(seen, expectedCount, scanCount)}
      </p>
      <div
        className="h-2 w-full min-w-0 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={seen}
        aria-valuemin={0}
        aria-valuemax={expectedCount}
      >
        <div
          className="h-full rounded-full bg-maroon-700 transition-[width]"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
}