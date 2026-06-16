import { Activity, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapReportPin } from "../types/report";
import {
  damageLevelColor,
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import { distanceMeters } from "../lib/geo";

interface LiveActivityFeedProps {
  reports: MapReportPin[];
  selectedId?: string;
  onSelect: (report: MapReportPin) => void;
  loading?: boolean;
  centerLat: number;
  centerLng: number;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function LiveActivityFeed({
  reports,
  selectedId,
  onSelect,
  loading,
  centerLat,
  centerLng,
}: LiveActivityFeedProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col p-3">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {t("activityFeed.live")}
        </span>
        {!loading && (
          <p className="text-[11px] text-slate-600">
            {t("activityFeed.count", { count: reports.length })}
          </p>
        )}
      </div>
      <p className="mb-3 px-1 text-xs text-slate-500">{t("activityFeed.subtitle")}</p>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-surface-border/60"
            />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <div className="rounded-full bg-surface-border/60 p-4">
            <MapPin className="h-6 w-6 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-300">
            {t("list.noReports")}
          </p>
          <p className="text-xs text-slate-500">{t("list.noReportsHint")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((report) => {
            const isSelected = selectedId === report.id;
            const dist = distanceMeters(
              centerLat,
              centerLng,
              report.latitude,
              report.longitude,
            );

            return (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => onSelect(report)}
                  className={`flex w-full gap-3 rounded-lg border p-2.5 text-start transition ${
                    isSelected
                      ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                      : "border-surface-border bg-surface/60 hover:border-slate-600 hover:bg-surface-raised"
                  }`}
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-border/60">
                    {report.thumbnail ? (
                      <img
                        src={report.thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <MapPin className="h-5 w-5 text-slate-600" />
                      </div>
                    )}
                    <span
                      className="absolute bottom-1 end-1 h-2.5 w-2.5 rounded-full border border-surface-raised"
                      style={{
                        backgroundColor: damageLevelColor(report.damageLevel),
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {damageLevelLabel(report.damageLevel)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {infraTypeLabel(report.infraType)} · {formatDistance(dist)}
                    </p>
                    {report.adminLevel2 && (
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {report.adminLevel2}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LiveActivityFeedIcon() {
  return <Activity className="h-4 w-4" />;
}
