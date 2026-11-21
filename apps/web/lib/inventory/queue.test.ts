import assert from "node:assert/strict";
import test from "node:test";

import { createScanQueue } from "./queue.ts";

test("a waiting barcode is ignored and a finished one can scan again", () => {
  const queue = createScanQueue();
  const first = queue.enqueue("BC-1");
  assert.equal(first.accepted, true);
  assert.equal(queue.enqueue("BC-1").accepted, false);
  queue.markDone(first.clientScanId!);
  const again = queue.enqueue("BC-1");
  assert.equal(again.accepted, true);
  assert.notEqual(again.clientScanId, first.clientScanId);
});

test("responses stay on their own id and a reload can save a failure", () => {
  const queue = createScanQueue();
  const slow = queue.enqueue("BC-1");
  const next = queue.enqueue("BC-2");
  queue.markDone(next.clientScanId!);
  assert.equal(queue.snapshot().latestFinishedId, next.clientScanId);
  queue.markFailed(slow.clientScanId!);
  assert.equal(queue.snapshot().failed[0]?.barcode, "BC-1");
  queue.reconcile([slow.clientScanId!]);
  assert.equal(queue.snapshot().failed.length, 0);
  assert.equal(queue.snapshot().latestFinishedId, slow.clientScanId);
});