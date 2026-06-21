import { useEffect, useMemo, useState } from "react";
import { fetchReverseGeocode, isAbortError } from "../api/client";
import { inferDistanceSystem, type DistanceSystem } from "./units";

export function useDistanceSystem(lat: number, lng: number): DistanceSystem {
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchReverseGeocode(lat, lng, controller.signal)
      .then((geo) => setCountry(geo.admin_level_1 ?? null))
      .catch((err) => {
        if (!isAbortError(err)) setCountry(null);
      });
    return () => controller.abort();
  }, [lat, lng]);

  return useMemo(() => inferDistanceSystem(country), [country]);
}
