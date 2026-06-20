import L from "leaflet";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MapViewport } from "../types/crisis";
import type { MapReportPin } from "../types/report";
import type { PickedMapLocation } from "../types/location";
import {
  damageLevelColor,
} from "../lib/severity";
import BuildingFootprints, { type BuildingPick } from "./BuildingFootprints";
import ReportMapOverlay from "./ReportMapOverlay";
import "leaflet/dist/leaflet.css";

interface CrisisMapProps {
  viewport: MapViewport;
  reports: MapReportPin[];
  selectedReportId?: string;
  crisisName?: string;
  mapFocusKey?: string;
  fitReports?: MapReportPin[];
  loading?: boolean;
  loadingLabel?: string;
  layoutKey?: string;
  pinDropActive?: boolean;
  pickedLocation?: PickedMapLocation | null;
  onMapPick?: (lat: number, lng: number) => void;
  onBuildingPick?: (pick: BuildingPick) => void;
  onSelectReport: (report: MapReportPin) => void;
  onSelectReportVersion?: (reportId: string) => void;
  onClearReport?: () => void;
  onReportDeleted?: () => void;
}

function MapPanToReport({
  reports,
  selectedReportId,
}: {
  reports: MapReportPin[];
  selectedReportId?: string;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedReportId) return;
    const report = reports.find((r) => r.id === selectedReportId);
    if (!report) return;
    map.flyTo([report.latitude, report.longitude], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.45,
    });
  }, [selectedReportId, reports, map]);

  return null;
}

function MapPinDropHandler({
  active,
  onPick,
}: {
  active: boolean;
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (active) {
      container.style.cursor = "crosshair";
    } else {
      container.style.cursor = "";
    }
    return () => {
      container.style.cursor = "";
    };
  }, [active, map]);

  useMapEvents({
    click(event) {
      if (!active || !onPick) return;
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

const MIN_LAT = -85;
const MAX_LAT = 85;
const WORLD_BOUNDS = L.latLngBounds([MIN_LAT, -180], [MAX_LAT, 180]);
const BASEMAP_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const GLOBE_WRAP_MAX_ZOOM = 9;
const TILE_MAX_NATIVE_ZOOM = 18;
const MAP_MAX_ZOOM = 19;

function normalizeLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function stabilizeView(map: L.Map) {
  const center = map.getCenter();
  const lng = normalizeLongitude(center.lng);
  if (Math.abs(lng - center.lng) > 1e-4) {
    map.setView([center.lat, lng], map.getZoom(), { animate: false });
  }
}

function clampLatitude(map: L.Map) {
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  if (south >= MIN_LAT && north <= MAX_LAT) return;

  const center = map.getCenter();
  const halfSpan = (north - south) / 2;
  const minCenterLat = MIN_LAT + halfSpan;
  const maxCenterLat = MAX_LAT - halfSpan;

  if (minCenterLat > maxCenterLat) {
    map.setView([0, center.lng], map.getZoom(), { animate: false });
    return;
  }

  const clampedLat = Math.max(minCenterLat, Math.min(maxCenterLat, center.lat));
  if (Math.abs(clampedLat - center.lat) > 1e-6) {
    map.setView([clampedLat, center.lng], map.getZoom(), { animate: false });
  }
}

/** Resize-aware min zoom + vertical clamp; horizontal pan wraps like a globe. */
function MapGlobeViewport({ layoutKey }: { layoutKey?: string }) {
  const map = useMap();

  useEffect(() => {
    const syncWrapMode = () => {
      map.options.worldCopyJump = map.getZoom() <= GLOBE_WRAP_MAX_ZOOM;
    };

    const sync = () => {
      map.invalidateSize();
      const minZoom = map.getBoundsZoom(WORLD_BOUNDS, false);
      map.setMinZoom(minZoom);
      if (map.getZoom() < minZoom) {
        map.setZoom(minZoom);
      }
      syncWrapMode();
      stabilizeView(map);
      clampLatitude(map);
    };

    const onMoveEnd = () => {
      stabilizeView(map);
      clampLatitude(map);
    };

    const onZoomEnd = () => {
      syncWrapMode();
      stabilizeView(map);
      clampLatitude(map);
    };

    const onDrag = () => clampLatitude(map);

    sync();
    const frame = requestAnimationFrame(sync);
    const timer = window.setTimeout(sync, 320);

    map.on("drag", onDrag);
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onZoomEnd);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      map.off("drag", onDrag);
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onZoomEnd);
    };
  }, [layoutKey, map]);

  return null;
}

function BasemapTileLayer() {
  const map = useMap();
  const [noWrap, setNoWrap] = useState(() => map.getZoom() > GLOBE_WRAP_MAX_ZOOM);

  useEffect(() => {
    const sync = () => setNoWrap(map.getZoom() > GLOBE_WRAP_MAX_ZOOM);
    sync();
    map.on("zoomend", sync);
    return () => {
      map.off("zoomend", sync);
    };
  }, [map]);

  return (
    <TileLayer
      key={noWrap ? "basemap-nowrap" : "basemap-wrap"}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url={BASEMAP_URL}
      noWrap={noWrap}
      maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      updateWhenZooming
    />
  );
}

