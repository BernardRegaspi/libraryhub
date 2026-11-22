import type {
  InventorySessionCounters,
  InventorySessionStatus,
} from "./types.ts";

export type StepMark = "complete" | "current" | "later";

export type InventoryKpiKey =
  | "expected"
  | "verified"
  | "not_found"
  | "misplaced"
  | "unexpected"
  | "damaged"
  | "withdrawn";

export type InventoryKpiTone = "maroon" | "gold" | "blue" | "red";

export type InventoryKpi = {
  key: InventoryKpiKey;
  label: string;
  hint: string;
  tone: InventoryKpiTone;
  value: number;
};

export function savedScanCount(counters: InventorySessionCounters): number {
  return (
    counters.verified +
    counters.misplaced +
    counters.unexpected +
    counters.not_found +
    counters.withdrawn +
    counters.damaged +
    counters.other_exception +
    counters.duplicates
  );
}

export function progressText(
  seen: number,
  expectedCount: number,
  scanCount: number,
): string {
  const scans = scanCount === 1 ? "1 scan" : `${scanCount} scans`;
  return `${seen} of ${expectedCount} expected items seen · ${scans}`;
}

export function stepMarks(
  status: InventorySessionStatus,
): [StepMark, StepMark, StepMark, StepMark] {
  if (status === "draft") {
    return ["current", "later", "later", "later"];
  }
  if (status === "in_progress") {
    return ["complete", "current", "later", "later"];
  }
  if (status === "in_review") {
    return ["complete", "complete", "current", "later"];
  }
  return ["later", "later", "later", "later"];
}

export function inventoryKpis(
  counters: InventorySessionCounters,
  expectedCount: number,
): InventoryKpi[] {
  return [
    { key: "expected", label: "Expected", hint: "in this session", tone: "maroon", value: expectedCount },
    { key: "verified", label: "Verified", hint: "matched the shelf", tone: "gold", value: counters.verified },
    { key: "not_found", label: "Not found", hint: "no Koha record", tone: "red", value: counters.not_found },
    { key: "misplaced", label: "Misplaced", hint: "wrong shelf", tone: "blue", value: counters.misplaced },
    { key: "unexpected", label: "Unexpected", hint: "outside this scope", tone: "maroon", value: counters.unexpected },
    { key: "damaged", label: "Damaged", hint: "needs repair", tone: "red", value: counters.damaged },
    { key: "withdrawn", label: "Withdrawn", hint: "found on the shelf", tone: "gold", value: counters.withdrawn },
  ];
}