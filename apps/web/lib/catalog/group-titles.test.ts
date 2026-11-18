import assert from "node:assert/strict";
import test from "node:test";
import { titleGroups } from "./group-titles.ts";

test("title sort groups consecutive letters and leaves digits unlabeled", () => {
  const groups = titleGroups(
    [
      { title: "1984" },
      { title: "Amadeus" },
      { title: "Annotated Alice" },
      { title: "The Hobbit" },
    ],
    "title",
  );
  assert.deepEqual(
    groups.map((group) => group.letter),
    [null, "A", "T"],
  );
});

test("author sort is one unlabeled group", () => {
  const hits = [{ title: "Zebra" }, { title: "Amadeus" }];
  assert.deepEqual(titleGroups(hits, "author"), [{ letter: null, hits }]);
});