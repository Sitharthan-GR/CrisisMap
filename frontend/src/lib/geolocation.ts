import { fetchIpLocation } from "../api/client";

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type LocationSource = "gps" | "ip" | "default";

export interface ResolvedLocation extends GeoCoords {
  source: LocationSource;
}

export class GeolocationError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "GeolocationError";
  }
}

const PERMISSION_DENIED = 1;

function mapGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError(
        "Location permission denied. Allow location access for this site in your browser settings.",
        error.code,
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError(
        "Location unavailable. Try again outdoors, disable VPN, or enter coordinates manually.",
        error.code,
      );
    case error.TIMEOUT:
      return new GeolocationError(
        "Location request timed out. Try again or enter coordinates manually.",
        error.code,
      );
    default:
      return new GeolocationError(
        "Unable to get your location. Try again or enter coordinates manually.",
        error.code,
      );
  }
}

function requestPosition(options: PositionOptions): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(mapGeolocationError(error)),
      options,
    );
  });
}

/**
 * Resolve the user's current coordinates.
 *
 * Desktop browsers often time out with enableHighAccuracy=true even when
 * permission is granted, so we try a fast network/Wi‑Fi fix first and only
 * then retry with high accuracy.
 */
export async function getCurrentLocation(): Promise<GeoCoords> {
  if (!navigator.geolocation) {
    throw new GeolocationError("Geolocation is not supported in this browser.");
  }

  if (!window.isSecureContext) {
    throw new GeolocationError(
      "Location requires a secure context (HTTPS or localhost).",
    );
  }

  try {
    return await requestPosition({
      enableHighAccuracy: false,
      timeout: 20_000,
      maximumAge: 300_000,
    });
  } catch (firstError) {
    if (
      firstError instanceof GeolocationError &&
      firstError.code === PERMISSION_DENIED
    ) {
      throw firstError;
    }
  }

  return requestPosition({
    enableHighAccuracy: true,
    timeout: 30_000,
    maximumAge: 0,
  });
}

/**
 * Best-effort user location: GPS → IP (via backend / ISP) → fallback coordinates.
 */
export async function resolveApproxUserLocation(fallback: {
  latitude: number;
  longitude: number;
}): Promise<ResolvedLocation> {
  if (navigator.geolocation && window.isSecureContext) {
    try {
      const coords = await getCurrentLocation();
      return { ...coords, source: "gps" };
    } catch {
      // GPS denied, timed out, or unavailable — try IP next.
    }
  }

  try {
    const ip = await fetchIpLocation();
    if (
      ip.available &&
      typeof ip.latitude === "number" &&
      typeof ip.longitude === "number"
    ) {
      return {
        latitude: ip.latitude,
        longitude: ip.longitude,
        source: "ip",
      };
    }
  } catch {
    // IP lookup failed — use fallback.
  }

  return {
    latitude: fallback.latitude,
    longitude: fallback.longitude,
    source: "default",
  };
}
