import L from "leaflet";
import { useEffect } from "react";
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
  layoutKey?: string;
  pinDropActive?: boolean;
  pickedLocation?: PickedMapLocation | null;
  onMapPick?: (lat: number, lng: number) => void;
  onBuildingPick?: (pick: BuildingPick) => void;
  onSelectReport: (report: MapReportPin) => void;
  onSelectReportVersion?: (reportId: string) => void;
  onClearReport?: () => void;
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

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

function MapResizeOnLayoutChange({ layoutKey }: { layoutKey?: string }) {
  const map = useMap();

  useEffect(() => {
    const resize = () => map.invalidateSize();
    const frame = requestAnimationFrame(resize);
    const timer = window.setTimeout(resize, 320);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [layoutKey, map]);

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
  layoutKey,
  pinDropActive = false,
  pickedLocation,
  onMapPick,
  onBuildingPick,
  onSelectReport,
  onSelectReportVersion,
  onClearReport,
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
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapRecenter center={center} />
        <MapResizeOnLayoutChange layoutKey={layoutKey} />
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
              opacity={isSelected ? 1 : 0.9}
            />
          );
        })}
      </MapContainer>

      {selectedReportId && onClearReport && (
        <ReportMapOverlay
          reportId={selectedReportId}
          crisisName={crisisName}
          onClose={onClearReport}
          onSelectVersion={onSelectReportVersion}
        />
      )}
    </div>
  );
}
