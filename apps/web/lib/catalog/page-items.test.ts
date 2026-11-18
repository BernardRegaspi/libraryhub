import assert from "node:assert/strict";
import test from "node:test";
import { pageItems } from "./page-items.ts";

test("short lists show every page", () => {
  assert.deepEqual(pageItems(2, 4), [1, 2, 3, 4]);
});

test("long lists collapse the middle and the edges", () => {
  assert.deepEqual(pageItems(2, 10), [1, 2, 3, 4, "ellipsis", 10]);
  assert.deepEqual(pageItems(5, 10), [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  assert.deepEqual(pageItems(9, 10), [1, "ellipsis", 7, 8, 9, 10]);
});