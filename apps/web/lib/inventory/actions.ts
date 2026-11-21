import type { InventoryScanOutcome } from "./types.ts";

const PAIRS: Partial<Record<InventoryScanOutcome, [string, string]>> = {
  not_found: ["Search the shelf again", "Leave the Koha status unchanged"],
  misplaced: ["Reshelve to the session location", "Leave it where it was found"],
  unexpected: ["Check the Koha item record", "Reshelve to its home library"],
  damaged: ["Set the book aside for repair", "Leave it on the shelf"],
  withdrawn: ["Remove it from the shelf", "Leave it on the shelf"],
  other_exception: ["Set the book aside for a librarian", "Leave it on the shelf"],
};

export function actionsFor(
  outcome: InventoryScanOutcome,
): [string, string] | null {
  const pair = PAIRS[outcome];
  if (!pair) {
    return null;
  }
  return pair;
}