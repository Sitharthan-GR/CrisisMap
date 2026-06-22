import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  fetchReportDetail,
  fetchReportVersions,
  fetchReverseGeocode,
  isAbortError,
} from "../api/client";
import { formatStoredAddress, resolveGeocodeLabel } from "../lib/address";
import { PhotoGallery } from "./PhotoLightbox";
import ReportVersionHistory from "./ReportVersionHistory";
import {
  damageLevelClass,
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import type { ReportDetail, ReportVersion, Crisis } from "../types/report";

interface ReportDetailContentProps {
  reportId: string;
  crises?: Crisis[];
  crisisName?: string;
  variant?: "popup" | "panel";
  onSelectVersion?: (reportId: string) => void;
}

type DetailTab = "info" | "photos" | "history";

function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function photoUrl(photo: ReportDetail["photos"][number]): string | null {
  return photo.signed_url ?? photo.thumbnail_url ?? null;
}

export default function ReportDetailContent({
  reportId,
  crises,
  crisisName,
  variant = "popup",
  onSelectVersion,
}: ReportDetailContentProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("info");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++fetchGenerationRef.current;

    setLoading(true);
    setError(null);
    setDetail(null);
    setVersions([]);
    setResolvedAddress(null);
    setActivePhoto(0);
    setActiveTab("info");

    Promise.all([
      fetchReportDetail(reportId, controller.signal),
      fetchReportVersions(reportId, controller.signal).catch((err) => {
        if (isAbortError(err)) throw err;
        return [] as ReportVersion[];
      }),
    ])
      .then(([data, versionData]) => {
        if (generation !== fetchGenerationRef.current) return;
        setError(null);
        setDetail(data);
        setVersions(versionData);
      })
      .catch((err) => {
        if (generation !== fetchGenerationRef.current || isAbortError(err)) return;
        setError(
          err instanceof ApiError
            ? err.message
            : t("reportDetail.loadFailed"),
        );
      })
      .finally(() => {
        if (generation === fetchGenerationRef.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reportId, t]);

  useEffect(() => {
    const location = detail?.location;
    if (!location) {
      setResolvedAddress(null);
      return;
    }

    const controller = new AbortController();
    const fallback = formatStoredAddress(location);

    void fetchReverseGeocode(location.latitude, location.longitude, controller.signal)
      .then((geo) => {
        const label = resolveGeocodeLabel(
          geo,
          fallback ?? formatCoordinates(location.latitude, location.longitude),
        );
        setResolvedAddress(label);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setResolvedAddress(fallback);
      });

    return () => controller.abort();
  }, [detail?.location?.id, detail?.location?.latitude, detail?.location?.longitude]);

  if (loading) {
    return (
      <p className={`text-slate-400 ${variant === "popup" ? "text-xs" : "text-sm"}`}>
        {t("reportDetail.loading")}
      </p>
    );
  }

  if (error) {
    return (
      <p className={`text-red-300 ${variant === "popup" ? "text-xs" : "text-sm"}`}>
        {error}
      </p>
    );
  }

  if (!detail) {
    return (
      <p className={`text-slate-400 ${variant === "popup" ? "text-xs" : "text-sm"}`}>
        {t("reportDetail.loading")}
      </p>
    );
  }

  const photos = detail.photos.filter((photo) => photoUrl(photo));
  const description =
    detail.description_translated?.trim() ||
    detail.description_raw?.trim() ||
    null;
  const natureLabel = detail.nature_of_crisis
    ? t(`nature.${detail.nature_of_crisis}`, {
        defaultValue: detail.nature_of_crisis,
      })
    : null;
  const location = detail.location;
  const storedAddress = location ? formatStoredAddress(location) : null;
  const addressLine =
    resolvedAddress ??
    storedAddress ??
    (location ? formatCoordinates(location.latitude, location.longitude) : null);
  const showStoredFallback = Boolean(
    resolvedAddress &&
      storedAddress &&
      resolvedAddress !== storedAddress &&
      !resolvedAddress.includes(storedAddress),
  );
  const buildingName = detail.infra_name?.trim() || null;
  const hasHistory = versions.length > 1;
  const isPopup = variant === "popup";
  const isPanel = variant === "panel";

  const reportCrisisName =
    crises?.find((crisis) => crisis.id === detail.crisis_id)?.name ?? crisisName;

  const metaParts = [
    reportCrisisName,
    infraTypeLabel(detail.infra_type, detail.infra_subtype),
    natureLabel,
  ].filter(Boolean);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "info", label: t("reportDetail.tabInfo") },
    { id: "photos", label: t("reportDetail.tabPhotos") },
  ];
  if (hasHistory) {
    tabs.push({ id: "history", label: t("reportDetail.tabHistory") });
  }

  return (
    <div className={isPopup ? "min-w-[220px] max-w-[280px] space-y-3" : ""}>
      <div className={isPanel ? "rd-tabs" : "flex rounded-lg border border-surface-border bg-surface p-0.5"}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              isPanel
                ? activeTab === tab.id
                  ? "on"
                  : ""
                : `flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    activeTab === tab.id
                      ? "border border-surface-border bg-surface-raised text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className={isPanel ? "" : "space-y-3"}>
          <div>
            <div className={isPanel ? "rd-title" : "flex items-center gap-2"}>
              <span
                className={`dmg-dot ${damageLevelClass(detail.damage_level)}`}
                aria-hidden
              />
              {isPanel ? (
                damageLevelLabel(detail.damage_level)
              ) : (
                <p className="text-base font-semibold text-white">
                  {damageLevelLabel(detail.damage_level)}
                </p>
              )}
            </div>
            <p className={isPanel ? "rd-sub" : "mt-1 text-xs text-slate-400"}>
              {metaParts.join(" · ")}
            </p>
          </div>

          {location && addressLine && (
            <div className={isPanel ? "rd-loc" : "rounded-xl border border-surface-border bg-surface px-3 py-3"}>
              <div className={isPanel ? "pinico" : ""}>
                <MapPin
                  className={isPanel ? "" : "mt-0.5 h-4 w-4 shrink-0 text-accent"}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                {isPanel && (
                  <p className="rd-loc__label">{t("reportDetail.location")}</p>
                )}
                {buildingName && (
                  <p className={isPanel ? "rd-loc__building" : "text-sm font-semibold text-white"}>
                    {buildingName}
                  </p>
                )}
                <p className={isPanel ? "rd-loc__address" : "text-sm font-medium leading-snug text-white"}>
                  {addressLine}
                </p>
                {showStoredFallback && storedAddress && (
                  <p className={isPanel ? "sub" : "mt-1 text-xs text-slate-400"}>
                    {storedAddress}
                  </p>
                )}
                <p className={isPanel ? "coords" : "mt-1.5 text-xs text-slate-500"}>
                  {formatCoordinates(location.latitude, location.longitude)}
                </p>
                {location.what3words && (
                  <span className={isPanel ? "rd-w3w" : "mt-1.5 inline-block rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300"}>
                    /// {location.what3words.replace(/^\/{3}\s?/, "")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className={isPanel ? "rd-grid" : "grid grid-cols-2 gap-2"}>
            {isPanel && (
              <InfoCell label={t("reportDetail.description")} panel fullWidth>
                <span className={description ? "desc" : "muted"}>
                  {description ?? t("reportDetail.noDescriptionShort")}
                </span>
              </InfoCell>
            )}
            <InfoCell label={t("reportDetail.debris")} panel={isPanel}>
              <span className={detail.debris_present ? "warn" : undefined}>
                {detail.debris_present
                  ? t("reportDetail.debrisPresent")
                  : t("reportDetail.debrisNone")}
              </span>
            </InfoCell>
            <InfoCell label={t("reportDetail.submitted")} panel={isPanel}>
              {formatSubmittedAt(detail.submitted_at)}
            </InfoCell>
            {!isPanel && (
              <InfoCell label={t("reportDetail.description")} panel={false} colSpan={2}>
                <span
                  className={`line-clamp-2 ${
                    description ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  {description ?? t("reportDetail.noDescriptionShort")}
                </span>
              </InfoCell>
            )}
            <InfoCell
              label={t("reportDetail.reporter")}
              panel={isPanel}
              fullWidth={isPanel}
              colSpan={isPanel ? undefined : 2}
            >
              {detail.reporter_name && detail.reporter_name !== "anonymous"
                ? detail.reporter_name
                : t("reportDetail.anonymous")}
            </InfoCell>
          </div>

          <ReportVersionHistory
            versions={versions}
            activeReportId={reportId}
            onSelectVersion={onSelectVersion}
            compact={isPopup}
          />
        </div>
      )}

      {activeTab === "photos" && (
        <div>
          {photos.length > 0 ? (
            <PhotoGallery
              photos={photos.map((p) => photoUrl(p)!)}
              activeIndex={activePhoto}
              onIndexChange={setActivePhoto}
              compact={isPopup}
            />
          ) : (
            <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface px-4 py-8 text-center">
              <p className="text-sm text-slate-500">{t("reportDetail.noPhoto")}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && hasHistory && (
        <ReportVersionHistory
          versions={versions}
          activeReportId={reportId}
          onSelectVersion={onSelectVersion}
        />
      )}
    </div>
  );
}

function InfoCell({
  label,
  children,
  panel = false,
  fullWidth = false,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  panel?: boolean;
  fullWidth?: boolean;
  colSpan?: number;
}) {
  if (panel) {
    return (
      <div className={`rd-cell${fullWidth ? " rd-cell--full" : ""}`}>
        <div className="k">{label}</div>
        <div className="v">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-surface-border bg-surface px-3 py-2.5${
        colSpan === 2 ? " col-span-2" : ""
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white">{children}</p>
    </div>
  );
}