function MapRecenter({
  center,
  focusKey,
}: {
  center: [number, number];
  focusKey?: string;
}) {
  const map = useMap();
  const prevFocusKey = useRef<string | undefined>(undefined);
  const prevCenter = useRef(center);

  useEffect(() => {
    const focusChanged =
      focusKey !== undefined && focusKey !== prevFocusKey.current;
    prevFocusKey.current = focusKey;

    if (focusChanged) {
      prevCenter.current = center;
      return;
    }

    const centerChanged =
      center[0] !== prevCenter.current[0] ||
      center[1] !== prevCenter.current[1];
    prevCenter.current = center;

    if (centerChanged) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, focusKey, map]);

  return null;
}

function MapFitToReports({
  reports,
  focusKey,
  loading,
  fallbackCenter,
}: {
  reports: MapReportPin[];
  focusKey?: string;
  loading?: boolean;
  fallbackCenter: [number, number];
}) {
  const map = useMap();
  const lastFitKey = useRef<string | undefined>(undefined);
  const prevFocusKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (focusKey !== prevFocusKey.current) {
      prevFocusKey.current = focusKey;
      lastFitKey.current = undefined;
    }

    if (!focusKey || loading) return;
    if (lastFitKey.current === focusKey) return;
    lastFitKey.current = focusKey;

    if (reports.length === 0) {
      map.flyTo(fallbackCenter, 11, { animate: true, duration: 0.55 });
      return;
    }

    if (reports.length === 1) {
      map.flyTo(
        [reports[0].latitude, reports[0].longitude],
        14,
        { animate: true, duration: 0.55 },
      );
      return;
    }

    const bounds = L.latLngBounds(
      reports.map((report) => [report.latitude, report.longitude] as [number, number]),
    );
    map.flyToBounds(bounds, {
      padding: [52, 52],
      maxZoom: 13,
      animate: true,
      duration: 0.55,
    });
  }, [reports, focusKey, loading, fallbackCenter, map]);

  return null;
}

function createDamageIcon(damageLevel: string, selected: boolean) {
  const color = damageLevelColor(damageLevel);
  const size = selected ? 22 : 18;
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createPickedPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 28px;
      height: 28px;
      border-radius: 50% 50% 50% 0;
      background: #f97316;
      border: 2px solid white;
      transform: rotate(-45deg);
      box-shadow: 0 2px 10px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function CrisisMap({
  viewport,
  reports,
  selectedReportId,
  crisisName,
  mapFocusKey,
  fitReports,
  loading = false,
  loadingLabel = "Loading…",
  layoutKey,
  pinDropActive = false,
  pickedLocation,
  onMapPick,
  onBuildingPick,
  onSelectReport,
  onSelectReportVersion,
  onClearReport,
  onReportDeleted,
}: CrisisMapProps) {
  const center: [number, number] = [viewport.lat, viewport.lng];

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl border border-surface-border shadow-panel ${
        pinDropActive ? "ring-2 ring-orange-500/40 ring-offset-0" : ""
      }`}
    >
      <MapContainer
        center={center}
        zoom={12}
        minZoom={2}
        maxZoom={MAP_MAX_ZOOM}
        worldCopyJump
        className="h-full w-full"
        scrollWheelZoom
      >
        <BasemapTileLayer />
        <MapGlobeViewport layoutKey={layoutKey} />
        <MapRecenter center={center} focusKey={mapFocusKey} />
        <MapFitToReports
          reports={fitReports ?? reports}
          focusKey={mapFocusKey}
          loading={loading}
          fallbackCenter={center}
        />
        <MapPanToReport reports={reports} selectedReportId={selectedReportId} />
        <MapPinDropHandler active={pinDropActive} onPick={onMapPick} />
        <BuildingFootprints
          pinDropActive={pinDropActive}
          selectedBuildingId={pickedLocation?.buildingFootprintId ?? null}
          onBuildingPick={onBuildingPick}
        />
        <Circle
          center={center}
          radius={viewport.radiusMeters}
          pathOptions={{
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "6 8",
          }}
        />

        {pickedLocation && (
          <Marker
            position={[pickedLocation.lat, pickedLocation.lng]}
            icon={createPickedPinIcon()}
            zIndexOffset={600}
          >
            <Popup>
              <p className="max-w-[220px] text-sm text-white">{pickedLocation.label}</p>
            </Popup>
          </Marker>
        )}

        {reports.map((report) => {
          const isSelected = selectedReportId === report.id;
          const position: [number, number] = [report.latitude, report.longitude];

          return (
            <Marker
              key={report.id}
              position={position}
              icon={createDamageIcon(report.damageLevel, isSelected)}
              eventHandlers={{
                click: () => onSelectReport(report),
              }}
              opacity={loading ? 0 : isSelected ? 1 : 0.9}
            />
          );
        })}
      </MapContainer>

      <div
        className={`pointer-events-none absolute inset-0 z-[400] bg-surface/25 backdrop-blur-[1px] transition-opacity duration-300 ease-out ${
          loading ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!loading}
      />

      <div
        className={`pointer-events-none absolute inset-0 z-[401] flex items-center justify-center transition-all duration-300 ease-out ${
          loading ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        }`}
        aria-hidden={!loading}
      >
        <div className="flex max-w-[min(90vw,320px)] items-center gap-3 rounded-xl border border-surface-border/80 bg-surface-raised/95 px-5 py-3.5 shadow-panel backdrop-blur-md">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" aria-hidden />
          <p className="truncate text-sm font-medium text-slate-200">{loadingLabel}</p>
        </div>
      </div>

      {selectedReportId && onClearReport && (
        <ReportMapOverlay
          reportId={selectedReportId}
          crisisName={crisisName}
          onClose={onClearReport}
          onSelectVersion={onSelectReportVersion}
          onReportDeleted={onReportDeleted}
        />
      )}
    </div>
  );
}
