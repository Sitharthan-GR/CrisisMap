import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  fetchReverseGeocode,
  searchPlaces,
  adminFetchFormTemplates,
  type PlaceSearchResult,
} from "../api/client";
import { getAdminToken } from "../lib/adminAuth";
import { resolveGeocodeLabel } from "../lib/address";
import { getCurrentLocation } from "../lib/geolocation";
import type { FormTemplate } from "../types/formTemplate";
import type { Crisis, CrisisType, ReportDetail } from "../types/report";
import ReportLocationPicker from "./ReportLocationPicker";

const CRISIS_TYPES: CrisisType[] = [
  "natural_hazard",
  "technological",
  "human_made",
];

function defaultOnsetLocal(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export interface CrisisPanelValues {
  name: string;
  crisisType: CrisisType;
  crisisSubtype: string;
  onsetAt: string;
  latitude: string;
  longitude: string;
  formTemplateId: string | null;
}

interface AdminCrisisPanelProps {
  open: boolean;
  editingCrisis: Crisis | null;
  fromReport: ReportDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: CrisisPanelValues) => void;
}

export default function AdminCrisisPanel({
  open,
  editingCrisis,
  fromReport,
  loading,
  error,
  onClose,
  onSave,
}: AdminCrisisPanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [crisisType, setCrisisType] = useState<CrisisType>("natural_hazard");
  const [crisisSubtype, setCrisisSubtype] = useState("");
  const [onsetAt, setOnsetAt] = useState(defaultOnsetLocal);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "detecting" | "detected" | "failed"
  >("idle");
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [formTemplateId, setFormTemplateId] = useState<string | null>(null);
  const [addressResolving, setAddressResolving] = useState(false);
  const [addressLookupFailed, setAddressLookupFailed] = useState(false);
  const gpsAttemptedRef = useRef(false);
  const geocodeAttemptedKeyRef = useRef("");

  const coordsKey = (lat: number, lng: number) =>
    `${lat.toFixed(6)},${lng.toFixed(6)}`;

  const resolveAddressForCoords = useCallback(
    async (lat: number, lng: number, signal?: AbortSignal) => {
      const key = coordsKey(lat, lng);
      if (geocodeAttemptedKeyRef.current === key) return;

      geocodeAttemptedKeyRef.current = key;
      setAddressResolving(true);
      setAddressLookupFailed(false);
      try {
        const geo = await fetchReverseGeocode(lat, lng, signal);
        const label = resolveGeocodeLabel(geo, "");
        if (label) {
          setPlaceLabel(label);
          setAddressQuery(label);
        } else {
          setAddressLookupFailed(true);
        }
      } catch {
        setAddressLookupFailed(true);
      } finally {
        setAddressResolving(false);
      }
    },
    [],
  );

  const resetLocation = useCallback(() => {
    setLatitude("");
    setLongitude("");
    setPlaceLabel("");
    setLocationStatus("idle");
    setAddressQuery("");
    setPlaceResults([]);
    setAddressLookupFailed(false);
    geocodeAttemptedKeyRef.current = "";
    gpsAttemptedRef.current = false;
  }, []);

  const detectLocation = useCallback(async () => {
    setLocationStatus("detecting");
    try {
      const coords = await getCurrentLocation();
      setLatitude(coords.latitude.toFixed(6));
      setLongitude(coords.longitude.toFixed(6));
      setLocationStatus("detected");
      geocodeAttemptedKeyRef.current = "";
      await resolveAddressForCoords(coords.latitude, coords.longitude);
    } catch {
      setLocationStatus("failed");
      setPlaceLabel("");
    }
  }, [resolveAddressForCoords]);

  useEffect(() => {
    if (!open) return;
    const token = getAdminToken();
    if (!token) return;
    void adminFetchFormTemplates(token)
      .then(setFormTemplates)
      .catch(() => setFormTemplates([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (editingCrisis) {
      setName(editingCrisis.name);
      setCrisisType(editingCrisis.crisis_type);
      setCrisisSubtype(editingCrisis.crisis_subtype);
      setOnsetAt(toLocalDatetimeValue(editingCrisis.onset_at));
      setFormTemplateId(editingCrisis.form_template_id ?? null);
      const lat = editingCrisis.epicenter_lat;
      const lng = editingCrisis.epicenter_lng;
      if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
        setLatitude(String(lat));
        setLongitude(String(lng));
        setLocationStatus("detected");
        setPlaceLabel("");
        setAddressQuery("");
        setAddressLookupFailed(false);
        geocodeAttemptedKeyRef.current = "";
        void resolveAddressForCoords(lat, lng);
      } else {
        resetLocation();
      }
      return;
    }

    setName("");
    setCrisisType("natural_hazard");
    setCrisisSubtype(fromReport?.nature_of_crisis ?? "");
    setOnsetAt(defaultOnsetLocal());
    setFormTemplateId(null);

    if (fromReport?.location?.latitude != null && fromReport.location.longitude != null) {
      const lat = fromReport.location.latitude;
      const lng = fromReport.location.longitude;
      setLatitude(String(lat));
      setLongitude(String(lng));
      setLocationStatus("detected");
      setPlaceLabel("");
      setAddressQuery("");
      setAddressLookupFailed(false);
      geocodeAttemptedKeyRef.current = "";
      void resolveAddressForCoords(lat, lng);
    } else {
      resetLocation();
      if (!gpsAttemptedRef.current) {
        gpsAttemptedRef.current = true;
        void detectLocation();
      }
    }
  }, [open, editingCrisis, fromReport, resetLocation, detectLocation, resolveAddressForCoords]);

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

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const selectPlace = (place: PlaceSearchResult) => {
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    setPlaceLabel(place.display_name);
    setLocationStatus("detected");
    setAddressQuery(place.display_name);
    setAddressLookupFailed(false);
    geocodeAttemptedKeyRef.current = coordsKey(place.latitude, place.longitude);
    setPlaceResults([]);
  };

  const handleMapPick = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setLocationStatus("detected");
    geocodeAttemptedKeyRef.current = "";
    void resolveAddressForCoords(lat, lng);
  };

  const title = editingCrisis
    ? t("admin.editCrisis")
    : fromReport
      ? t("admin.newCrisisFromReport")
      : t("admin.newCrisis");

  const saveLabel = editingCrisis
    ? t("admin.saveChanges")
    : t("admin.createButton");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      name,
      crisisType,
      crisisSubtype,
      onsetAt,
      latitude,
      longitude,
      formTemplateId,
    });
  };

  return (
    <>
      <div
        className={`admin-scrim ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`admin-panel ${open ? "show" : ""}`}
        aria-hidden={!open}
        aria-labelledby="admin-panel-title"
      >
        <div className="admin-panel-head">
          <h2 id="admin-panel-title">{title}</h2>
          <button
            type="button"
            className="icon-btn sm"
            onClick={onClose}
            aria-label={t("admin.cancel")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form
          id="admin-crisis-form"
          className="admin-panel-body"
          onSubmit={handleSubmit}
        >
          <div className="admin-fieldset">
            <label className="label" htmlFor="admin-f-name">
              {t("admin.fieldName")}
            </label>
            <input
              id="admin-f-name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.namePlaceholder")}
              required
              maxLength={200}
            />
          </div>

          <div className="admin-grid-2">
            <div className="admin-fieldset">
              <label className="label" htmlFor="admin-f-type">
                {t("admin.fieldType")}
              </label>
              <select
                id="admin-f-type"
                className="field"
                value={crisisType}
                onChange={(e) => setCrisisType(e.target.value as CrisisType)}
                disabled={Boolean(editingCrisis)}
              >
                {CRISIS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`admin.crisisType.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-fieldset">
              <label className="label" htmlFor="admin-f-sub">
                {t("admin.fieldSubtype")}
              </label>
              <input
                id="admin-f-sub"
                className="field"
                value={crisisSubtype}
                onChange={(e) => setCrisisSubtype(e.target.value)}
                placeholder={t("admin.subtypePlaceholder")}
                required
                maxLength={50}
                disabled={Boolean(editingCrisis)}
              />
            </div>
          </div>

          <div className="admin-fieldset">
            <label className="label" htmlFor="admin-f-onset">
              {t("admin.fieldOnset")}
            </label>
            <input
              id="admin-f-onset"
              className="field"
              type="datetime-local"
              value={onsetAt}
              onChange={(e) => setOnsetAt(e.target.value)}
              required
              disabled={Boolean(editingCrisis)}
            />
          </div>

          <div className="admin-fieldset">
            <label className="label" htmlFor="admin-f-form">
              {t("admin.fieldFormTemplate")}
            </label>
            <select
              id="admin-f-form"
              className="field"
              value={formTemplateId ?? ""}
              onChange={(e) =>
                setFormTemplateId(e.target.value ? e.target.value : null)
              }
            >
              <option value="">{t("admin.defaultFormTemplate")}</option>
              {formTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <p className="admin-field-hint">
              {t("admin.formTemplateHint")}{" "}
              <Link to="/admin/forms">{t("admin.manageForms")}</Link>
            </p>
          </div>

          <div className="admin-fieldset">
            <ReportLocationPicker
              title={t("admin.fieldLocation")}
              subtitle={t("admin.locationHint")}
              latitude={latitude}
              longitude={longitude}
              placeLabel={placeLabel}
              locationStatus={locationStatus}
              addressQuery={addressQuery}
              placeResults={placeResults}
              searchingPlaces={searchingPlaces}
              onAddressQueryChange={setAddressQuery}
              onSelectPlace={selectPlace}
              onMapPick={handleMapPick}
              onUseGps={() => void detectLocation()}
              resolvingAddress={addressResolving}
              addressLookupFailed={addressLookupFailed}
            />
          </div>

          {error && (
            <p style={{ color: "var(--dmg-complete-ink)", fontSize: "14px" }}>
              {error}
            </p>
          )}
        </form>

        <div className="admin-panel-foot">
          <button type="button" className="btn btn-block" onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button
            type="submit"
            form="admin-crisis-form"
            className="btn btn-primary btn-block"
            disabled={loading || !name.trim() || !crisisSubtype.trim()}
          >
            {loading ? t("admin.creating") : saveLabel}
          </button>
        </div>
      </aside>
    </>
  );
}
