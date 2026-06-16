import L from "leaflet";
import { useEffect } from "react";
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
import type { LocationMethod } from "../types/report";

interface ReportLocationPickerProps {
  latitude: string;
  longitude: string;
  placeLabel: string;
  locationStatus: "idle" | "detecting" | "detected" | "failed";
  locationMethod: LocationMethod;
  addressQuery: string;
  placeResults: PlaceSearchResult[];
  searchingPlaces: boolean;
  showSearch: boolean;
  onToggleSearch: () => void;
  onAddressQueryChange: (value: string) => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onMapPick: (lat: number, lng: number) => void;
  onUseGps: () => void;
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

function MapClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    return () => {
      container.style.cursor = "";
    };
  }, [map]);

  useMapEvents({
    click(event) {
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
  locationMethod,
  addressQuery,
  placeResults,
  searchingPlaces,
  showSearch,
  onToggleSearch,
  onAddressQueryChange,
  onSelectPlace,
  onMapPick,
  onUseGps,
}: ReportLocationPickerProps) {
  const { t } = useTranslation();

  const hasCoords = Boolean(latitude && longitude);
  const lat = hasCoords ? Number(latitude) : DEFAULT_CENTER.lat;
  const lng = hasCoords ? Number(longitude) : DEFAULT_CENTER.lng;
  const shortLabel = placeLabel ? shortAddress(placeLabel) : "";

  const statusText =
    locationMethod === "manual"
      ? t("wizard.locationManual")
      : locationStatus === "failed"
        ? t("wizard.gpsFailed")
        : locationStatus === "detecting"
          ? t("wizard.detecting")
          : t("wizard.gpsAuto");

  return (
    <div>
      <div className="relative mb-2.5 overflow-hidden rounded-lg border border-surface-border">
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          minZoom={10}
          maxZoom={19}
          className="h-[160px] w-full"
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
            <MapClickPicker onPick={onMapPick} />
          )}
        </MapContainer>

        {locationStatus === "detecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 text-xs text-slate-300">
            {t("wizard.detecting")}
          </div>
        )}
      </div>

      <div className="mb-2 rounded-lg bg-surface px-3 py-2.5 text-center">
        <p className="text-sm font-medium leading-snug text-white">
          {locationStatus === "detecting"
            ? t("wizard.detecting")
            : shortLabel || t("wizard.locationUnknown")}
        </p>
        {placeLabel && placeLabel !== shortLabel && (
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500" title={placeLabel}>
            {placeLabel}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-400">{statusText}</p>
      </div>

      <p className="mb-2 text-center text-[11px] text-slate-500">
        {t("wizard.tapMapToAdjust")}
      </p>

      <button
        type="button"
        onClick={onToggleSearch}
        className="mx-auto flex items-center gap-1 text-xs text-accent hover:underline"
      >
        {t("wizard.adjustPin")}
      </button>

      {showSearch && (
        <div className="mt-3">
          <label className="block text-xs text-slate-400">
            {t("wizard.addressPlaceholder")}
            <input
              type="search"
              value={addressQuery}
              onChange={(e) => onAddressQueryChange(e.target.value)}
              placeholder={t("wizard.addressPlaceholder")}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
              autoComplete="off"
            />
          </label>

          {searchingPlaces && (
            <p className="mt-2 text-xs text-slate-500">{t("wizard.searchingPlaces")}</p>
          )}

          {!searchingPlaces &&
            addressQuery.trim().length >= 2 &&
            placeResults.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">{t("wizard.noPlacesFound")}</p>
            )}

          {placeResults.length > 0 && (
            <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-surface-border bg-surface">
              {placeResults.map((place) => (
                <li key={`${place.place_id ?? place.display_name}-${place.latitude}`}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace(place)}
                    className="w-full px-3 py-2.5 text-start text-sm text-slate-200 transition hover:bg-surface-raised"
                    title={place.display_name}
                  >
                    {shortAddress(place.display_name)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onUseGps}
            className="mt-3 w-full text-xs text-slate-400 hover:text-white"
          >
            {t("wizard.useGpsAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
