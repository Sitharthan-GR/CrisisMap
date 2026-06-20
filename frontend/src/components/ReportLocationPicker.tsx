import L from "leaflet";
import { Crosshair, MousePointerClick, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { DEFAULT_CENTER } from "../lib/constants";
import { shortAddress } from "../lib/address";
import type { PlaceSearchResult } from "../api/client";

type PickerMode = "gps" | "map" | "search";
type PickSource = "gps" | "map" | "search";

interface ReportLocationPickerProps {
  latitude: string;
  longitude: string;
  placeLabel: string;
  locationStatus: "idle" | "detecting" | "detected" | "failed";
  addressQuery: string;
  placeResults: PlaceSearchResult[];
  searchingPlaces: boolean;
  title?: string;
  subtitle?: string;
  onAddressQueryChange: (value: string) => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onMapPick: (lat: number, lng: number) => void;
  onUseGps: () => void;
  isOffline?: boolean;
}

function createPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      background: #3b82f6;
      border: 2px solid white;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);

  return null;
}

function MapClickPicker({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = active ? "crosshair" : "";
    return () => {
      container.style.cursor = "";
    };
  }, [active, map]);

  useMapEvents({
    click(event) {
      if (!active) return;
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function ReportLocationPicker({
  latitude,
  longitude,
  placeLabel,
  locationStatus,
  addressQuery,
  placeResults,
  searchingPlaces,
  title,
  subtitle,
  onAddressQueryChange,
  onSelectPlace,
  onMapPick,
  onUseGps,
  isOffline = false,
}: ReportLocationPickerProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<PickerMode>("gps");
  const [pickSource, setPickSource] = useState<PickSource>("gps");

  const hasCoords = Boolean(latitude && longitude);
  const lat = hasCoords ? Number(latitude) : DEFAULT_CENTER.lat;
  const lng = hasCoords ? Number(longitude) : DEFAULT_CENTER.lng;
  const shortLabel = placeLabel ? shortAddress(placeLabel) : "";

  const locationTitle =
    locationStatus === "detecting"
      ? t("wizard.detecting")
      : shortLabel || t("wizard.currentLocation");

  const handleGps = () => {
    setMode("gps");
    setPickSource("gps");
    onUseGps();
  };

  const handleMapPick = (pickLat: number, pickLng: number) => {
    setPickSource("map");
    onMapPick(pickLat, pickLng);
  };

  const handleSelectPlace = (place: PlaceSearchResult) => {
    setPickSource("search");
    setMode("map");
    onSelectPlace(place);
  };

  const handleModeChange = (next: PickerMode) => {
    setMode(next);
    if (next === "gps") {
      handleGps();
    } else if (next === "search") {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  };

  const showSearchPanel =
    searchingPlaces ||
    placeResults.length > 0 ||
    (addressQuery.trim().length >= 2 && !searchingPlaces && mode === "search");

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised/40">
      {(title || subtitle) && (
        <div className="border-b border-surface-border px-4 py-3">
          {title && <p className="text-sm font-semibold text-white">{title}</p>}
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      )}

      <div className="p-4">
        {isOffline && (
          <p className="mb-3 rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
            {t("wizard.offlineLocationHint")}
          </p>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            type="search"
            value={addressQuery}
            onChange={(e) => onAddressQueryChange(e.target.value)}
            onFocus={() => setMode("search")}
            placeholder={t("wizard.addressPlaceholder")}
            className="w-full rounded-lg border border-accent/40 bg-surface py-2.5 ps-10 pe-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            autoComplete="off"
            disabled={isOffline}
          />
        </div>

        {isOffline && mode === "search" && (
          <p className="mt-1 text-[11px] text-slate-500">
            {t("wizard.offlineSearchHint")}
          </p>
        )}

        {showSearchPanel && (
          <div className="relative z-10 mt-1">
            {searchingPlaces && (
              <p className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-slate-500">
                {t("wizard.searchingPlaces")}
              </p>
            )}

            {!searchingPlaces &&
              addressQuery.trim().length >= 2 &&
              placeResults.length === 0 && (
                <p className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-slate-500">
                  {t("wizard.noPlacesFound")}
                </p>
              )}

            {placeResults.length > 0 && (
              <ul className="max-h-36 overflow-y-auto rounded-lg border border-surface-border bg-surface shadow-panel">
                {placeResults.map((place) => (
                  <li key={`${place.place_id ?? place.display_name}-${place.latitude}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlace(place)}
                      className="w-full px-3 py-2.5 text-start text-sm text-slate-200 transition hover:bg-surface-raised"
                      title={place.display_name}
                    >
                      {shortAddress(place.display_name)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="relative mt-3 overflow-hidden rounded-lg border border-surface-border">
          <MapContainer
            center={[lat, lng]}
            zoom={hasCoords ? 16 : 4}
            minZoom={2}
            maxZoom={19}
            className="h-[200px] w-full"
            scrollWheelZoom
            dragging
            doubleClickZoom
            touchZoom
            zoomControl
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution=""
            />
            {hasCoords && (
              <>
                <MapRecenter lat={lat} lng={lng} />
                <Marker position={[lat, lng]} icon={createPinIcon()} />
              </>
            )}
            {locationStatus !== "detecting" && (
              <MapClickPicker active={mode === "map"} onPick={handleMapPick} />
            )}
          </MapContainer>

          {locationStatus === "detecting" && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-surface/70 text-xs text-slate-300">
              {t("wizard.detecting")}
            </div>
          )}

          <button
            type="button"
            onClick={handleGps}
            disabled={locationStatus === "detecting"}
            className="absolute bottom-3 end-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:border-accent disabled:opacity-50"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {t("locationPicker.useMyGps")}
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {hasCoords ? locationTitle : t("wizard.locationUnknown")}
                </p>
                {hasCoords && (
                  <p className="mt-0.5 font-mono text-xs text-slate-400">
                    {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)}
                  </p>
                )}
                {isOffline && hasCoords && (
                  <p className="mt-1 text-[11px] text-sky-300/90">
                    {t("wizard.offlineCoordinatesHint")}
                  </p>
                )}
                {placeLabel && placeLabel !== shortLabel && hasCoords && (
                  <p
                    className="mt-1 line-clamp-2 text-[11px] text-slate-600"
                    title={placeLabel}
                  >
                    {placeLabel}
                  </p>
                )}
              </div>
            </div>
            {hasCoords && (
              <span className="shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {t(`locationPicker.source.${pickSource}`)}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              { id: "gps" as const, icon: Crosshair, label: t("locationPicker.tabGps") },
              {
                id: "map" as const,
                icon: MousePointerClick,
                label: t("locationPicker.tabMap"),
              },
              { id: "search" as const, icon: Search, label: t("locationPicker.tabSearch") },
            ] as const
          ).map(({ id, icon: Icon, label }) => {
            const selected = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleModeChange(id)}
                disabled={isOffline && id === "search"}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-surface-border bg-surface text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
