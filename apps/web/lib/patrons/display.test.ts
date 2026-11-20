import assert from "node:assert/strict";
import test from "node:test";

import { displayName, initials, isOverdueDate, statusBadges } from "./display.ts";

test("display name, initials, badges, and manila overdue", () => {
  assert.equal(
    displayName({
      preferred_name: "Ace",
      firstname: "Ada",
      surname: "Cruz",
      cardnumber: "1",
      patron_id: 4,
    }),
    "Ace",
  );
  assert.equal(
    displayName({
      preferred_name: " ",
      firstname: "Ada",
      surname: "Cruz",
      cardnumber: "1",
      patron_id: 4,
    }),
    "Ada Cruz",
  );
  assert.equal(
    displayName({
      preferred_name: "",
      firstname: "",
      surname: "",
      cardnumber: "1004",
      patron_id: 4,
    }),
    "1004",
  );
  assert.equal(
    displayName({
      preferred_name: "",
      firstname: "",
      surname: "",
      cardnumber: "",
      patron_id: 4,
    }),
    "Patron 4",
  );
  assert.equal(initials("Ada Cruz"), "AC");
  assert.equal(initials("Ada"), "AD");
  assert.deepEqual(statusBadges({ expired: 1, restricted: 1, patron_card_lost: 1 }), [
    "Expired",
    "Restricted",
    "Card lost",
  ]);
  assert.deepEqual(statusBadges({ expired: 0, restricted: 0, patron_card_lost: 0 }), [
    "Active",
  ]);
  assert.equal(
    isOverdueDate("2026-11-19", null, new Date("2026-11-20T00:30:00+08:00")),
    true,
  );
  assert.equal(
    isOverdueDate("2026-11-20", null, new Date("2026-11-20T00:30:00+08:00")),
    false,
  );
});