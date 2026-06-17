import { Lock, LogOut, Plus, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ApiError,
  adminCreateCrisis,
  adminFetchCrises,
  adminLogin,
  adminUpdateCrisis,
  fetchReverseGeocode,
  searchPlaces,
  type PlaceSearchResult,
} from "../api/client";
import {
  clearAdminToken,
  getAdminToken,
  isAdminAuthenticated,
  setAdminToken,
} from "../lib/adminAuth";
import { getCurrentLocation } from "../lib/geolocation";
import type { Crisis, CrisisStatus, CrisisType } from "../types/report";
import ReportLocationPicker from "./ReportLocationPicker";
import UnlistedReportsPanel from "./UnlistedReportsPanel";

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

function toIsoUtcFromLocal(value: string): string {
  return new Date(value).toISOString();
}

export default function AdminPage() {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [crises, setCrises] = useState<Crisis[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [crisisType, setCrisisType] = useState<CrisisType>("natural_hazard");
  const [crisisSubtype, setCrisisSubtype] = useState("");
  const [onsetAt, setOnsetAt] = useState(defaultOnsetLocal);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "detecting" | "detected" | "failed"
  >("idle");
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const gpsAttemptedRef = useRef(false);

  const resetLocation = useCallback(() => {
    setLatitude("");
    setLongitude("");
    setPlaceLabel("");
    setLocationStatus("idle");
    setAddressQuery("");
    setPlaceResults([]);
    gpsAttemptedRef.current = false;
  }, []);

  const detectLocation = useCallback(async () => {
    setLocationStatus("detecting");
    try {
      const coords = await getCurrentLocation();
      setLatitude(coords.latitude.toFixed(6));
      setLongitude(coords.longitude.toFixed(6));
      setLocationStatus("detected");
      try {
        const geo = await fetchReverseGeocode(coords.latitude, coords.longitude);
        setPlaceLabel(geo.display_name ?? "");
        setAddressQuery(geo.display_name ?? "");
      } catch {
        setPlaceLabel("");
      }
    } catch {
      setLocationStatus("failed");
      setPlaceLabel("");
    }
  }, []);

  useEffect(() => {
    if (!authenticated || gpsAttemptedRef.current) return;
    gpsAttemptedRef.current = true;
    void detectLocation();
  }, [authenticated, detectLocation]);

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

  const selectPlace = (place: PlaceSearchResult) => {
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    setPlaceLabel(place.display_name);
    setLocationStatus("detected");
    setAddressQuery(place.display_name);
    setPlaceResults([]);
  };

  const handleMapPick = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setLocationStatus("detected");
    void fetchReverseGeocode(lat, lng)
      .then((geo) => {
        const label = geo.display_name ?? t("map.pickedLocation");
        setPlaceLabel(label);
        setAddressQuery(label);
      })
      .catch(() => {
        setPlaceLabel(t("map.pickedLocation"));
      });
  };

  const loadCrises = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setAuthenticated(false);
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const data = await adminFetchCrises(token);
      setCrises(data);
      setAuthenticated(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        clearAdminToken();
        setAuthenticated(false);
        return;
      }
      setListError(
        err instanceof ApiError ? err.message : t("admin.errors.loadFailed"),
      );
    } finally {
      setListLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authenticated) {
      void loadCrises();
    }
  }, [authenticated, loadCrises]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const { token } = await adminLogin(password);
      setAdminToken(token);
      setPassword("");
      setAuthenticated(true);
    } catch (err) {
      setLoginError(
        err instanceof ApiError ? err.message : t("admin.errors.loginFailed"),
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setAuthenticated(false);
    setCrises([]);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = getAdminToken();
    if (!token) return;

    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const hasCoords = Boolean(latitude && longitude);
      const created = await adminCreateCrisis(token, {
        name: name.trim(),
        crisis_type: crisisType,
        crisis_subtype: crisisSubtype.trim(),
        onset_at: toIsoUtcFromLocal(onsetAt),
        ...(hasCoords
          ? {
              epicenter_lat: Number(latitude),
              epicenter_lng: Number(longitude),
            }
          : {}),
      });
      setCreateSuccess(t("admin.createSuccess", { name: created.name }));
      setName("");
      setCrisisSubtype("");
      setOnsetAt(defaultOnsetLocal());
      resetLocation();
      void detectLocation();
      await loadCrises();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : t("admin.errors.createFailed"),
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleStatusChange = async (crisisId: string, status: CrisisStatus) => {
    const token = getAdminToken();
    if (!token) return;

    setSavingId(crisisId);
    setListError(null);
    try {
      await adminUpdateCrisis(token, crisisId, { status });
      setCrises((prev) =>
        prev.map((crisis) =>
          crisis.id === crisisId ? { ...crisis, status } : crisis,
        ),
      );
    } catch (err) {
      setListError(
        err instanceof ApiError ? err.message : t("admin.errors.updateFailed"),
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        <header className="border-b border-surface-border bg-surface-raised/80 px-6 py-4">
          <div className="mx-auto flex max-w-lg items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{t("admin.title")}</h1>
                <p className="text-xs text-slate-400">{t("admin.loginSubtitle")}</p>
              </div>
            </div>
            <Link to="/" className="text-sm text-slate-400 hover:text-white">
              {t("nav.backToDashboard")}
            </Link>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-6 py-10">
          <form
            onSubmit={(e) => void handleLogin(e)}
            className="w-full rounded-xl border border-surface-border bg-surface-raised p-6 shadow-panel"
          >
            <label className="block text-sm text-slate-300">
              {t("admin.passwordLabel")}
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-surface-border bg-surface py-2.5 ps-10 pe-3 text-sm text-white outline-none focus:border-accent"
                />
              </div>
            </label>

            {loginError && (
              <p className="mt-3 text-sm text-red-300">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loginLoading || !password}
              className="mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
            >
              {loginLoading ? t("admin.signingIn") : t("admin.signIn")}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="border-b border-surface-border bg-surface-raised/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
              <Shield className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{t("admin.title")}</h1>
              <p className="text-xs text-slate-400">{t("admin.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-slate-400 hover:text-white">
              {t("nav.backToDashboard")}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              {t("admin.signOut")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Plus className="h-4 w-4 text-accent" />
            {t("admin.createCrisis")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("admin.createHint")}</p>

          <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-3">
            <label className="block text-xs text-slate-400">
              {t("admin.fieldName")}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </label>

            <label className="block text-xs text-slate-400">
              {t("admin.fieldType")}
              <select
                value={crisisType}
                onChange={(e) => setCrisisType(e.target.value as CrisisType)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
              >
                {CRISIS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`admin.crisisType.${type}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              {t("admin.fieldSubtype")}
              <input
                type="text"
                value={crisisSubtype}
                onChange={(e) => setCrisisSubtype(e.target.value)}
                required
                maxLength={50}
                placeholder={t("admin.subtypePlaceholder")}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
              />
            </label>

            <label className="block text-xs text-slate-400">
              {t("admin.fieldOnset")}
              <input
                type="datetime-local"
                value={onsetAt}
                onChange={(e) => setOnsetAt(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </label>

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
            />

            {createError && <p className="text-sm text-red-300">{createError}</p>}
            {createSuccess && (
              <p className="text-sm text-emerald-300">{createSuccess}</p>
            )}

            <button
              type="submit"
              disabled={createLoading || !name.trim() || !crisisSubtype.trim()}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
            >
              {createLoading ? t("admin.creating") : t("admin.createButton")}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">{t("admin.allCrises")}</h2>
            <button
              type="button"
              onClick={() => void loadCrises()}
              disabled={listLoading}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {t("nav.refresh")}
            </button>
          </div>

          {listError && <p className="mt-3 text-sm text-red-300">{listError}</p>}

          {listLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-surface-border/60"
                />
              ))}
            </div>
          ) : crises.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("admin.noCrises")}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {crises.map((crisis) => (
                <li
                  key={crisis.id}
                  className="rounded-lg border border-surface-border bg-surface/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{crisis.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t(`admin.crisisType.${crisis.crisis_type}`)} ·{" "}
                        {crisis.crisis_subtype} ·{" "}
                        {new Date(crisis.onset_at).toLocaleString()}
                      </p>
                      {typeof crisis.epicenter_lat === "number" &&
                        typeof crisis.epicenter_lng === "number" &&
                        !(crisis.epicenter_lat === 0 && crisis.epicenter_lng === 0) && (
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {t("admin.epicenterCoords", {
                              lat: crisis.epicenter_lat.toFixed(4),
                              lng: crisis.epicenter_lng.toFixed(4),
                            })}
                          </p>
                        )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        crisis.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-slate-500/15 text-slate-400"
                      }`}
                    >
                      {t(`admin.status.${crisis.status}`)}
                    </span>
                  </div>

                  <label className="mt-3 block text-xs text-slate-400">
                    {t("admin.changeStatus")}
                    <select
                      value={crisis.status}
                      disabled={savingId === crisis.id}
                      onChange={(e) =>
                        void handleStatusChange(
                          crisis.id,
                          e.target.value as CrisisStatus,
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent disabled:opacity-50"
                    >
                      <option value="active">{t("admin.status.active")}</option>
                      <option value="closed">{t("admin.status.closed")}</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <UnlistedReportsPanel crises={crises} onCrisesChange={loadCrises} />
    </div>
  );
}
