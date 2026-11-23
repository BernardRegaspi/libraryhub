import assert from "node:assert/strict";
import test from "node:test";

import { parseCirculationTab } from "./search-params.ts";

test("tab defaults to checkout and rejects unknown values", () => {
  assert.equal(parseCirculationTab(new URLSearchParams("tab=renew")), "renew");
  assert.equal(parseCirculationTab(new URLSearchParams("tab=nope")), "checkout");
});