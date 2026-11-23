import assert from "node:assert/strict";
import test from "node:test";

import { pushQueue, submitScanValue } from "./scan.ts";

test("empty scan does nothing and control chars are invalid", () => {
  assert.deepEqual(submitScanValue(""), { ok: false, message: "" });
  assert.equal(submitScanValue("a\u0001")?.ok, false);
});

test("queue stops at twenty", () => {
  const start = Array.from({ length: 20 }, (_, i) => `B${i}`);
  const next = pushQueue(start, "B20");
  assert.equal(next.error, "The scan queue is full.");
});