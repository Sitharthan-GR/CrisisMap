import { Link2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  adminAssignUnlistedReport,
  adminCreateCrisisFromReport,
  adminDeleteUnlistedReport,
  adminFetchUnlistedReports,
  fetchReverseGeocode,
} from "../api/client";
import { briefLocationFromAdmin, shortAddress } from "../lib/address";
import { getAdminToken } from "../lib/adminAuth";
import {
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import type { Crisis, CrisisType, ReportDetail } from "../types/report";
import { PhotoGallery } from "./PhotoLightbox";

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

function photoUrls(report: ReportDetail): string[] {
  return report.photos
    .map((photo) => photo.thumbnail_url ?? photo.signed_url)
    .filter((url): url is string => Boolean(url));
}

interface UnlistedReportsPanelProps {
  crises: Crisis[];
  onCrisesChange: () => Promise<void>;
}

export default function UnlistedReportsPanel({
  crises,
  onCrisesChange,
}: UnlistedReportsPanelProps) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [assignCrisisId, setAssignCrisisId] = useState<Record<string, string>>({});
  const [createOpenId, setCreateOpenId] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState<Record<string, number>>({});
  const [addressLabels, setAddressLabels] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState({
    name: "",
    crisisType: "natural_hazard" as CrisisType,
    crisisSubtype: "",
    onsetAt: defaultOnsetLocal(),
  });

  const assignableCrises = crises.filter(
    (crisis) => !crisis.is_unlisted && crisis.status === "active",
  );

  const loadReports = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchUnlistedReports(token);
      setReports(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.errors.unlistedLoadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    const controller = new AbortController();

    for (const report of reports) {
      const fromAdmin = briefLocationFromAdmin(report.location);
      if (fromAdmin) {
        setAddressLabels((prev) =>
          prev[report.id] === fromAdmin ? prev : { ...prev, [report.id]: fromAdmin },
        );
        continue;
      }

      const lat = report.location?.latitude;
      const lng = report.location?.longitude;
      if (lat == null || lng == null) continue;

      void fetchReverseGeocode(lat, lng, controller.signal)
        .then((geo) => {
          const label = geo.display_name
            ? shortAddress(geo.display_name, 2)
            : null;
          if (!label) return;
          setAddressLabels((prev) => ({ ...prev, [report.id]: label }));
        })
        .catch(() => {
          // Non-blocking: coords fallback handled in render
        });
    }

    return () => controller.abort();
  }, [reports]);

  const openCreateForm = (report: ReportDetail) => {
    setCreateOpenId(report.id);
    setCreateForm({
      name: "",
      crisisType: "natural_hazard",
      crisisSubtype: report.nature_of_crisis ?? "",
      onsetAt: defaultOnsetLocal(),
    });
  };

  const handleAssign = async (reportId: string) => {
    const token = getAdminToken();
    const crisisId = assignCrisisId[reportId];
    if (!token || !crisisId) return;

    setActionId(reportId);
    setError(null);
    try {
      await adminAssignUnlistedReport(token, reportId, crisisId);
      setReports((prev) => prev.filter((report) => report.id !== reportId));
      await onCrisesChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.errors.assignFailed"),
      );
    } finally {
      setActionId(null);
    }
  };

  const handleCreateCrisis = async (reportId: string) => {
    const token = getAdminToken();
    if (!token || !createForm.name.trim() || !createForm.crisisSubtype.trim()) {
      return;
    }

    setActionId(reportId);
    setError(null);
    try {
      await adminCreateCrisisFromReport(token, reportId, {
        name: createForm.name.trim(),
        crisis_type: createForm.crisisType,
        crisis_subtype: createForm.crisisSubtype.trim(),
        onset_at: toIsoUtcFromLocal(createForm.onsetAt),
      });
      setReports((prev) => prev.filter((report) => report.id !== reportId));
      setCreateOpenId(null);
      await onCrisesChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.errors.createFromReportFailed"),
      );
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!window.confirm(t("admin.unlistedDeleteConfirm"))) return;

    const token = getAdminToken();
    if (!token) return;

    setActionId(reportId);
    setError(null);
    try {
      await adminDeleteUnlistedReport(token, reportId);
      setReports((prev) => prev.filter((report) => report.id !== reportId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.errors.deleteFailed"),
      );
    } finally {
      setActionId(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-8">
      <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              {t("admin.unlistedReports")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("admin.unlistedReportsHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadReports()}
            disabled={loading}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {t("nav.refresh")}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        {loading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-surface-border/60"
              />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            {t("admin.unlistedReportsEmpty")}
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-slate-400">
              {t("admin.unlistedReportCount", { count: reports.length })}
            </p>
            <ul className="mt-3 space-y-3">
              {reports.map((report) => {
                const urls = photoUrls(report);
                const locationLabel =
                  addressLabels[report.id] ??
                  briefLocationFromAdmin(report.location);
                const busy = actionId === report.id;
                const activePhoto = photoIndex[report.id] ?? 0;

                return (
                  <li
                    key={report.id}
                    className="rounded-lg border border-surface-border bg-surface/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {damageLevelLabel(report.damage_level)} ·{" "}
                          {infraTypeLabel(report.infra_type)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {locationLabel ?? t("admin.unlistedNoLocation")}
                        </p>
                        {report.nature_of_crisis && (
                          <p className="mt-1 text-xs text-slate-400">
                            {t("reportDetail.nature")}: {report.nature_of_crisis}
                          </p>
                        )}
                        {report.description_raw && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                            {report.description_raw}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-600">
                          {new Date(report.collected_at).toLocaleString()}
                          {report.reporter_name !== "anonymous" &&
                            ` · ${report.reporter_name}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(report.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 transition hover:bg-red-950/40 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("admin.unlistedRemove")}
                      </button>
                    </div>

                    {urls.length > 0 && (
                      <div className="mt-3 max-w-sm">
                        <PhotoGallery
                          photos={urls}
                          activeIndex={activePhoto}
                          onIndexChange={(index) =>
                            setPhotoIndex((prev) => ({
                              ...prev,
                              [report.id]: index,
                            }))
                          }
                          compact
                        />
                      </div>
                    )}

                    <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
                      <div>
                        <p className="mb-1.5 text-xs text-slate-400">
                          {t("admin.unlistedAssignExisting")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={assignCrisisId[report.id] ?? ""}
                            onChange={(e) =>
                              setAssignCrisisId((prev) => ({
                                ...prev,
                                [report.id]: e.target.value,
                              }))
                            }
                            disabled={busy || assignableCrises.length === 0}
                            className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent disabled:opacity-50"
                          >
                            <option value="">
                              {assignableCrises.length === 0
                                ? t("admin.unlistedNoCrises")
                                : t("admin.unlistedSelectCrisis")}
                            </option>
                            {assignableCrises.map((crisis) => (
                              <option key={crisis.id} value={crisis.id}>
                                {crisis.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleAssign(report.id)}
                            disabled={
                              busy ||
                              !assignCrisisId[report.id] ||
                              assignableCrises.length === 0
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
                          >
                            <Link2 className="h-4 w-4" />
                            {t("admin.unlistedAssign")}
                          </button>
                        </div>
                      </div>

                      <div>
                        {createOpenId !== report.id ? (
                          <button
                            type="button"
                            onClick={() => openCreateForm(report)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("admin.unlistedCreateCrisis")}
                          </button>
                        ) : (
                          <div className="space-y-2 rounded-lg border border-surface-border bg-surface p-3">
                            <p className="text-xs font-medium text-slate-300">
                              {t("admin.unlistedCreateCrisisTitle")}
                            </p>
                            <input
                              type="text"
                              value={createForm.name}
                              onChange={(e) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              placeholder={t("admin.fieldName")}
                              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-white outline-none focus:border-accent"
                            />
                            <select
                              value={createForm.crisisType}
                              onChange={(e) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  crisisType: e.target.value as CrisisType,
                                }))
                              }
                              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-white outline-none focus:border-accent"
                            >
                              {CRISIS_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {t(`admin.crisisType.${type}`)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={createForm.crisisSubtype}
                              onChange={(e) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  crisisSubtype: e.target.value,
                                }))
                              }
                              placeholder={t("admin.subtypePlaceholder")}
                              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-white outline-none focus:border-accent"
                            />
                            <input
                              type="datetime-local"
                              value={createForm.onsetAt}
                              onChange={(e) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  onsetAt: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-white outline-none focus:border-accent"
                            />
                            <p className="text-[11px] text-slate-500">
                              {t("admin.unlistedCreateCrisisHint")}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCreateCrisis(report.id)}
                                disabled={
                                  busy ||
                                  !createForm.name.trim() ||
                                  !createForm.crisisSubtype.trim()
                                }
                                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
                              >
                                {busy
                                  ? t("admin.creating")
                                  : t("admin.unlistedCreateAndAssign")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreateOpenId(null)}
                                disabled={busy}
                                className="rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"
                              >
                                {t("admin.cancel")}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
