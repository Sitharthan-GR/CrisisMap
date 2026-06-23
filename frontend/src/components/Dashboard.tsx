import { CircleHelp, Crosshair, MapPin, MapPinPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ApiError,
  fetchActiveCrises,
  fetchAllCrisesMap,
  fetchCrisisMap,
  fetchReportDetail,
  fetchReverseGeocode,
  isAbortError,
  searchPlaces,
  type PlaceSearchResult,
} from "../api/client";
import { autoDetectLanguageFromLocation, tryInitialLocationLanguage } from "../i18n";
import {
  ALL_CRISES_ID,
  DEFAULT_CENTER,
  DEFAULT_RADIUS_METERS,
} from "../lib/constants";
import {
  distanceMeters,
  filterReportsInRadius,
  findNearestCrisisId,
  findNearestCrisisWithDistance,
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
import type { MapFlyRequest, MapViewport } from "../types/crisis";
import type { PickedMapLocation } from "../types/location";
import type { Crisis, MapFeatureCollection, MapReportPin, ReportDetail } from "../types/report";
import type { BuildingPick } from "./BuildingFootprints";
import CrisisMap from "./CrisisMap";
import CrisisSearchRail from "./CrisisSearchRail";
import DashboardHeader from "./DashboardHeader";
import LiveActivityFeed from "./LiveActivityFeed";
import { useMobileNav } from "../lib/MobileNavContext";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../lib/useMediaQuery";
import { useDistanceSystem } from "../lib/useDistanceSystem";
import {
  displayValueToMeters,
  formatDistance,
  formatRadiusLabel,
  inferDistanceSystem,
  type DistanceSystem,
} from "../lib/units";

function reportDetailToPin(detail: ReportDetail): MapReportPin | null {
  if (!detail.location) return null;
  return {
    id: detail.id,
    locationId: detail.location_id,
    latitude: detail.location.latitude,
    longitude: detail.location.longitude,
    damageLevel: detail.damage_level,
    infraType: detail.infra_type,
    natureOfCrisis: detail.nature_of_crisis,
    reportCount: 1,
    adminLevel2: detail.location.admin_level_2,
  };
}

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
    natureOfCrisis: feature.properties.nature_of_crisis,
    reportCount: feature.properties.report_count,
    adminLevel2: feature.properties.admin_level_2,
    thumbnail: feature.properties.latest_photo_thumbnail,
  }));
}

const LOCAL_AREA_RADIUS_DISPLAY = 50;

interface RemoteAreaNotice {
  radiusLabel: string;
  nearestCrisisId?: string;
  nearestCrisisName?: string;
  nearestDistanceMeters?: number;
  noActiveCrises?: boolean;
}

