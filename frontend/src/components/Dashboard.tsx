import { Crosshair, LocateFixed, MapPin, Radar } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  fetchActiveCrises,
  fetchCrisisMap,
  fetchReverseGeocode,
  isAbortError,
  searchPlaces,
  type PlaceSearchResult,
} from "../api/client";
import { autoDetectLanguageFromLocation } from "../i18n";
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS_METERS,
  RADIUS_OPTIONS,
} from "../lib/constants";
import { filterReportsInRadius, hasValidEpicenter, radiusForReports, reportsCentroid } from "../lib/geo";
import { GeolocationError, getCurrentLocation } from "../lib/geolocation";
import type { MapViewport } from "../types/crisis";
import type { PickedMapLocation, ReportLocationPrefill } from "../types/location";
import type { Crisis, MapFeatureCollection, MapReportPin } from "../types/report";
import type { BuildingPick } from "./BuildingFootprints";
import CollapsiblePanel from "./CollapsiblePanel";
import CrisisMap from "./CrisisMap";
import Header from "./Header";
import LiveActivityFeed, { LiveActivityFeedIcon } from "./LiveActivityFeed";

function mapFeaturesToPins(
  features: MapFeatureCollection["features"],
): MapReportPin[] {
  return features.map((feature) => ({
    id: feature.properties.report_id,
    locationId: feature.properties.location_id,
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
    damageLevel: feature.properties.damage_level,
    infraType: feature.properties.infra_type,
    reportCount: feature.properties.report_count,
    adminLevel2: feature.properties.admin_level_2,
    thumbnail: feature.properties.latest_photo_thumbnail,
  }));
}

