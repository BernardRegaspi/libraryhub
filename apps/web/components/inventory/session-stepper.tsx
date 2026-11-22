import { stepMarks, type StepMark } from "@/lib/inventory/layout";
import type { InventorySessionStatus } from "@/lib/inventory/types";

const LABELS = ["Plan", "Scan", "Review", "Submit"] as const;

function circleClass(mark: StepMark): string {
  if (mark === "complete") {
    return "bg-maroon-700 text-white";
  }
  if (mark === "current") {
    return "bg-gold-400 text-maroon-950";
  }
  return "bg-muted text-muted-foreground";
}

export function SessionStepper({ status }: { status: InventorySessionStatus }) {
  const marks = stepMarks(status);
  return (
    <ol className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
      {LABELS.map((label, index) => {
        const mark = marks[index];
        return (
          <li key={label} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${circleClass(mark)}`}
            >
              {mark === "complete" ? "✓" : index + 1}
            </span>
            <span
              className={
                mark === "current"
                  ? "font-bold text-foreground"
                  : "text-muted-foreground"
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}