import { Building2, Loader2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapReportPin } from "../types/report";
import {
  damageLevelClass,
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import { distanceMeters } from "../lib/geo";
import { formatDistance as formatDistanceLabel, type DistanceSystem } from "../lib/units";
import type { DamageFilter, ReportSort } from "../lib/reportFilters";

interface LiveActivityFeedProps {
  reports: MapReportPin[];
  selectedId?: string;
  onSelect: (report: MapReportPin) => void;
  loading?: boolean;
  centerLat: number;
  centerLng: number;
  distanceSystem: DistanceSystem;
  damageFilter: DamageFilter;
  onDamageFilterChange: (filter: DamageFilter) => void;
  sort: ReportSort;
  onSortChange: (sort: ReportSort) => void;
}

const DAMAGE_FILTERS: DamageFilter[] = ["all", "complete", "partial", "minimal"];

export default function LiveActivityFeed({
  reports,
  selectedId,
  onSelect,
  loading = false,
  centerLat,
  centerLng,
  distanceSystem,
  damageFilter,
  onDamageFilterChange,
  sort,
  onSortChange,
}: LiveActivityFeedProps) {
  const { t } = useTranslation();

  const filterLabel = (filter: DamageFilter) => {
    if (filter === "all") return t("activityFeed.filterAll");
    return t(`damage.${filter}Title`);
  };

  return (
    <>
      <div className="feed-top">
        <div className="feed-head">
          <span className={`live-pill${loading ? " loading" : ""}`}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="blip" />
            )}
            {loading ? t("activityFeed.loading") : t("activityFeed.live")}
          </span>
          <span className="panel-h" style={{ margin: 0, gap: 8 }}>
            <h2 style={{ fontSize: 15 }}>{t("activityFeed.title")}</h2>
          </span>
          {!loading && (
            <span className="result-count" style={{ marginLeft: "auto" }}>
              {t("activityFeed.count", { count: reports.length })}
            </span>
          )}
        </div>

        <div className="feed-controls">
          <div className="chips-row">
            {DAMAGE_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`chip${damageFilter === filter ? " on" : ""}${
                  filter !== "all" ? ` dmg-${filter}` : ""
                }`}
                onClick={() => onDamageFilterChange(filter)}
              >
                {filter !== "all" && (
                  <span
                    className="cdot"
                    style={{
                      background:
                        filter === "complete"
                          ? "var(--dmg-complete)"
                          : filter === "partial"
                            ? "var(--dmg-partial)"
                            : "var(--dmg-minimal)",
                    }}
                  />
                )}
                {filterLabel(filter)}
              </button>
            ))}
          </div>

          <div className="sort-row">
            <span className="label">{t("activityFeed.sort")}</span>
            <select
              className="field"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as ReportSort)}
            >
              <option value="newest">{t("activityFeed.sortNewest")}</option>
              <option value="nearest">{t("activityFeed.sortNearest")}</option>
              <option value="severe">{t("activityFeed.sortSevere")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="feed-list">
        {loading && (
          <div className="empty">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin opacity-50" />
            <div>{t("activityFeed.loading")}</div>
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="empty">
            <Search strokeWidth={1.5} />
            <div>{t("activityFeed.noMatch")}</div>
          </div>
        )}

        {!loading &&
          reports.map((report) => {
            const isSelected = selectedId === report.id;
            const dmgClass = damageLevelClass(report.damageLevel);
            const dist = distanceMeters(
              centerLat,
              centerLng,
              report.latitude,
              report.longitude,
            );

            return (
              <button
                key={report.id}
                type="button"
                className={`feed-item${isSelected ? " sel" : ""}`}
                onClick={() => onSelect(report)}
              >
                <div className="swatch">
                  {report.thumbnail ? (
                    <img src={report.thumbnail} alt="" />
                  ) : (
                    <Building2 strokeWidth={2} />
                  )}
                </div>
                <div className="fbody">
                  <div className="ftitle">
                    <span className={`dmg-badge ${dmgClass}`}>
                      {damageLevelLabel(report.damageLevel)}
                    </span>
                  </div>
                  <span className="fmeta">
                    {infraTypeLabel(report.infraType)} · {formatDistanceLabel(dist, distanceSystem)}
                  </span>
                  {report.adminLevel2 && (
                    <span className="fsub">{report.adminLevel2}</span>
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </>
  );
}
