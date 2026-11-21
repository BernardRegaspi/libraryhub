import assert from "node:assert/strict";
import test from "node:test";

import { actionsFor } from "./actions.ts";

test("actionsFor returns exception pairs and null for verified or duplicate", () => {
  assert.deepEqual(actionsFor("not_found"), [
    "Search the shelf again",
    "Leave the Koha status unchanged",
  ]);
  const damaged = actionsFor("damaged");
  assert.ok(damaged);
  assert.equal(damaged.includes("Leave it on the shelf"), true);
  assert.equal(actionsFor("verified"), null);
  assert.equal(actionsFor("duplicate"), null);
});