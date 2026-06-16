import type { Feature, FeatureCollection, Polygon } from "geojson";
import L from "leaflet";
import type { Layer, PathOptions } from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON, useMap, useMapEvents } from "react-leaflet";
import { fetchBuildingFootprints } from "../api/client";
import { polygonCentroid } from "../lib/polygon";

const MIN_ZOOM = 14;
const DEBOUNCE_MS = 600;

const BUILDING_STYLE: PathOptions = {
  fillColor: "#64748b",
  fillOpacity: 0.45,
  color: "#94a3b8",
  weight: 1,
  opacity: 0.7,
};

const SELECTED_BUILDING_STYLE: PathOptions = {
  fillColor: "#3b82f6",
  fillOpacity: 0.55,
  color: "#60a5fa",
  weight: 2,
  opacity: 0.95,
};

const HOVER_BUILDING_STYLE: PathOptions = {
  fillColor: "#475569",
  fillOpacity: 0.6,
  color: "#cbd5e1",
  weight: 1.5,
  opacity: 0.85,
};

export interface BuildingPick {
  lat: number;
  lng: number;
  buildingId: string;
  label: string;
}

interface BuildingFootprintsProps {
  pinDropActive?: boolean;
  selectedBuildingId?: string | null;
  onBuildingPick?: (pick: BuildingPick) => void;
}

function buildingLabel(feature: Feature<Polygon>): string {
  const props = feature.properties ?? {};
  const parts = [
    props["addr:housenumber"],
    props["addr:street"],
    props.name,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  const type = props.building;
  return type && type !== "yes" ? String(type) : "Building";
}

export default function BuildingFootprints({
  pinDropActive = false,
  selectedBuildingId = null,
  onBuildingPick,
}: BuildingFootprintsProps) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layerByIdRef = useRef<Map<string, Layer>>(new Map());

  const loadFootprints = useCallback(() => {
    if (map.getZoom() < MIN_ZOOM) {
      setData(null);
      layerByIdRef.current.clear();
      return;
    }

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetchBuildingFootprints({ south, west, north, east }, controller.signal)
      .then((geojson) => {
        layerByIdRef.current.clear();
        setData(geojson);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setData(null);
        layerByIdRef.current.clear();
      });
  }, [map]);

  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(loadFootprints, DEBOUNCE_MS);
  }, [loadFootprints]);

  useMapEvents({
    moveend: scheduleLoad,
    zoomend: scheduleLoad,
  });

  useEffect(() => {
    scheduleLoad();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [scheduleLoad]);

  useEffect(() => {
    for (const [id, layer] of layerByIdRef.current) {
      const path = layer as L.Path;
      if (id === selectedBuildingId) {
        path.setStyle(SELECTED_BUILDING_STYLE);
        path.bringToFront();
      } else {
        path.setStyle(BUILDING_STYLE);
      }
    }
  }, [selectedBuildingId, data]);

  const handleEachFeature = useCallback(
    (feature: Feature<Polygon>, layer: Layer) => {
      const buildingId = String(feature.properties?.osm_id ?? "");
      if (buildingId) {
        layerByIdRef.current.set(buildingId, layer);
        if (buildingId === selectedBuildingId) {
          (layer as L.Path).setStyle(SELECTED_BUILDING_STYLE);
        }
      }

      layer.on({
        mouseover: () => {
          if (!pinDropActive) return;
          (layer as L.Path).setStyle(HOVER_BUILDING_STYLE);
        },
        mouseout: () => {
          if (buildingId === selectedBuildingId) {
            (layer as L.Path).setStyle(SELECTED_BUILDING_STYLE);
          } else {
            (layer as L.Path).setStyle(BUILDING_STYLE);
          }
        },
        click: (event) => {
          if (!pinDropActive || !onBuildingPick) return;
          L.DomEvent.stopPropagation(event);
          const ring = feature.geometry.coordinates[0];
          const { lat, lng } = polygonCentroid(ring);
          onBuildingPick({
            lat,
            lng,
            buildingId,
            label: buildingLabel(feature),
          });
        },
      });
    },
    [onBuildingPick, pinDropActive, selectedBuildingId],
  );

  if (!data || data.features.length === 0) return null;

  return (
    <GeoJSON
      key={data.features.length}
      data={data}
      style={() => BUILDING_STYLE}
      onEachFeature={handleEachFeature}
    />
  );
}
