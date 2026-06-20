import { Activity, Loader2, MapPin } from "lucide-react";
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

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-lg border border-surface-border/50 bg-surface/40 p-2.5"
        >
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-surface-border/70" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface-border/70" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-border/50" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-surface-border/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LiveActivityFeed({
  reports,
  selectedId,
  onSelect,
  loading = false,
  centerLat,
  centerLng,
}: LiveActivityFeedProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col p-3">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors duration-300 ${
            loading
              ? "border-slate-600/40 bg-surface-border/30 text-slate-500"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          )}
          {loading ? t("activityFeed.loading") : t("activityFeed.live")}
        </span>
        {!loading && (
          <p className="text-[11px] text-slate-600 transition-opacity duration-300">
            {t("activityFeed.count", { count: reports.length })}
          </p>
        )}
      </div>
      <p className="mb-3 px-1 text-xs text-slate-500">{t("activityFeed.subtitle")}</p>

      <div className="relative min-h-[12rem]">
        {loading && (
          <div className="transition-opacity duration-200 ease-out">
            <FeedSkeleton />
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center opacity-100 transition-opacity duration-300">
            <div className="rounded-full bg-surface-border/60 p-4">
              <MapPin className="h-6 w-6 text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-300">
              {t("list.noReports")}
            </p>
            <p className="text-xs text-slate-500">{t("list.noReportsHint")}</p>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <ul className="flex flex-col gap-2 transition-opacity duration-300 ease-out">
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
    </div>
  );
}

export function LiveActivityFeedIcon() {
  return <Activity className="h-4 w-4" />;
}
