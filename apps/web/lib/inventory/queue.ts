import { randomUUID } from "node:crypto";

type QueueItem = {
  clientScanId: string;
  barcode: string;
};

export type ScanQueue = {
  enqueue(barcode: string): { accepted: boolean; clientScanId: string | null };
  markDone(clientScanId: string): void;
  markFailed(clientScanId: string): void;
  reconcile(savedIds: string[]): void;
  snapshot(): {
    pending: number;
    failed: { clientScanId: string; barcode: string }[];
    latestFinishedId: string | null;
  };
};

export function createScanQueue(): ScanQueue {
  const pendingById = new Map<string, QueueItem>();
  const pendingBarcodeToId = new Map<string, string>();
  const failed: QueueItem[] = [];
  const failedById = new Map<string, QueueItem>();
  let latestFinishedId: string | null = null;

  const markDone = (clientScanId: string): void => {
    const pending = pendingById.get(clientScanId);
    const failedItem = failedById.get(clientScanId);
    if (!pending && !failedItem) {
      return;
    }
    if (pending) {
      pendingById.delete(clientScanId);
      pendingBarcodeToId.delete(pending.barcode);
    }
    if (failedItem) {
      failedById.delete(clientScanId);
      const index = failed.findIndex((item) => item.clientScanId === clientScanId);
      if (index >= 0) {
        failed.splice(index, 1);
      }
    }
    latestFinishedId = clientScanId;
  };

  return {
    enqueue(barcode: string) {
      const trimmed = barcode.trim();
      if (trimmed === "") {
        return { accepted: false, clientScanId: null };
      }
      if (pendingBarcodeToId.has(trimmed)) {
        return { accepted: false, clientScanId: null };
      }
      const clientScanId = randomUUID();
      const item: QueueItem = { clientScanId, barcode: trimmed };
      pendingById.set(clientScanId, item);
      pendingBarcodeToId.set(trimmed, clientScanId);
      return { accepted: true, clientScanId };
    },

    markDone,

    markFailed(clientScanId: string) {
      const item = pendingById.get(clientScanId);
      if (!item) {
        return;
      }
      pendingById.delete(clientScanId);
      pendingBarcodeToId.delete(item.barcode);
      failed.push(item);
      failedById.set(clientScanId, item);
    },

    reconcile(savedIds: string[]) {
      for (const id of savedIds) {
        if (pendingById.has(id) || failedById.has(id)) {
          markDone(id);
        }
      }
    },

    snapshot() {
      return {
        pending: pendingById.size,
        failed: failed.map(({ clientScanId, barcode }) => ({
          clientScanId,
          barcode,
        })),
        latestFinishedId,
      };
    },
  };
}