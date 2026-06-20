import {
  BACKGROUND_SYNC_TAG,
  flushPendingReports,
  isApiReachable,
  isNetworkFailure,
} from "./offlineSyncCore";
import {
  countPendingReports,
  enqueuePendingReport,
  type PendingReport,
} from "./offlineQueue";
import type { ReportCreateInput } from "../types/report";

export {
  BACKGROUND_SYNC_TAG,
  flushPendingReports,
  isApiReachable,
  isNetworkFailure,
  enqueuePendingReport,
};
export type { PendingReport };

export interface OfflineSyncState {
  pendingCount: number;
  syncing: boolean;
  lastSyncedAt: string | null;
}

type SyncListener = (state: OfflineSyncState) => void;

const listeners = new Set<SyncListener>();

let syncing = false;
let lastSyncedAt: string | null = null;
let initialized = false;

async function readPendingCount(): Promise<number> {
  try {
    return await countPendingReports();
  } catch {
    return 0;
  }
}

async function emitState() {
  const state: OfflineSyncState = {
    pendingCount: await readPendingCount(),
    syncing,
    lastSyncedAt,
  };
  listeners.forEach((listener) => listener(state));
}

export function subscribeOfflineSync(listener: SyncListener): () => void {
  listeners.add(listener);
  void emitState();
  return () => listeners.delete(listener);
}

export async function requestBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("sync" in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(BACKGROUND_SYNC_TAG);
    }
  } catch {
    // Background Sync is optional (mainly Chromium/Android).
  }
}

export async function queueReportForSync(
  payload: ReportCreateInput,
  photos: File[],
): Promise<string> {
  const id = await enqueuePendingReport(payload, photos);
  await requestBackgroundSync();
  await emitState();
  return id;
}

export async function runOfflineSync(): Promise<void> {
  if (syncing) return;

  syncing = true;
  await emitState();

  try {
    const result = await flushPendingReports();
    if (result.synced > 0) {
      lastSyncedAt = new Date().toISOString();
    }
  } finally {
    syncing = false;
    await emitState();
  }
}

export function initOfflineSync(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const triggerSync = () => {
    void runOfflineSync();
  };

  window.addEventListener("online", triggerSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      triggerSync();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "OFFLINE_SYNC_COMPLETE") {
        void emitState();
      }
    });
  }

  void runOfflineSync();
}
