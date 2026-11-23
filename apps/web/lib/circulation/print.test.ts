import assert from "node:assert/strict";
import test from "node:test";

import { buildPrintPayload } from "./print.ts";

test("print includes confirmed lines only", () => {
  const text = buildPrintPayload({
    type: "checkout",
    patronName: "Ada Cruz",
    cardnumber: "C1",
    confirmedAt: "2026-11-20T10:00:00",
    lines: [
      { outcome: "confirmed", title: "Book", dueDate: "2026-12-01", checkoutId: 9 },
      { outcome: "refused", title: "Other" },
    ],
  });
  assert.match(text, /Book/);
  assert.doesNotMatch(text, /Other/);
});