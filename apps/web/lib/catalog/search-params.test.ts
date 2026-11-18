import assert from "node:assert/strict";
import test from "node:test";

import { parseCatalogSearch, serializeCatalogSearch } from "./search-params.ts";

test("defaults and round trip", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("q=Ada&field=title&view=list&page=2&per_page=40"));
  assert.equal(parsed.q, "Ada");
  assert.equal(parsed.field, "title");
  assert.equal(parsed.view, "list");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.perPage, 40);
  assert.equal(parsed.sort, "title");
  const again = parseCatalogSearch(new URLSearchParams(serializeCatalogSearch(parsed)));
  assert.deepEqual(again, parsed);
});

test("invalid view and page fall back", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("view=summary&page=0&per_page=15"));
  assert.equal(parsed.view, "cover");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.perPage, 20);
});

test("browse params round trip and drop an empty letter", () => {
  const parsed = parseCatalogSearch(
    new URLSearchParams(
      "letter=m&author=Ada&publisher=Murray&availability=available&library=CPL",
    ),
  );
  assert.equal(parsed.q, "");
  assert.equal(parsed.letter, "M");
  assert.equal(parsed.author, "Ada");
  assert.equal(parsed.publisher, "Murray");
  assert.equal(parsed.availability, "available");
  assert.equal(parsed.library, "CPL");
  const again = parseCatalogSearch(new URLSearchParams(serializeCatalogSearch(parsed)));
  assert.deepEqual(again, parsed);
  assert.equal(parseCatalogSearch(new URLSearchParams("letter=9")).letter, null);
  assert.equal(parseCatalogSearch(new URLSearchParams("availability=maybe")).availability, "");
});

test("year sort on this page becomes title ascending", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("sort=copyright_date&direction=desc"));
  assert.equal(parsed.sort, "title");
  assert.equal(parsed.direction, "asc");
});