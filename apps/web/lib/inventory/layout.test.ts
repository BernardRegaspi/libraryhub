import assert from "node:assert/strict";
import test from "node:test";

import {
  inventoryKpis,
  progressText,
  savedScanCount,
  stepMarks,
} from "./layout.ts";
import type { InventorySessionCounters } from "./types.ts";

const counters: InventorySessionCounters = {
  expected_count: 12,
  seen: 3,
  verified: 1,
  misplaced: 1,
  unexpected: 0,
  not_found: 1,
  withdrawn: 1,
  damaged: 1,
  other_exception: 0,
  needs_a_look: 4,
  duplicates: 1,
  remaining: 9,
};

test("savedScanCount counts every saved scan row", () => {
  assert.equal(savedScanCount(counters), 6);
});

test("progressText uses the spec sentence and a singular scan", () => {
  assert.equal(
    progressText(3, 12, 6),
    "3 of 12 expected items seen · 6 scans",
  );
  assert.equal(progressText(0, 0, 1), "0 of 0 expected items seen · 1 scan");
});

test("stepMarks follows draft, scanning, review, and cancelled", () => {
  assert.deepEqual(stepMarks("draft"), ["current", "later", "later", "later"]);
  assert.deepEqual(stepMarks("in_progress"), [
    "complete",
    "current",
    "later",
    "later",
  ]);
  assert.deepEqual(stepMarks("in_review"), [
    "complete",
    "complete",
    "current",
    "later",
  ]);
  assert.deepEqual(stepMarks("cancelled"), ["later", "later", "later", "later"]);
});

test("inventoryKpis keeps the seven labels, hints, tones, and values", () => {
  assert.deepEqual(
    inventoryKpis(counters, 12).map((card) => ({
      key: card.key,
      label: card.label,
      hint: card.hint,
      tone: card.tone,
      value: card.value,
    })),
    [
      { key: "expected", label: "Expected", hint: "in this session", tone: "maroon", value: 12 },
      { key: "verified", label: "Verified", hint: "matched the shelf", tone: "gold", value: 1 },
      { key: "not_found", label: "Not found", hint: "no Koha record", tone: "red", value: 1 },
      { key: "misplaced", label: "Misplaced", hint: "wrong shelf", tone: "blue", value: 1 },
      { key: "unexpected", label: "Unexpected", hint: "outside this scope", tone: "maroon", value: 0 },
      { key: "damaged", label: "Damaged", hint: "needs repair", tone: "red", value: 1 },
      { key: "withdrawn", label: "Withdrawn", hint: "found on the shelf", tone: "gold", value: 1 },
    ],
  );
});