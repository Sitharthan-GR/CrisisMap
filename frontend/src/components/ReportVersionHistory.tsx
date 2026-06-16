import { useTranslation } from "react-i18next";
import { damageLevelColor, damageLevelLabel } from "../lib/severity";
import type { ReportVersion } from "../types/report";

interface ReportVersionHistoryProps {
  versions: ReportVersion[];
  activeReportId: string;
  onSelectVersion?: (reportId: string) => void;
  compact?: boolean;
}

export default function ReportVersionHistory({
  versions,
  activeReportId,
  onSelectVersion,
  compact = false,
}: ReportVersionHistoryProps) {
  const { t } = useTranslation();

  if (versions.length <= 1) {
    return null;
  }

  return (
    <section className="border-t border-surface-border pt-2.5">
      <p
        className={`font-medium text-slate-400 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {t("reportDetail.versionHistory", { count: versions.length })}
      </p>
      <ol className={`mt-2 space-y-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {versions.map((version) => {
          const isActive = version.id === activeReportId;
          const canSelect = Boolean(onSelectVersion) && !isActive;

          return (
            <li key={version.id}>
              <button
                type="button"
                disabled={!canSelect}
                onClick={() => onSelectVersion?.(version.id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  isActive
                    ? "border-accent/50 bg-accent/10"
                    : canSelect
                      ? "border-surface-border bg-surface/40 hover:border-slate-500 hover:bg-surface"
                      : "border-surface-border bg-surface/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: damageLevelColor(version.damage_level) }}
                      aria-hidden
                    />
                    <span className="truncate font-medium text-slate-200">
                      {t("reportDetail.versionNumber", {
                        number: version.version_number,
                      })}
                      <span className="font-normal text-slate-400">
                        {" · "}
                        {damageLevelLabel(version.damage_level)}
                      </span>
                    </span>
                  </div>
                  {version.is_latest_version && (
                    <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                      {t("reportDetail.latestVersion")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-slate-500">
                  {new Date(version.submitted_at).toLocaleString()}
                </p>
                {isActive && (
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    {t("reportDetail.viewingVersion")}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
