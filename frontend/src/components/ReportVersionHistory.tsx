import { useTranslation } from "react-i18next";
import { damageLevelColor } from "../lib/severity";
import type { ReportVersion } from "../types/report";

interface ReportVersionHistoryProps {
  versions: ReportVersion[];
  activeReportId: string;
  onSelectVersion?: (reportId: string) => void;
  compact?: boolean;
}

function formatReportRef(id: string): string {
  const compact = id.replace(/-/g, "").slice(-5).toUpperCase();
  return `RPT-${compact}`;
}

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function damageLevelShortLabel(
  value: ReportVersion["damage_level"],
  t: (key: string) => string,
): string {
  const keys: Record<ReportVersion["damage_level"], string> = {
    minimal: "damage.minimalTitle",
    partial: "damage.partialTitle",
    complete: "damage.completeTitle",
  };
  return t(keys[value]);
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
    <section className={compact ? "pt-1" : "pt-2"}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {t("reportDetail.damageHistoryTitle")}
      </p>
      <ol
        className={`relative mt-3 space-y-0 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {versions.map((version, index) => {
          const isActive = version.id === activeReportId;
          const canSelect = Boolean(onSelectVersion) && !isActive;
          const isLast = index === versions.length - 1;

          return (
            <li key={version.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  className="absolute start-[5px] top-3 h-[calc(100%-4px)] w-px bg-surface-border"
                  aria-hidden
                />
              )}
              <span
                className="relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: damageLevelColor(version.damage_level) }}
                aria-hidden
              />
              <button
                type="button"
                disabled={!canSelect}
                onClick={() => onSelectVersion?.(version.id)}
                className={`min-w-0 flex-1 text-left transition ${
                  canSelect ? "cursor-pointer hover:opacity-90" : "cursor-default"
                }`}
              >
                <p
                  className={`font-medium ${
                    isActive ? "text-white" : "text-slate-200"
                  }`}
                >
                  {damageLevelShortLabel(version.damage_level, t)}
                </p>
                <p className="mt-0.5 text-slate-500">
                  {formatHistoryDate(version.submitted_at)}
                  {" · "}
                  {formatReportRef(version.id)}
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
