import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, fetchReportDetail, fetchReportVersions } from "../api/client";
import { PhotoGallery } from "./PhotoLightbox";
import ReportVersionHistory from "./ReportVersionHistory";
import {
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import type { ReportDetail, ReportVersion } from "../types/report";

interface ReportDetailContentProps {
  reportId: string;
  crisisName?: string;
  variant?: "popup" | "panel";
  onSelectVersion?: (reportId: string) => void;
}

function formatLocation(detail: ReportDetail): string | null {
  const parts = [
    detail.location?.admin_level_3,
    detail.location?.admin_level_2,
    detail.location?.admin_level_1,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    setVersions([]);
    setActivePhoto(0);

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
  const locationLabel = formatLocation(detail);
  const natureLabel = detail.nature_of_crisis
    ? t(`nature.${detail.nature_of_crisis}`, {
        defaultValue: detail.nature_of_crisis,
      })
    : null;
  const isPopup = variant === "popup";

  return (
    <div className={`space-y-2.5 ${isPopup ? "min-w-[220px] max-w-[280px]" : ""}`}>
      {photos.length > 0 ? (
        <PhotoGallery
          photos={photos.map((p) => photoUrl(p)!)}
          activeIndex={activePhoto}
          onIndexChange={setActivePhoto}
          compact={isPopup}
        />
      ) : (
        <p className={`text-slate-500 ${isPopup ? "text-xs" : "text-sm"}`}>
          {t("reportDetail.noPhoto")}
        </p>
      )}

      <div>
        <p className={`font-semibold text-white ${isPopup ? "text-sm" : "text-base"}`}>
          {damageLevelLabel(detail.damage_level)}
        </p>
        {crisisName && (
          <p className={`mt-0.5 text-slate-300 ${isPopup ? "text-xs" : "text-sm"}`}>
            {crisisName}
          </p>
        )}
      </div>

      <dl className={`space-y-1 ${isPopup ? "text-xs" : "text-sm"}`}>
        <DetailRow label={t("reportDetail.infrastructure")}>
          {infraTypeLabel(detail.infra_type)}
        </DetailRow>
        {natureLabel && (
          <DetailRow label={t("reportDetail.nature")}>{natureLabel}</DetailRow>
        )}
        <DetailRow label={t("reportDetail.debris")}>
          {detail.debris_present
            ? t("reportDetail.debrisYes")
            : t("reportDetail.debrisNo")}
        </DetailRow>
        {locationLabel && (
          <DetailRow label={t("reportDetail.location")}>{locationLabel}</DetailRow>
        )}
        <DetailRow label={t("reportDetail.reporter")}>
          {detail.reporter_name && detail.reporter_name !== "anonymous"
            ? detail.reporter_name
            : t("reportDetail.anonymous")}
        </DetailRow>
        <DetailRow label={t("reportDetail.submitted")}>
          {new Date(detail.submitted_at).toLocaleString()}
        </DetailRow>
        <DetailRow label={t("reportDetail.status")}>
          {t(`reportDetail.status_${detail.status}`, {
            defaultValue: detail.status,
          })}
        </DetailRow>
      </dl>

      <div>
        <p className={`font-medium text-slate-400 ${isPopup ? "text-[11px]" : "text-xs"}`}>
          {t("reportDetail.description")}
        </p>
        <p className={`mt-0.5 text-slate-200 ${isPopup ? "text-xs" : "text-sm"}`}>
          {description ?? t("reportDetail.noDescription")}
        </p>
      </div>

      <ReportVersionHistory
        versions={versions}
        activeReportId={reportId}
        onSelectVersion={onSelectVersion}
        compact={isPopup}
      />
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className="text-slate-300">{children}</dd>
    </div>
  );
}
