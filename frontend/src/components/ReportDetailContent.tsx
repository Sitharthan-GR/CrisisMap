import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, fetchReportDetail, fetchReportVersions } from "../api/client";
import { PhotoGallery } from "./PhotoLightbox";
import ReportVersionHistory from "./ReportVersionHistory";
import {
  damageLevelColor,
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import type { ReportDetail, ReportLocation, ReportVersion } from "../types/report";

interface ReportDetailContentProps {
  reportId: string;
  crisisName?: string;
  variant?: "popup" | "panel";
  onSelectVersion?: (reportId: string) => void;
}

type DetailTab = "info" | "photos" | "history";

function formatReportRef(id: string): string {
  const compact = id.replace(/-/g, "").slice(-5).toUpperCase();
  return `RPT-${compact}`;
}

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

function locationLines(location: ReportLocation): {
  primary: string | null;
  secondary: string | null;
} {
  const { admin_level_1: l1, admin_level_2: l2, admin_level_3: l3 } = location;
  const primaryParts = [l3, l2].filter(Boolean) as string[];
  const primary =
    primaryParts.length > 0
      ? primaryParts.join(", ")
      : l2 ?? l1 ?? null;

  const secondaryParts: string[] = [];
  if (l2 && !primaryParts.includes(l2)) secondaryParts.push(l2);
  if (l1) secondaryParts.push(l1);

  return {
    primary,
    secondary: secondaryParts.length > 0 ? secondaryParts.join(", ") : null,
  };
}

function photoUrl(photo: ReportDetail["photos"][number]): string | null {
  return photo.signed_url ?? photo.thumbnail_url ?? null;
}

export default function ReportDetailContent({
  reportId,
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    setVersions([]);
    setActivePhoto(0);
    setActiveTab("info");

    Promise.all([
      fetchReportDetail(reportId, controller.signal),
      fetchReportVersions(reportId, controller.signal).catch(() => [] as ReportVersion[]),
    ])
      .then(([data, versionData]) => {
        setDetail(data);
        setVersions(versionData);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? err.message
            : t("reportDetail.loadFailed"),
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [reportId, t]);

  if (loading) {
    return (
      <p className={`text-slate-400 ${variant === "popup" ? "text-xs" : "text-sm"}`}>
        {t("reportDetail.loading")}
      </p>
    );
  }

  if (error || !detail) {
    return (
      <p className={`text-red-300 ${variant === "popup" ? "text-xs" : "text-sm"}`}>
        {error ?? t("reportDetail.loadFailed")}
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
  const { primary: locationPrimary, secondary: locationSecondary } = location
    ? locationLines(location)
    : { primary: null, secondary: null };
  const hasHistory = versions.length > 1;
  const isPopup = variant === "popup";

  const metaParts = [
    formatReportRef(detail.id),
    infraTypeLabel(detail.infra_type),
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
    <div className={`space-y-3 ${isPopup ? "min-w-[220px] max-w-[280px]" : ""}`}>
      <div className="flex rounded-lg border border-surface-border bg-surface p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              activeTab === tab.id
                ? "border border-surface-border bg-surface-raised text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: damageLevelColor(detail.damage_level) }}
                aria-hidden
              />
              <p className="text-base font-semibold text-white">
                {damageLevelLabel(detail.damage_level)}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {metaParts.join(" · ")}
            </p>
            {crisisName && (
              <p className="mt-0.5 text-xs text-slate-500">{crisisName}</p>
            )}
          </div>

          {location && (locationPrimary || location.latitude) && (
            <div className="rounded-xl border border-surface-border bg-surface px-3 py-3">
              <div className="flex gap-2.5">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  {locationPrimary && (
                    <p className="text-sm font-medium text-white">
                      {locationPrimary}
                    </p>
                  )}
                  {locationSecondary && (
                    <p className="text-xs text-slate-400">{locationSecondary}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {formatCoordinates(location.latitude, location.longitude)}
                  </p>
                  {location.what3words && (
                    <span className="mt-1.5 inline-block rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                      /// {location.what3words.replace(/^\/{3}\s?/, "")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <InfoCell label={t("reportDetail.debris")}>
              <span
                className={
                  detail.debris_present ? "text-amber-400" : "text-slate-300"
                }
              >
                {detail.debris_present
                  ? t("reportDetail.debrisPresent")
                  : t("reportDetail.debrisNone")}
              </span>
            </InfoCell>
            <InfoCell label={t("reportDetail.reporter")}>
              {detail.reporter_name && detail.reporter_name !== "anonymous"
                ? detail.reporter_name
                : t("reportDetail.anonymous")}
            </InfoCell>
            <InfoCell label={t("reportDetail.submitted")}>
              {formatSubmittedAt(detail.submitted_at)}
            </InfoCell>
            <InfoCell label={t("reportDetail.description")}>
              <span
                className={`line-clamp-2 ${
                  description ? "text-slate-200" : "text-slate-500"
                }`}
              >
                {description ?? t("reportDetail.noDescriptionShort")}
              </span>
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white">{children}</p>
    </div>
  );
}
