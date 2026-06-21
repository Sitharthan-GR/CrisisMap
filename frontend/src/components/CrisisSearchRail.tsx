import {
  Crosshair,
  FlaskConical,
  LocateFixed,
  MapPin,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlaceSearchResult } from "../api/client";
import type { PickedMapLocation } from "../types/location";
import type { Crisis } from "../types/report";
import {
  displayValueToMeters,
  formatRadiusLabel,
  metersToDisplayValue,
  radiusSliderConfig,
  type DistanceSystem,
} from "../lib/units";

type LocationMethod = "search" | "gps" | "pin";

interface CrisisSearchRailProps {
  crisisEvents: Crisis[];
  selectedCrisisId: string;
  selectedCrisis?: Crisis;
  loading: boolean;
  radiusMeters: number;
  distanceSystem: DistanceSystem;
  reportsInRangeCount: number;
  pickedLocation: PickedMapLocation | null;
  addressQuery: string;
  placeResults: PlaceSearchResult[];
  searchingPlaces: boolean;
  pinDropMode: boolean;
  locating: boolean;
  onCrisisChange: (crisisId: string) => void;
  onAddressQueryChange: (query: string) => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onLocate: () => void;
  onTogglePinDrop: () => void;
  onApplyRadius: (radiusMeters: number) => void;
}

function shortPlaceLabel(label: string): string {
  const first = label.split(",")[0]?.trim();
  return first || label;
}