function resolveNoCrisisNearbyNotice(
  lat: number,
  lng: number,
  distanceSystem: DistanceSystem,
  crisisEvents: Crisis[],
): RemoteAreaNotice | null {
  const listedCrises = crisisEvents.filter(
    (c) => !c.is_unlisted && c.status === "active",
  );

  const thresholdMeters = displayValueToMeters(
    LOCAL_AREA_RADIUS_DISPLAY,
    distanceSystem,
  );
  const radiusLabel = formatRadiusLabel(thresholdMeters, distanceSystem);

  if (listedCrises.length === 0) {
    return { radiusLabel, noActiveCrises: true };
  }

  const crisisNearby = listedCrises.some((c) => {
    if (!hasValidEpicenter(c.epicenter_lat, c.epicenter_lng)) return false;
    return (
      distanceMeters(lat, lng, c.epicenter_lat!, c.epicenter_lng!) <=
      thresholdMeters
    );
  });
  if (crisisNearby) return null;

  const nearest = findNearestCrisisWithDistance(listedCrises, lat, lng);
  if (nearest) {
    return {
      radiusLabel,
      nearestCrisisId: nearest.crisis.id,
      nearestCrisisName: nearest.crisis.name,
      nearestDistanceMeters: nearest.distanceMeters,
    };
  }

  const fallbackId = findNearestCrisisId(listedCrises, lat, lng);
  const fallbackCrisis = listedCrises.find((c) => c.id === fallbackId);
  if (!fallbackCrisis) {
    return { radiusLabel, noActiveCrises: true };
  }

  let nearestDistanceMeters: number | undefined;
  if (hasValidEpicenter(fallbackCrisis.epicenter_lat, fallbackCrisis.epicenter_lng)) {
    nearestDistanceMeters = distanceMeters(
      lat,
      lng,
      fallbackCrisis.epicenter_lat!,
      fallbackCrisis.epicenter_lng!,
    );
  }

  return {
    radiusLabel,
    nearestCrisisId: fallbackCrisis.id,
    nearestCrisisName: fallbackCrisis.name,
    nearestDistanceMeters,
  };
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reportId: sharedReportId } = useParams<{ reportId?: string }>();
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
  const distanceSystem = useDistanceSystem(viewport.lat, viewport.lng);
  const { panel: mobilePanel, setPanel: setMobilePanel, setFeedCount } = useMobileNav();
  const [railOpen, setRailOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedMapLocation | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [awaitingPinReport, setAwaitingPinReport] = useState(false);
  const [remoteAreaNotice, setRemoteAreaNotice] = useState<RemoteAreaNotice | null>(null);
  const [mapNavNonce, setMapNavNonce] = useState(0);
  const [mapFlyRequest, setMapFlyRequest] = useState<MapFlyRequest | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [damageFilter, setDamageFilter] = useState<DamageFilter>("all");
  const [reportSort, setReportSort] = useState<ReportSort>("newest");
  const centeredCrisisRef = useRef<string | null>(null);
  const mapFetchGenerationRef = useRef(0);
  const initialLangDetectRef = useRef(false);
  const sharedReportTargetRef = useRef<ReportDetail | null>(null);
  const sharedReportIdRef = useRef(sharedReportId);
  sharedReportIdRef.current = sharedReportId;

  const isAllCrisesMode = selectedCrisisId === ALL_CRISES_ID;

  const nearestCrisisId = useMemo(
    () => findNearestCrisisId(crisisEvents, viewport.lat, viewport.lng),
    [crisisEvents, viewport.lat, viewport.lng],
  );

  const reportsInRange = useMemo(
    () => {
      if (isAllCrisesMode) return allReports;
      return filterReportsInRadius(
        allReports,
        viewport.lat,
        viewport.lng,
        viewport.radiusMeters,
      );
    },
    [allReports, viewport, isAllCrisesMode],
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
        const mapData =
          crisisId === ALL_CRISES_ID
            ? await fetchAllCrisesMap(crisisEvents, { status: "all" })
            : await fetchCrisisMap(crisisId, { status: "all" });
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
    [crisisEvents, t],
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

        const pickInitialCrisis = () => {
          setSelectedCrisisId((current) => current || ALL_CRISES_ID);
        };

        void resolveApproxUserLocation({
          latitude: DEFAULT_CENTER.lat,
          longitude: DEFAULT_CENTER.lng,
        }).then(() => {
          if (controller.signal.aborted) return;
          if (sharedReportIdRef.current) return;
          pickInitialCrisis();
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
    if (!sharedReportId) {
      sharedReportTargetRef.current = null;
      return;
    }

    // Marker/feed click already selected this report — URL sync only, no refetch.
    if (selectedReport?.id === sharedReportId) {
      return;
    }

    const controller = new AbortController();
    fetchReportDetail(sharedReportId, controller.signal)
      .then((detail) => {
        centeredCrisisRef.current = null;
        sharedReportTargetRef.current = detail;

        if (detail.crisis_id === selectedCrisisId || selectedCrisisId === ALL_CRISES_ID) {
          const pin =
            allReports.find((report) => report.id === detail.id) ??
            reportDetailToPin(detail);
          if (pin) {
            setSelectedReport(pin);
            setViewport((current) => ({
              ...current,
              lat: pin.latitude,
              lng: pin.longitude,
            }));
            if (isMobile) {
              setMobilePanel("map");
            }
          }
          sharedReportTargetRef.current = null;
          return;
        }

        setSelectedCrisisId(detail.crisis_id);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(
          err instanceof ApiError
            ? err.message
            : t("reportDetail.loadFailed"),
        );
        navigate("/", { replace: true });
      });

    return () => controller.abort();
  }, [
    sharedReportId,
    selectedReport?.id,
    selectedCrisisId,
    allReports,
    isMobile,
    navigate,
    setMobilePanel,
    t,
  ]);

  useEffect(() => {
    if (!selectedCrisisId) return;
    const controller = new AbortController();
    const generation = ++mapFetchGenerationRef.current;
    const crisisId = selectedCrisisId;

    setLoading(true);
    setError(null);
    setAllReports([]);

    const fetchMap =
      crisisId === ALL_CRISES_ID
        ? fetchAllCrisesMap(crisisEvents, { status: "all" }, controller.signal)
        : fetchCrisisMap(crisisId, { status: "all" }, controller.signal);

    fetchMap
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
  }, [selectedCrisisId, crisisEvents, t]);

  useEffect(() => {
    const sharedDetail = sharedReportTargetRef.current;
    if (!sharedDetail || loading) return;
    if (
      selectedCrisisId !== ALL_CRISES_ID &&
      selectedCrisisId !== sharedDetail.crisis_id
    ) {
      return;
    }

    const pin =
      allReports.find((report) => report.id === sharedDetail.id) ??
      reportDetailToPin(sharedDetail);

    if (pin) {
      setSelectedReport(pin);
      setViewport((current) => ({
        ...current,
        lat: pin.latitude,
        lng: pin.longitude,
      }));
      if (isMobile) {
        setMobilePanel("map");
      }
    }

    sharedReportTargetRef.current = null;
  }, [allReports, loading, selectedCrisisId, isMobile, setMobilePanel]);

  useEffect(() => {
    if (!selectedCrisisId || loading || isAllCrisesMode) return;
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
  }, [selectedCrisisId, crisisEvents, allReports, loading, isAllCrisesMode]);

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
      setMapFlyRequest({
        lat: coords.latitude,
        lng: coords.longitude,
        zoom: 12,
        nonce: Date.now(),
      });
      void autoDetectLanguageFromLocation(coords.latitude, coords.longitude);
      let distanceSystemForNotice = distanceSystem;
      try {
        const geo = await fetchReverseGeocode(coords.latitude, coords.longitude);
        distanceSystemForNotice = inferDistanceSystem(geo.admin_level_1);
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
      const notice = resolveNoCrisisNearbyNotice(
        coords.latitude,
        coords.longitude,
        distanceSystemForNotice,
        crisisEvents,
      );
      setRemoteAreaNotice(notice);
      setAwaitingPinReport(!notice);
      if (isMobile) {
        setMobilePanel("map");
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
    navigate(`/reports/${report.id}`, { replace: true });
    if (isMobile) {
      setMobilePanel("map");
    } else {
      setFeedOpen(false);
    }
  };

  const handleClearReport = () => {
    setSelectedReport(null);
    navigate("/", { replace: true });
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
    setLoading(true);
    setAllReports([]);
    navigate("/", { replace: true });
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
    setRemoteAreaNotice(null);
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
    setRemoteAreaNotice(null);
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
          locationMethod: pickedLocation.source === "gps" ? "gps" : "manual",
          crisisId: remoteAreaNotice
            ? undefined
            : selectedCrisisId && selectedCrisisId !== ALL_CRISES_ID
              ? selectedCrisisId
              : nearestCrisisId || undefined,
          buildingFootprintId: pickedLocation.buildingFootprintId,
          preferUnlistedCrisis: remoteAreaNotice ? true : undefined,
        },
      },
    });
    setAwaitingPinReport(false);
    setRemoteAreaNotice(null);
  };

  const dismissRemoteAreaModal = () => {
    setRemoteAreaNotice(null);
    setPickedLocation(null);
  };

  const changeLocationFromModal = () => {
    setRemoteAreaNotice(null);
    startPinDrop();
  };

  const goToNearestCrisis = () => {
    if (!remoteAreaNotice?.nearestCrisisId) return;
    const crisis = crisisEvents.find((c) => c.id === remoteAreaNotice.nearestCrisisId);
    if (!crisis || !hasValidEpicenter(crisis.epicenter_lat, crisis.epicenter_lng)) {
      return;
    }

    const targetLat = crisis.epicenter_lat!;
    const targetLng = crisis.epicenter_lng!;

    // Let the post-load effect size the search radius to cover this crisis's reports.
    centeredCrisisRef.current = null;
    setSelectedReport(null);
    setSelectedCrisisId(crisis.id);
    setViewport((v) => ({
      ...v,
      lat: targetLat,
      lng: targetLng,
      radiusMeters: displayValueToMeters(LOCAL_AREA_RADIUS_DISPLAY, distanceSystem),
    }));
    setMapNavNonce((n) => n + 1);
    setMapFlyRequest({
      lat: targetLat,
      lng: targetLng,
      zoom: 11,
      nonce: Date.now(),
    });
    setRemoteAreaNotice(null);
    setAwaitingPinReport(false);
    setPickedLocation(null);
    if (isMobile) {
      setMobilePanel("map");
    }
  };

  const dismissPinReport = () => {
    setAwaitingPinReport(false);
    setRemoteAreaNotice(null);
  };

  const selectedCrisis = crisisEvents.find((c) => c.id === selectedCrisisId);

  const mapChipLabel = loading
    ? t("dashboard.loadingReports")
    : isAllCrisesMode
      ? t("dashboard.mapReportsAllCrises", { count: filteredReports.length })
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
          nearestCrisisId={nearestCrisisId}
          loading={loading}
          radiusMeters={viewport.radiusMeters}
          distanceSystem={distanceSystem}
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
            crises={crisisEvents}
            mapFocusKey={`${selectedCrisisId}:${mapNavNonce}`}
            flyToRequest={mapFlyRequest}
            fitMaxZoom={isAllCrisesMode ? 5 : 13}
            showSearchRadius={!isAllCrisesMode}
            loading={loading}
            loadingLabel={
              isAllCrisesMode
                ? t("dashboard.loadingAllCrises")
                : selectedCrisis?.name
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
              navigate(`/reports/${reportId}`, { replace: true });
            }}
            onClearReport={handleClearReport}
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

          {awaitingPinReport && pickedLocation && !pinDropMode && !remoteAreaNotice && (
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

          {remoteAreaNotice && pickedLocation &&
            createPortal(
              <div
                className="remote-area-scrim"
                role="presentation"
              >
                <div
                  className="export-modal remote-area-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="remote-area-modal-title"
                >
                  <div className="export-modal-head">
                    <div>
                      <h2 id="remote-area-modal-title">
                        {t("dashboard.remoteAreaTitle")}
                      </h2>
                      <p>
                        {remoteAreaNotice.noActiveCrises
                          ? t("dashboard.remoteAreaNoCrises")
                          : t("dashboard.remoteAreaNotice", {
                              radius: remoteAreaNotice.radiusLabel,
                            })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={dismissRemoteAreaModal}
                      className="icon-btn sm"
                      aria-label={t("dashboard.pinDropCancel")}
                    >
                      <X strokeWidth={2.2} aria-hidden />
                    </button>
                  </div>
                  <div className="export-modal-body">
                    <p className="remote-area-modal-hint">
                      {remoteAreaNotice.noActiveCrises
                        ? t("dashboard.remoteAreaNoCrisesHint")
                        : remoteAreaNotice.nearestCrisisName &&
                            remoteAreaNotice.nearestDistanceMeters != null
                          ? t("dashboard.remoteAreaHint", {
                              crisisName: remoteAreaNotice.nearestCrisisName,
                              distance: formatDistance(
                                remoteAreaNotice.nearestDistanceMeters,
                                distanceSystem,
                              ),
                            })
                          : t("dashboard.remoteAreaHintGeneric")}
                    </p>
                    {pickedLocation && (
                      <p className="remote-area-modal-location">
                        <MapPin strokeWidth={2} aria-hidden />
                        <span>
                          {pickedLocation.label.split(",")[0]?.trim() ||
                            pickedLocation.label}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="export-modal-foot remote-area-modal-foot">
                    <button
                      type="button"
                      className="btn"
                      onClick={changeLocationFromModal}
                    >
                      {t("dashboard.pinDropChangeLocation")}
                    </button>
                    {remoteAreaNotice.nearestCrisisId && (
                      <button
                        type="button"
                        className="btn"
                        onClick={goToNearestCrisis}
                      >
                        {t("dashboard.goToNearestCrisis")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={goToReportAtPin}
                    >
                      <MapPinPlus strokeWidth={2.2} aria-hidden />
                      {t("dashboard.reportAtLocation")}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
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

          <Link
            to="/help"
            className="map-help-btn"
            title={t("nav.mapHelp")}
            aria-label={t("nav.mapHelp")}
          >
            <CircleHelp strokeWidth={2} aria-hidden />
          </Link>
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
          distanceSystem={distanceSystem}
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
