import { createReport } from "../api/client";
import { API_BASE_URL } from "./constants";
import { uploadReportPhotos } from "./photos";
import {
  listPendingReports,
  removePendingReport,
  storedPhotosToFiles,
  updatePendingReport,
  type PendingReport,
} from "./offlineQueue";

export const BACKGROUND_SYNC_TAG = "sync-pending-reports";

let flushing = false;

export async function isApiReachable(timeoutMs = 5000): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function syncPendingReport(item: PendingReport): Promise<void> {
  await updatePendingReport(item.id, { status: "syncing", lastError: undefined });

  let reportId = item.serverReportId;

  if (!reportId) {
    const report = await createReport(item.payload);
    reportId = report.id;
    await updatePendingReport(item.id, { serverReportId: reportId });
  }

  if (item.photos.length > 0) {
    const lat = item.payload.location.latitude;
    const lng = item.payload.location.longitude;
    const gps =
      lat !== undefined && lng !== undefined ? { lat, lng } : undefined;

    await uploadReportPhotos(reportId, storedPhotosToFiles(item.photos), gps);
  }

  await removePendingReport(item.id);
}

export async function flushPendingReports(): Promise<{ synced: number; failed: number }> {
  if (flushing) {
    return { synced: 0, failed: 0 };
  }

  if (!(await isApiReachable())) {
    return { synced: 0, failed: 0 };
  }

  flushing = true;
  let synced = 0;
  let failed = 0;

  try {
    const pending = await listPendingReports();
    const queue = pending
      .filter((item) => item.status !== "syncing")
      .sort(
        (a, b) =>
          new Date(a.payload.collected_at).getTime() -
          new Date(b.payload.collected_at).getTime(),
      );

    for (const item of queue) {
      try {
        await syncPendingReport(item);
        synced += 1;
      } catch (err) {
        failed += 1;
        const message =
          err instanceof Error ? err.message : "Failed to sync pending report";
        await updatePendingReport(item.id, {
          status: "failed",
          retryCount: item.retryCount + 1,
          lastError: message,
        });
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { synced, failed };
}

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return false;
}
