import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReportCreateInput, PhotoMimeType } from "../types/report";

export const OFFLINE_DB_NAME = "crisismap-offline";
export const OFFLINE_DB_VERSION = 1;
export const PENDING_REPORTS_STORE = "pending-reports";

export type PendingReportStatus = "pending" | "syncing" | "failed";

export interface StoredPhoto {
  name: string;
  mimeType: PhotoMimeType;
  blob: Blob;
  lastModified: number;
}

export interface PendingReport {
  id: string;
  status: PendingReportStatus;
  queuedAt: string;
  payload: ReportCreateInput;
  photos: StoredPhoto[];
  serverReportId?: string;
  retryCount: number;
  lastError?: string;
}

interface OfflineDbSchema extends DBSchema {
  [PENDING_REPORTS_STORE]: {
    key: string;
    value: PendingReport;
    indexes: { "by-status": PendingReportStatus };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDbSchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDbSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(PENDING_REPORTS_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-status", "status");
      },
    });
  }
  return dbPromise;
}

export async function enqueuePendingReport(
  payload: ReportCreateInput,
  photos: File[],
): Promise<string> {
  const id = crypto.randomUUID();
  const storedPhotos = await Promise.all(
    photos.map(async (file) => ({
      name: file.name || `photo-${crypto.randomUUID()}`,
      mimeType: file.type as PhotoMimeType,
      blob: file.slice(0, file.size, file.type),
      lastModified: file.lastModified,
    })),
  );

  const item: PendingReport = {
    id,
    status: "pending",
    queuedAt: new Date().toISOString(),
    payload,
    photos: storedPhotos,
    retryCount: 0,
  };

  const db = await getDb();
  await db.put(PENDING_REPORTS_STORE, item);
  return id;
}

export async function listPendingReports(): Promise<PendingReport[]> {
  const db = await getDb();
  return db.getAll(PENDING_REPORTS_STORE);
}

export async function getPendingReport(id: string): Promise<PendingReport | undefined> {
  const db = await getDb();
  return db.get(PENDING_REPORTS_STORE, id);
}

export async function updatePendingReport(
  id: string,
  patch: Partial<PendingReport>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(PENDING_REPORTS_STORE, id);
  if (!existing) return;
  await db.put(PENDING_REPORTS_STORE, { ...existing, ...patch });
}

export async function removePendingReport(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(PENDING_REPORTS_STORE, id);
}

export async function countPendingReports(): Promise<number> {
  const db = await getDb();
  return db.count(PENDING_REPORTS_STORE);
}

export function storedPhotosToFiles(photos: StoredPhoto[]): File[] {
  return photos.map(
    (photo) =>
      new File([photo.blob], photo.name, {
        type: photo.mimeType,
        lastModified: photo.lastModified,
      }),
  );
}
