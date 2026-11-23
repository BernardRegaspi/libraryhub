import assert from "node:assert/strict";
import test from "node:test";

import { acceptInventoryScan, submitInventoryScan } from "./scan.ts";

test("empty inventory scan does nothing", () => {
  assert.deepEqual(submitInventoryScan("  "), { ok: false, message: "" });
});

test("control character is invalid", () => {
  const result = submitInventoryScan("A\u0001");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.message, "That scan is not valid.");
});

test("enter value is trimmed", () => {
  assert.deepEqual(submitInventoryScan("  ABC  "), { ok: true, value: "ABC" });
});

test("same value is ignored while in flight", () => {
  assert.deepEqual(acceptInventoryScan("ABC", "ABC"), { ok: false, message: "" });
  assert.deepEqual(acceptInventoryScan("ABC", null), { ok: true, value: "ABC" });
});