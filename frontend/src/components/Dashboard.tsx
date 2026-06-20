import { Crosshair } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
} from "../lib/constants";
import {
  filterReportsInRadius,
  hasValidEpicenter,
  radiusForReports,
  reportsCentroid,
} from "../lib/geo";
import { GeolocationError, getCurrentLocation } from "../lib/geolocation";
import {
  filterReportsByDamage,
  sortReports,
  type DamageFilter,
  type ReportSort,
} from "../lib/reportFilters";
import type { MapViewport } from "../types/crisis";
import type { PickedMapLocation } from "../types/location";
import type { Crisis, MapFeatureCollection, MapReportPin } from "../types/report";
import type { BuildingPick } from "./BuildingFootprints";
import CrisisMap from "./CrisisMap";
import CrisisSearchRail from "./CrisisSearchRail";
import DashboardHeader from "./DashboardHeader";
import LiveActivityFeed from "./LiveActivityFeed";

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

export default function Dashboard() {
  const { t } = useTranslation();
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
  const [railOpen, setRailOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedMapLocation | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [damageFilter, setDamageFilter] = useState<DamageFilter>("all");
  const [reportSort, setReportSort] = useState<ReportSort>("newest");
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

  const filteredReports = useMemo(
    () => filterReportsByDamage(reportsInRange, damageFilter),
    [reportsInRange, damageFilter],
  );

  const sortedFeedReports = useMemo(
    () =>
      sortReports(filteredReports, reportSort, viewport.lat, viewport.lng),
    [filteredReports, reportSort, viewport.lat, viewport.lng],
  );

  const loadData = useCallback(
    async (crisisId: string) => {
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
          err instanceof ApiError ? err.message : t("dashboard.errors.loadMap");
        setError(message);
        setAllReports([]);
      } finally {
        if (generation === mapFetchGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [t],
  );

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
          err instanceof ApiError ? err.message : t("dashboard.errors.loadCrises");
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
          err instanceof ApiError ? err.message : t("dashboard.errors.loadMap");
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

    if (lat == null || lng == null) return;

    const radiusMeters =
      allReports.length > 0
        ? radiusForReports(allReports, lat, lng)
        : DEFAULT_RADIUS_METERS;

    centeredCrisisRef.current = selectedCrisisId;
    setViewport((v) => ({ ...v, lat, lng, radiusMeters }));
  }, [selectedCrisisId, crisisEvents, allReports, loading]);

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

  const handleSelectReport = (report: MapReportPin) => {
    setSelectedReport(report);
    setFeedOpen(false);
  };

  const handleCrisisChange = (crisisId: string) => {
    centeredCrisisRef.current = null;
    setSelectedCrisisId(crisisId);
    setSelectedReport(null);
  };

  const handleTogglePinDrop = () => {
    setPinDropMode((active) => !active);
  };

  const selectedCrisis = crisisEvents.find((c) => c.id === selectedCrisisId);

  const mapChipLabel = loading
    ? t("dashboard.loadingReports")
    : t("dashboard.mapReportsEpicenter", { count: filteredReports.length });

  return (
    <div className="dashboard-app">
      <DashboardHeader
        onRailToggle={() => setRailOpen((open) => !open)}
        onFeedToggle={() => setFeedOpen((open) => !open)}
      />

      <aside className={`dashboard-rail${railOpen ? " open" : ""}`}>
        <CrisisSearchRail
          crisisEvents={crisisEvents}
          selectedCrisisId={selectedCrisisId}
          selectedCrisis={selectedCrisis}
          loading={loading}
          radiusMeters={viewport.radiusMeters}
          reportsInRangeCount={filteredReports.length}
          pickedLocation={pickedLocation}
          addressQuery={addressQuery}
          placeResults={placeResults}
          searchingPlaces={searchingPlaces}
          pinDropMode={pinDropMode}
          locating={locating}
          onCrisisChange={handleCrisisChange}
          onAddressQueryChange={setAddressQuery}
          onSelectPlace={selectSearchedPlace}
          onLocate={() => void handleLocate()}
          onTogglePinDrop={handleTogglePinDrop}
          onApplyRadius={(radiusMeters) =>
            setViewport((v) => ({ ...v, radiusMeters }))
          }
        />
      </aside>

      <main className="dashboard-stage">
        <div className="dashboard-cmap">
          {error && <div className="dashboard-error">{error}</div>}

          <CrisisMap
            viewport={viewport}
            reports={filteredReports}
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
            layoutKey={`${railOpen}-${feedOpen}`}
            pinDropActive={pinDropMode}
            pickedLocation={pickedLocation}
            onMapPick={handleMapPick}
            onBuildingPick={handleBuildingPick}
            onSelectReport={handleSelectReport}
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

          {pinDropMode && (
            <div className="pin-drop-banner">{t("dashboard.pinDropHint")}</div>
          )}

          <div className="map-chip">
            <Crosshair strokeWidth={2} />
            <span>{mapChipLabel}</span>
          </div>
        </div>
      </main>

      <aside className={`dashboard-feed${feedOpen ? " open" : ""}`}>
        <LiveActivityFeed
          reports={sortedFeedReports}
          selectedId={selectedReport?.id}
          onSelect={handleSelectReport}
          loading={loading}
          centerLat={viewport.lat}
          centerLng={viewport.lng}
          damageFilter={damageFilter}
          onDamageFilterChange={setDamageFilter}
          sort={reportSort}
          onSortChange={setReportSort}
        />
      </aside>
    </div>
  );
}