function radiusLabelKey(value: number): string {
  switch (value) {
    case 5_000:
      return "dashboard.radius5km";
    case 10_000:
      return "dashboard.radius10km";
    case 25_000:
      return "dashboard.radius25km";
    case 50_000:
      return "dashboard.radius50km";
    default:
      return "dashboard.radiusKm";
  }
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [viewport, setViewport] = useState<MapViewport>({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    radiusMeters: DEFAULT_RADIUS_METERS,
  });
  const [crisisEvents, setCrisisEvents] = useState<Crisis[]>([]);
  const [selectedCrisisId, setSelectedCrisisId] = useState<string>("");
  const [allReports, setAllReports] = useState<MapReportPin[]>([]);
  const [selectedReport, setSelectedReport] = useState<MapReportPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(true);
  const [feedPanelOpen, setFeedPanelOpen] = useState(true);
  const [pickedLocation, setPickedLocation] = useState<PickedMapLocation | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const centeredCrisisRef = useRef<string | null>(null);
  const mapFetchGenerationRef = useRef(0);

  const reportsInRange = useMemo(
    () =>
      filterReportsInRadius(
        allReports,
        viewport.lat,
        viewport.lng,
        viewport.radiusMeters,
      ),
    [allReports, viewport],
  );

  const loadData = useCallback(async (crisisId: string) => {
    if (!crisisId) {
      setAllReports([]);
      return;
    }

    const generation = ++mapFetchGenerationRef.current;
    setLoading(true);
    setError(null);

    try {
      const mapData = await fetchCrisisMap(crisisId, { status: "all" });
      if (generation !== mapFetchGenerationRef.current) return;
      setError(null);
      setAllReports(mapFeaturesToPins(mapData.features));
    } catch (err) {
      if (generation !== mapFetchGenerationRef.current || isAbortError(err)) return;
      const message =
        err instanceof ApiError
          ? err.message
          : t("dashboard.errors.loadMap");
      setError(message);
      setAllReports([]);
    } finally {
      if (generation === mapFetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchActiveCrises(controller.signal)
      .then((crises) => {
        if (controller.signal.aborted) return;
        setCrisisEvents(crises);
        if (crises.length > 0) {
          setSelectedCrisisId((current) => current || crises[0].id);
        } else {
          setSelectedCrisisId("");
          setAllReports([]);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        const message =
          err instanceof ApiError
            ? err.message
            : t("dashboard.errors.loadCrises");
        setError(message);
        setCrisisEvents([]);
        setLoading(false);
      });

    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (!selectedCrisisId) return;
    const controller = new AbortController();
    const generation = ++mapFetchGenerationRef.current;
    const crisisId = selectedCrisisId;

    setLoading(true);
    setError(null);
    setAllReports([]);

    fetchCrisisMap(crisisId, { status: "all" }, controller.signal)
      .then((mapData) => {
        if (generation !== mapFetchGenerationRef.current) return;
        setError(null);
        setAllReports(mapFeaturesToPins(mapData.features));
      })
      .catch((err) => {
        if (generation !== mapFetchGenerationRef.current || isAbortError(err)) return;
        const message =
          err instanceof ApiError
            ? err.message
            : t("dashboard.errors.loadMap");
        setError(message);
        setAllReports([]);
      })
      .finally(() => {
        if (generation === mapFetchGenerationRef.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedCrisisId, t]);

  useEffect(() => {
    if (!selectedCrisisId || loading) return;
    if (centeredCrisisRef.current === selectedCrisisId) return;

    const crisis = crisisEvents.find((c) => c.id === selectedCrisisId);
    if (!crisis) return;

    let lat = crisis.epicenter_lat;
    let lng = crisis.epicenter_lng;

    if (!hasValidEpicenter(lat, lng)) {
      const centroid = reportsCentroid(allReports);
      if (!centroid) return;
      lat = centroid.lat;
      lng = centroid.lng;
    }

    const radiusMeters =
      allReports.length > 0
        ? radiusForReports(allReports, lat, lng)
        : DEFAULT_RADIUS_METERS;

    centeredCrisisRef.current = selectedCrisisId;
    setViewport((v) => ({ ...v, lat, lng, radiusMeters }));
  }, [selectedCrisisId, crisisEvents, allReports, loading]);

  const handleRefresh = () => {
    if (selectedCrisisId) {
      void loadData(selectedCrisisId);
    }
  };

  const handleLocate = async () => {
    setLocating(true);
    setError(null);
    setPinDropMode(false);

    try {
      const coords = await getCurrentLocation();
      setViewport((v) => ({
        ...v,
        lat: coords.latitude,
        lng: coords.longitude,
      }));
      void autoDetectLanguageFromLocation(coords.latitude, coords.longitude);
      try {
        const geo = await fetchReverseGeocode(coords.latitude, coords.longitude);
        setPickedLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          label: geo.display_name ?? t("wizard.currentLocation"),
          source: "gps",
        });
        setAddressQuery(geo.display_name ?? "");
      } catch {
        setPickedLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          label: t("wizard.currentLocation"),
          source: "gps",
        });
      }
    } catch (err) {
      const message =
        err instanceof GeolocationError
          ? t("dashboard.errors.geolocation")
          : t("dashboard.errors.geolocation");
      setError(message);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    const query = addressQuery.trim();
    if (query.length < 2) {
      setPlaceResults([]);
      setSearchingPlaces(false);
      return;
    }

    const controller = new AbortController();
    setSearchingPlaces(true);

    const timer = window.setTimeout(() => {
      searchPlaces(query, 5, controller.signal)
        .then((results) => setPlaceResults(results))
        .catch((err) => {
          if (err.name === "AbortError") return;
          setPlaceResults([]);
        })
        .finally(() => setSearchingPlaces(false));
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [addressQuery]);

  const applyPickedLocation = useCallback((pick: PickedMapLocation) => {
    setPickedLocation(pick);
    setViewport((v) => ({ ...v, lat: pick.lat, lng: pick.lng }));
    setPinDropMode(false);
    setPlaceResults([]);
  }, []);

  const selectSearchedPlace = (place: PlaceSearchResult) => {
    applyPickedLocation({
      lat: place.latitude,
      lng: place.longitude,
      label: place.display_name,
      source: "search",
    });
    setAddressQuery(place.display_name);
  };

  const resolveMapPickLabel = async (lat: number, lng: number) => {
    try {
      const geo = await fetchReverseGeocode(lat, lng);
      return geo.display_name ?? t("map.pickedLocation");
    } catch {
      return t("map.pickedLocation");
    }
  };

  const handleMapPick = (lat: number, lng: number) => {
    void resolveMapPickLabel(lat, lng).then((label) => {
      applyPickedLocation({
        lat,
        lng,
        label,
        source: "map",
      });
      setAddressQuery(label);
    });
  };

  const handleBuildingPick = (pick: BuildingPick) => {
    applyPickedLocation({
      lat: pick.lat,
      lng: pick.lng,
      label: pick.label,
      buildingFootprintId: pick.buildingId || undefined,
      source: "building",
    });
    setAddressQuery(pick.label);
  };

  const handleReportAtLocation = () => {
    if (!pickedLocation) return;
    const prefill: ReportLocationPrefill = {
      latitude: pickedLocation.lat,
      longitude: pickedLocation.lng,
      placeLabel: pickedLocation.label,
      locationMethod: pickedLocation.source === "gps" ? "gps" : "manual",
      crisisId: selectedCrisisId || undefined,
      buildingFootprintId: pickedLocation.buildingFootprintId,
    };
    navigate("/report", { state: { locationPrefill: prefill } });
  };

  const selectedCrisis = crisisEvents.find((c) => c.id === selectedCrisisId);

  return (
    <div className="flex h-full flex-col">
      <Header onRefresh={handleRefresh} loading={loading} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
          <CollapsiblePanel
            side="left"
            open={searchPanelOpen}
            onToggle={() => setSearchPanelOpen((open) => !open)}
            width={300}
            title={t("dashboard.crisisSearchArea")}
            expandLabel={t("panels.expandSearch")}
            collapseLabel={t("panels.collapseSearch")}
            icon={<Radar className="h-4 w-4" />}
          >
            <div className="p-4">
              {crisisEvents.length > 0 ? (
                <label className="mb-3 block text-xs text-slate-400">
                  {t("dashboard.activeCrisis")}
                  <select
                    value={selectedCrisisId}
                    disabled={loading}
                    onChange={(e) => {
                      centeredCrisisRef.current = null;
                      setSelectedCrisisId(e.target.value);
                      setSelectedReport(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  >
                    {crisisEvents.map((crisis) => (
                      <option key={crisis.id} value={crisis.id}>
                        {crisis.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mb-3 text-xs text-amber-400/90">
                  {t("dashboard.noActiveCrises")}
                </p>
              )}

              {selectedCrisis && (
                <p className="mb-3 text-xs text-slate-500">
                  {selectedCrisis.crisis_subtype} ·{" "}
                  {new Date(selectedCrisis.onset_at).toLocaleDateString()}
                </p>
              )}

              <label className="mb-3 block text-xs text-slate-400">
                {t("dashboard.radius")}
                <select
                  value={viewport.radiusMeters}
                  onChange={(e) =>
                    setViewport((v) => ({
                      ...v,
                      radiusMeters: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  {RADIUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(radiusLabelKey(opt.value))}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleLocate}
                disabled={locating}
                className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
              >
                <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} />
                {locating ? t("dashboard.locating") : t("dashboard.useMyLocation")}
              </button>

              <div className="mb-3 border-t border-surface-border pt-3">
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  {t("dashboard.searchLocation")}
                </label>
                <input
                  type="search"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  placeholder={t("dashboard.searchLocationPlaceholder")}
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
                  autoComplete="off"
                />
                {searchingPlaces && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {t("wizard.searchingPlaces")}
                  </p>
                )}
                {placeResults.length > 0 && (
                  <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-surface-border bg-surface">
                    {placeResults.map((place) => (
                      <li key={`${place.place_id ?? place.display_name}-${place.latitude}`}>
                        <button
                          type="button"
                          onClick={() => selectSearchedPlace(place)}
                          className="w-full px-3 py-2 text-start text-xs text-slate-200 transition hover:bg-surface-raised"
                        >
                          {place.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPinDropMode((active) => !active)}
                className={`mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  pinDropMode
                    ? "border-orange-500 bg-orange-500/15 text-orange-200"
                    : "border-surface-border bg-surface text-slate-200 hover:border-slate-500 hover:bg-surface-raised"
                }`}
              >
                <MapPin className="h-4 w-4" />
                {pinDropMode ? t("dashboard.pinDropActive") : t("dashboard.dropPin")}
              </button>

              {pickedLocation ? (
                <div className="mb-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {t("dashboard.selectedLocation")}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-white">
                    {pickedLocation.label}
                  </p>
                </div>
              ) : (
                <p className="mb-3 text-xs text-slate-500">
                  {t("dashboard.noLocationSelected")}
                </p>
              )}

              <button
                type="button"
                onClick={handleReportAtLocation}
                disabled={!pickedLocation || !selectedCrisisId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/15 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("dashboard.reportAtLocation")}
              </button>
            </div>
          </CollapsiblePanel>

          <main className="relative min-h-[360px] min-w-0 flex-1 xl:min-h-0">
            {error && (
              <div className="absolute left-4 right-4 top-4 z-[1000] rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-panel">
                {error}
              </div>
            )}

            <div className="absolute inset-0">
            <CrisisMap
              viewport={viewport}
              reports={reportsInRange}
              fitReports={allReports}
              selectedReportId={selectedReport?.id}
              crisisName={selectedCrisis?.name}
              mapFocusKey={selectedCrisisId}
              loading={loading}
              loadingLabel={
                selectedCrisis?.name
                  ? t("dashboard.loadingReportsFor", { crisis: selectedCrisis.name })
                  : t("dashboard.loadingReports")
              }
              layoutKey={`${searchPanelOpen}-${feedPanelOpen}`}
              pinDropActive={pinDropMode}
              pickedLocation={pickedLocation}
              onMapPick={handleMapPick}
              onBuildingPick={handleBuildingPick}
              onSelectReport={setSelectedReport}
              onSelectReportVersion={(reportId) => {
                setSelectedReport((prev) =>
                  prev ? { ...prev, id: reportId } : prev,
                );
              }}
              onClearReport={() => setSelectedReport(null)}
              onReportDeleted={() => {
                setSelectedReport(null);
                if (selectedCrisisId) {
                  void loadData(selectedCrisisId);
                }
              }}
            />
            </div>

            {pinDropMode && (
              <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-lg border border-orange-500/40 bg-orange-950/90 px-4 py-2 text-xs text-orange-100 shadow-panel">
                {t("dashboard.pinDropHint")}
              </div>
            )}

            {pickedLocation && (
              <div className="absolute bottom-4 right-4 z-[1000] max-w-[280px] rounded-lg border border-surface-border bg-surface-raised/95 p-3 shadow-panel backdrop-blur">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {t("dashboard.selectedLocation")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-white">
                  {pickedLocation.label}
                </p>
                <button
                  type="button"
                  onClick={handleReportAtLocation}
                  disabled={!selectedCrisisId}
                  className="mt-2.5 w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-muted disabled:opacity-40"
                >
                  {t("dashboard.reportAtLocation")}
                </button>
              </div>
            )}

            <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised/95 px-3 py-2 text-xs text-slate-400 backdrop-blur">
              <Crosshair className="h-3.5 w-3.5" />
              {loading
                ? t("dashboard.loadingReports")
                : reportsInRange.length > 0
                  ? t("dashboard.mapReportsEpicenter", { count: reportsInRange.length })
                  : t("dashboard.mapZoomBuildings")}
            </div>
          </main>

          <CollapsiblePanel
            side="right"
            open={feedPanelOpen}
            onToggle={() => setFeedPanelOpen((open) => !open)}
            width={340}
            title={t("activityFeed.title")}
            expandLabel={t("panels.expandFeed")}
            collapseLabel={t("panels.collapseFeed")}
            icon={<LiveActivityFeedIcon />}
          >
            <LiveActivityFeed
              reports={reportsInRange}
              selectedId={selectedReport?.id}
              onSelect={setSelectedReport}
              loading={loading}
              centerLat={viewport.lat}
              centerLng={viewport.lng}
            />
          </CollapsiblePanel>
        </div>
      </div>
    </div>
  );
}