export default function CrisisSearchRail({
  crisisEvents,
  selectedCrisisId,
  selectedCrisis,
  loading,
  radiusMeters,
  distanceSystem,
  reportsInRangeCount,
  pickedLocation,
  addressQuery,
  placeResults,
  searchingPlaces,
  pinDropMode,
  locating,
  onCrisisChange,
  onAddressQueryChange,
  onSelectPlace,
  onLocate,
  onTogglePinDrop,
  onApplyRadius,
}: CrisisSearchRailProps) {
  const { t } = useTranslation();
  const [locationMethod, setLocationMethod] = useState<LocationMethod>("search");
  const [draftRadius, setDraftRadius] = useState(() =>
    metersToDisplayValue(radiusMeters, distanceSystem),
  );
  const slider = radiusSliderConfig(distanceSystem);

  useEffect(() => {
    setDraftRadius(metersToDisplayValue(radiusMeters, distanceSystem));
  }, [radiusMeters, distanceSystem]);

  useEffect(() => {
    if (pinDropMode) {
      setLocationMethod("pin");
    }
  }, [pinDropMode]);

  const placeName =
    (pickedLocation && shortPlaceLabel(pickedLocation.label)) ||
    selectedCrisis?.name ||
    t("dashboard.areaDefaultPlace");

  const areaTitle = t("dashboard.areaWithin", {
    distance: formatRadiusLabel(radiusMeters, distanceSystem),
    place: placeName,
  });

  const sourceKey = pickedLocation?.source ?? "default";
  const areaSubKey =
    sourceKey === "gps" ||
    sourceKey === "search" ||
    sourceKey === "map" ||
    sourceKey === "building"
      ? `dashboard.areaSub_${sourceKey}`
      : "dashboard.areaSubDefault";
  const areaSub = t(areaSubKey, { count: reportsInRangeCount });

  const resetAreaDraft = () => {
    setDraftRadius(metersToDisplayValue(radiusMeters, distanceSystem));
    if (pinDropMode) onTogglePinDrop();
  };

  const applyArea = () => {
    onApplyRadius(displayValueToMeters(draftRadius, distanceSystem));
  };

  return (
    <>
      <div className="panel-h">
        <span className="pi">
          <Crosshair strokeWidth={2} />
        </span>
        <h2>{t("dashboard.crisisSearchArea")}</h2>
      </div>

      <div className="card">
        <div className="ct">{t("dashboard.activeCrisis")}</div>
        {crisisEvents.length > 0 && selectedCrisis ? (
          <>
            <div className="crisis-row">
              <span className="cico">
                <FlaskConical strokeWidth={2} />
              </span>
              <div>
                <div className="crisis-name">{selectedCrisis.name}</div>
                <div className="crisis-meta">
                  {selectedCrisis.crisis_subtype} ·{" "}
                  {new Date(selectedCrisis.onset_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <select
              className="field crisis-select"
              value={selectedCrisisId}
              disabled={loading}
              onChange={(e) => onCrisisChange(e.target.value)}
            >
              {crisisEvents.map((crisis) => (
                <option key={crisis.id} value={crisis.id}>
                  {crisis.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="hint">{t("dashboard.noActiveCrises")}</p>
        )}
      </div>

      <div className="card area-card editing">
        <div className="area-summary">
          <span className="aico">
            <MapPin strokeWidth={2} />
          </span>
          <span className="atext">
            <div className="a1">{areaTitle}</div>
            <div className="a2">{areaSub}</div>
          </span>
        </div>

        <div className="area-workflow">
          <div className="method-tabs">
            {(
              [
                ["search", Search, t("dashboard.methodSearch")],
                ["gps", LocateFixed, t("dashboard.methodGps")],
                ["pin", MapPin, t("dashboard.methodPin")],
              ] as const
            ).map(([method, Icon, label]) => (
              <button
                key={method}
                type="button"
                className={locationMethod === method ? "on" : ""}
                onClick={() => {
                  setLocationMethod(method);
                  if (method === "pin") {
                    if (!pinDropMode) onTogglePinDrop();
                  } else if (pinDropMode) {
                    onTogglePinDrop();
                  }
                }}
              >
                <Icon strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>

          <div className={`method-panel${locationMethod === "search" ? " on" : ""}`}>
            <input
              className="field"
              type="search"
              value={addressQuery}
              onChange={(e) => onAddressQueryChange(e.target.value)}
              placeholder={t("dashboard.searchLocationPlaceholder")}
              autoComplete="off"
            />
            {searchingPlaces && (
              <p className="hint">{t("wizard.searchingPlaces")}</p>
            )}
            {!searchingPlaces && addressQuery.trim().length >= 2 && placeResults.length === 0 && (
              <p className="hint">{t("wizard.noPlacesFound")}</p>
            )}
            {placeResults.length > 0 && (
              <div className="place-results">
                {placeResults.map((place) => (
                  <button
                    key={`${place.place_id ?? place.display_name}-${place.latitude}`}
                    type="button"
                    onClick={() => onSelectPlace(place)}
                  >
                    {place.display_name}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">{t("dashboard.searchHint")}</p>
          </div>

          <div className={`method-panel${locationMethod === "gps" ? " on" : ""}`}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={onLocate}
              disabled={locating}
            >
              <LocateFixed strokeWidth={2} />
              {locating ? t("dashboard.locating") : t("dashboard.useMyLocation")}
            </button>
            <p className="hint">{t("dashboard.gpsHint")}</p>
          </div>

          <div className={`method-panel${locationMethod === "pin" ? " on" : ""}`}>
            <button
              type="button"
              className={`btn btn-block${pinDropMode ? " btn-primary" : ""}`}
              onClick={onTogglePinDrop}
            >
              <MapPin strokeWidth={2} />
              {pinDropMode ? t("dashboard.pinDropActive") : t("dashboard.dropPin")}
            </button>
            <p className="hint">{t("dashboard.pinHint")}</p>
          </div>

          <div className="radius-row">
            <div className="rl">
              <span className="label">{t("dashboard.searchRadius")}</span>
              <span className="rv">
                {formatRadiusLabel(
                  displayValueToMeters(draftRadius, distanceSystem),
                  distanceSystem,
                )}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={draftRadius}
              onChange={(e) => setDraftRadius(Number(e.target.value))}
            />
          </div>

          <div className="wf-actions">
            <button type="button" className="btn btn-block" onClick={resetAreaDraft}>
              {t("admin.cancel")}
            </button>
            <button type="button" className="btn btn-primary btn-block" onClick={applyArea}>
              {t("dashboard.applyArea")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
