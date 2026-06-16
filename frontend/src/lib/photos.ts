import {
  ApiError,
  confirmPhotoUpload,
  initiatePhotoUpload,
} from "../api/client";
import type { Photo, PhotoMimeType } from "../types/report";

export const ALLOWED_IMAGE_TYPES: PhotoMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_PHOTO_SIZE_KB = 51_200;
export const MAX_PHOTOS_PER_REPORT = 5;

export interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export type PhotoValidationError =
  | "photoValidation"
  | "photoTooLarge"
  | "photoEmpty";

export function validateImageFile(file: File): PhotoValidationError | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as PhotoMimeType)) {
    return "photoValidation";
  }
  const sizeKb = Math.ceil(file.size / 1024);
  if (sizeKb > MAX_PHOTO_SIZE_KB) {
    return "photoTooLarge";
  }
  if (file.size === 0) {
    return "photoEmpty";
  }
  return null;
}

export function fileToPendingPhoto(file: File): PendingPhoto {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokePendingPhoto(photo: PendingPhoto) {
  URL.revokeObjectURL(photo.previewUrl);
}

export async function uploadReportPhoto(
  reportId: string,
  file: File,
  gps?: { lat?: number; lng?: number },
): Promise<Photo> {
  const mimeType = file.type as PhotoMimeType;
  const fileSizeKb = Math.max(1, Math.ceil(file.size / 1024));

  const initiate = await initiatePhotoUpload(reportId, {
    mime_type: mimeType,
    file_size_kb: fileSizeKb,
  });

  const uploadResponse = await fetch(initiate.upload_url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new ApiError(
      `Image upload failed (${uploadResponse.status}). Check Supabase Storage bucket setup.`,
      "STORAGE_ERROR",
    );
  }

  return confirmPhotoUpload(reportId, {
    photo_id: initiate.photo_id,
    storage_path: initiate.storage_path,
    file_size_kb: fileSizeKb,
    mime_type: mimeType,
    captured_at: new Date(file.lastModified).toISOString(),
    gps_lat: gps?.lat,
    gps_lng: gps?.lng,
  });
}

export async function uploadReportPhotos(
  reportId: string,
  files: File[],
  gps?: { lat?: number; lng?: number },
  onProgress?: (completed: number, total: number) => void,
): Promise<Photo[]> {
  const uploaded: Photo[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const photo = await uploadReportPhoto(reportId, files[i], gps);
    uploaded.push(photo);
    onProgress?.(i + 1, files.length);
  }

  return uploaded;
}
