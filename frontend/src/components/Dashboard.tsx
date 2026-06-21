import { Crosshair, MapPin, MapPinPlus, X } from "lucide-react";
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
import { autoDetectLanguageFromLocation, tryInitialLocationLanguage } from "../i18n";
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS_METERS,
} from "../lib/constants";
import {
  filterReportsInRadius,
  findNearestCrisisId,
  hasValidEpicenter,
  radiusForReports,
  reportsCentroid,
} from "../lib/geo";
import { GeolocationError, getCurrentLocation, resolveApproxUserLocation } from "../lib/geolocation";
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
import { useMobileNav } from "../lib/MobileNavContext";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../lib/useMediaQuery";

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
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const { panel: mobilePanel, setPanel: setMobilePanel, setFeedCount } = useMobileNav();
  const [railOpen, setRailOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedMapLocation | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [awaitingPinReport, setAwaitingPinReport] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [damageFilter, setDamageFilter] = useState<DamageFilter>("all");
  const [reportSort, setReportSort] = useState<ReportSort>("newest");
  const centeredCrisisRef = useRef<string | null>(null);
  const mapFetchGenerationRef = useRef(0);
  const initialLangDetectRef = useRef(false);

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

  useEffect(() => {
    setFeedCount(filteredReports.length);
  }, [filteredReports.length, setFeedCount]);

  useEffect(() => {
    document.body.classList.toggle("pin-drop-focus", pinDropMode);
    return () => document.body.classList.remove("pin-drop-focus");
  }, [pinDropMode]);

  useEffect(() => {
    if (initialLangDetectRef.current || loading) return;
    if (crisisEvents.length === 0) return;
    initialLangDetectRef.current = true;

    const crisis = crisisEvents.find((c) => c.id === selectedCrisisId) ?? crisisEvents[0];
    let lat = crisis?.epicenter_lat ?? viewport.lat;
    let lng = crisis?.epicenter_lng ?? viewport.lng;
    if (!hasValidEpicenter(lat, lng)) {
      lat = viewport.lat;
      lng = viewport.lng;
    }

    void tryInitialLocationLanguage(lat!, lng!);
  }, [loading, crisisEvents, selectedCrisisId, viewport.lat, viewport.lng]);

  useEffect(() => {
    if (loading || !selectedCrisisId) return;
    const crisis = crisisEvents.find((c) => c.id === selectedCrisisId);
    if (!crisis) return;
    let lat = crisis.epicenter_lat;
    let lng = crisis.epicenter_lng;
    if (!hasValidEpicenter(lat, lng)) return;
    void autoDetectLanguageFromLocation(lat!, lng!);
  }, [selectedCrisisId, crisisEvents, loading]);

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
        if (crises.length === 0) {
          setSelectedCrisisId("");
          setAllReports([]);
          setLoading(false);
          return;
        }

        const pickFromCoords = (lat: number, lng: number) => {
          setSelectedCrisisId(
            (current) =>
              current ||
              findNearestCrisisId(crises, lat, lng) ||
              crises[0].id,
          );
        };

        void resolveApproxUserLocation({
          latitude: DEFAULT_CENTER.lat,
          longitude: DEFAULT_CENTER.lng,
        }).then((resolved) => {
          if (controller.signal.aborted) return;
          pickFromCoords(resolved.latitude, resolved.longitude);
        });
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
      selectNearestCrisis(coords.latitude, coords.longitude);
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

  const applyPickedLocation = useCallback(
    (pick: PickedMapLocation) => {
      setPickedLocation(pick);
      setViewport((v) => ({ ...v, lat: pick.lat, lng: pick.lng }));
      setPinDropMode(false);
      setPlaceResults([]);
      void autoDetectLanguageFromLocation(pick.lat, pick.lng);
      if (crisisEvents.length > 0) {
        const nearestId = findNearestCrisisId(crisisEvents, pick.lat, pick.lng);
        if (nearestId) {
          centeredCrisisRef.current = null;
          setSelectedCrisisId(nearestId);
        }
      }
    },
    [crisisEvents],
  );

  const selectNearestCrisis = useCallback((lat: number, lng: number) => {
    if (crisisEvents.length === 0) return;
    const nearestId = findNearestCrisisId(crisisEvents, lat, lng);
    if (!nearestId) return;
    centeredCrisisRef.current = null;
    setSelectedCrisisId(nearestId);
  }, [crisisEvents]);

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
      const pick: PickedMapLocation = {
        lat,
        lng,
        label,
        source: "map",
      };
      if (pinDropMode) {
        finishPinDrop(pick, label);
      } else {
        applyPickedLocation(pick);
        setAddressQuery(label);
      }
    });
  };

  const handleBuildingPick = (pick: BuildingPick) => {
    const location: PickedMapLocation = {
      lat: pick.lat,
      lng: pick.lng,
      label: pick.label,
      buildingFootprintId: pick.buildingId || undefined,
      source: "building",
    };
    if (pinDropMode) {
      finishPinDrop(location, pick.label);
    } else {
      applyPickedLocation(location);
      setAddressQuery(pick.label);
    }
  };

  const handleSelectReport = (report: MapReportPin) => {
    setSelectedReport(report);
    if (isMobile) {
      setMobilePanel("map");
    } else {
      setFeedOpen(false);
    }
  };

  const handleMobileBackdropClose = () => {
    setMobilePanel("map");
  };

  const railPanelOpen = isMobile ? mobilePanel === "search" : railOpen;
  const feedPanelOpen = isMobile ? mobilePanel === "feed" : feedOpen;

  const handleCrisisChange = (crisisId: string) => {
    centeredCrisisRef.current = null;
    setSelectedCrisisId(crisisId);
    setSelectedReport(null);
  };

  const handleTogglePinDrop = () => {
    if (pinDropMode) {
      cancelPinDrop();
    } else {
      startPinDrop();
    }
  };

  const startPinDrop = () => {
    setPinDropMode(true);
    setAwaitingPinReport(false);
    setSelectedReport(null);
    if (isMobile) {
      setMobilePanel("map");
    } else {
      setRailOpen(false);
      setFeedOpen(false);
    }
  };

  const cancelPinDrop = () => {
    setPinDropMode(false);
    setAwaitingPinReport(false);
  };

  const finishPinDrop = (pick: PickedMapLocation, label: string) => {
    applyPickedLocation(pick);
    setAddressQuery(label);
    setPinDropMode(false);
    setAwaitingPinReport(true);
    if (isMobile) {
      setMobilePanel("map");
    }
  };

  const goToReportAtPin = () => {
    if (!pickedLocation) return;
    navigate("/report", {
      state: {
        locationPrefill: {
          latitude: pickedLocation.lat,
          longitude: pickedLocation.lng,
          placeLabel: pickedLocation.label,
          locationMethod: "manual" as const,
          crisisId: selectedCrisisId || undefined,
          buildingFootprintId: pickedLocation.buildingFootprintId,
        },
      },
    });
    setAwaitingPinReport(false);
  };

  const dismissPinReport = () => {
    setAwaitingPinReport(false);
  };

  const selectedCrisis = crisisEvents.find((c) => c.id === selectedCrisisId);

  const mapChipLabel = loading
    ? t("dashboard.loadingReports")
    : t("dashboard.mapReportsEpicenter", { count: filteredReports.length });

  return (
    <div className={`dashboard-app${pinDropMode ? " pin-drop-focus" : ""}`}>
      <DashboardHeader
        onRailToggle={() => setRailOpen((open) => !open)}
        onFeedToggle={() => setFeedOpen((open) => !open)}
      />

      <aside className={`dashboard-rail${railPanelOpen ? " open" : ""}`}>
        {isMobile && railPanelOpen && <div className="mobile-sheet-handle" aria-hidden />}
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
            layoutKey={`${railPanelOpen}-${feedPanelOpen}-${pinDropMode}`}
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
            <div className="pin-drop-overlay">
              <div className="pin-drop-banner">{t("dashboard.pinDropHint")}</div>
              <button
                type="button"
                className="pin-drop-cancel-btn"
                onClick={cancelPinDrop}
                aria-label={t("dashboard.pinDropCancel")}
              >
                <X strokeWidth={2.2} aria-hidden />
                {t("dashboard.pinDropCancel")}
              </button>
            </div>
          )}

          {awaitingPinReport && pickedLocation && !pinDropMode && (
            <div className="pin-drop-result-bar">
              <div className="pin-drop-result-info">
                <MapPin strokeWidth={2} aria-hidden />
                <span>{pickedLocation.label.split(",")[0]?.trim() || pickedLocation.label}</span>
              </div>
              <div className="pin-drop-result-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm pin-drop-report-btn"
                  onClick={goToReportAtPin}
                >
                  <MapPinPlus strokeWidth={2.2} aria-hidden />
                  {t("dashboard.reportAtLocation")}
                </button>
                <button
                  type="button"
                  className="btn btn-sm pin-drop-change-btn"
                  onClick={startPinDrop}
                >
                  {t("dashboard.pinDropChangeLocation")}
                </button>
                <button
                  type="button"
                  className="icon-btn sm pin-drop-dismiss-btn"
                  onClick={dismissPinReport}
                  aria-label={t("dashboard.pinDropCancel")}
                >
                  <X strokeWidth={2.2} aria-hidden />
                </button>
              </div>
            </div>
          )}

          {!pinDropMode && !awaitingPinReport &&
            (isMobile ? (
              <button
                type="button"
                className="map-chip map-chip-btn"
                onClick={() => setMobilePanel("feed")}
                aria-label={t("panels.expandFeed")}
              >
                <Crosshair strokeWidth={2} />
                <span>{mapChipLabel}</span>
              </button>
            ) : (
              <div className="map-chip">
                <Crosshair strokeWidth={2} />
                <span>{mapChipLabel}</span>
              </div>
            ))}
        </div>
      </main>

      <aside className={`dashboard-feed${feedPanelOpen ? " open" : ""}`}>
        {isMobile && feedPanelOpen && <div className="mobile-sheet-handle" aria-hidden />}
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

      {isMobile && mobilePanel !== "map" && (
        <button
          type="button"
          className="mobile-sheet-backdrop"
          aria-label={t("mobileNav.closePanel")}
          onClick={handleMobileBackdropClose}
        />
      )}
    </div>
  );
}
