import assert from "node:assert/strict";
import test from "node:test";

import { parsePatronSearch, serializePatronSearch } from "./search-params.ts";

test("patron params round trip and drop invalid filters", () => {
  const parsed = parsePatronSearch(
    new URLSearchParams(
      "q=Ada&category_id=ST&library_id=CPL&status=expired&page=2&sort=cardnumber&direction=desc",
    ),
  );
  assert.equal(parsed.q, "Ada");
  assert.equal(parsed.categoryId, "ST");
  assert.equal(parsed.libraryId, "CPL");
  assert.equal(parsed.status, "expired");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.sort, "cardnumber");
  assert.equal(parsed.direction, "desc");
  const again = parsePatronSearch(new URLSearchParams(serializePatronSearch(parsed)));
  assert.deepEqual(again, parsed);
  assert.equal(
    parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).status,
    "",
  );
  assert.equal(
    parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).page,
    1,
  );
  assert.equal(
    parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).sort,
    "surname",
  );
});