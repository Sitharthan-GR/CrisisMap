import {
  Building,
  ChevronDown,
  Eye,
  Factory,
  Home,
  Landmark,
  Link2,
  MoreHorizontal,
  Mountain,
  Route,
  Star,
  Store,
  Trees,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  adminAssignUnlistedReport,
  adminDeleteUnlistedReport,
  adminFetchUnlistedReports,
  fetchReverseGeocode,
} from "../api/client";
import { briefLocationFromAdmin, shortAddress } from "../lib/address";
import { crisisTypeIconClass } from "../lib/adminCrisisStats";
import { getAdminToken } from "../lib/adminAuth";
import {
  damageLevelClass,
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import type { Crisis, DamageLevel, InfraType, ReportDetail } from "../types/report";
import AdminReportDetailPanel from "./AdminReportDetailPanel";
import PopoverMenu from "./PopoverMenu";

const INFRA_ICONS: Record<InfraType, LucideIcon> = {
  residential: Home,
  commercial: Store,
  government: Landmark,
  utility: Zap,
  transport: Route,
  community: Building,
  public_space: Trees,
  other: MoreHorizontal,
};

const TYPE_ICONS: Record<"natural" | "technological" | "human", LucideIcon> = {
  natural: Mountain,
  technological: Factory,
  human: Star,
};

const DAMAGE_RANK: Record<DamageLevel, number> = {
  complete: 3,
  partial: 2,
  minimal: 1,
};

type DamageFilter = "all" | DamageLevel;
type SortKey = "newest" | "severe";

interface UnlistedReportsPanelProps {
  crises: Crisis[];
  onCrisesChange: () => Promise<void>;
  onCountChange?: (count: number) => void;
  onCreateFromReport?: (report: ReportDetail) => void;
}

function relativeTime(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function UnlistedReportsPanel({
  crises,
  onCrisesChange,
  onCountChange,
  onCreateFromReport,
}: UnlistedReportsPanelProps) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [addressLabels, setAddressLabels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [damageFilter, setDamageFilter] = useState<DamageFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [assignPop, setAssignPop] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const [menuPop, setMenuPop] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

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
      onCountChange?.(data.length);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("admin.errors.unlistedLoadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, onCountChange]);

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
          // fallback to coords in render
        });
    }

    return () => controller.abort();
  }, [reports]);

  const filtered = useMemo(() => {
    let list = reports.filter((report) => {
      if (damageFilter !== "all" && report.damage_level !== damageFilter) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const place =
        addressLabels[report.id] ??
        briefLocationFromAdmin(report.location) ??
        "";
      return (
        report.id.toLowerCase().includes(q) ||
        infraTypeLabel(report.infra_type).toLowerCase().includes(q) ||
        (report.nature_of_crisis ?? "").toLowerCase().includes(q) ||
        place.toLowerCase().includes(q)
      );
    });

    if (sort === "severe") {
      list = [...list].sort(
        (a, b) =>
          DAMAGE_RANK[b.damage_level] - DAMAGE_RANK[a.damage_level] ||
          new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime(),
      );
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime(),
      );
    }

    return list;
  }, [reports, damageFilter, query, sort, addressLabels]);

  const handleAssign = async (reportId: string, crisisId: string) => {
    const token = getAdminToken();
    if (!token) return;

    setActionId(reportId);
    setError(null);
    try {
      await adminAssignUnlistedReport(token, reportId, crisisId);
      setReports((prev) => {
        const next = prev.filter((report) => report.id !== reportId);
        onCountChange?.(next.length);
        return next;
      });
      if (selectedReportId === reportId) {
        closeReportDetail();
      }
      await onCrisesChange();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("admin.errors.assignFailed"),
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
      setReports((prev) => {
        const next = prev.filter((report) => report.id !== reportId);
        onCountChange?.(next.length);
        return next;
      });
      if (selectedReportId === reportId) {
        closeReportDetail();
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("admin.errors.deleteFailed"),
      );
    } finally {
      setActionId(null);
    }
  };

  const closePops = () => {
    setAssignPop(null);
    setMenuPop(null);
  };

  const openReportDetail = (reportId: string) => {
    closePops();
    setSelectedReportId(reportId);
  };

  const closeReportDetail = () => {
    setSelectedReportId(null);
  };

  const selectedReport = selectedReportId
    ? reports.find((r) => r.id === selectedReportId) ?? null
    : null;

  const activeReport = assignPop
    ? reports.find((r) => r.id === assignPop.id)
    : menuPop
      ? reports.find((r) => r.id === menuPop.id)
      : null;

  return (
    <>
      <p className="admin-view-note">{t("admin.unlistedViewNote")}</p>

      <div className="admin-toolbar">
        <div className="admin-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.searchUnlisted")}
          />
        </div>

        <div className="seg-chips">
          {(
            [
              { key: "all", label: t("admin.filterAll") },
              { key: "complete", label: t("damage.complete"), className: "dmg-complete", dot: "var(--dmg-complete)" },
              { key: "partial", label: t("damage.partial"), className: "dmg-partial", dot: "var(--dmg-partial)" },
              { key: "minimal", label: t("damage.minimal"), className: "dmg-minimal", dot: "var(--dmg-minimal)" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`chip ${damageFilter === chip.key ? "on" : ""} ${chip.key !== "all" ? chip.className : ""}`}
              onClick={() => setDamageFilter(chip.key)}
            >
              {chip.key !== "all" && (
                <span className="cdot" style={{ background: chip.dot }} />
              )}
              {chip.label}
            </button>
          ))}
        </div>

        <div className="sort">
          <span className="label">{t("admin.sort")}</span>
          <select
            className="field"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="newest">{t("admin.sortNewest")}</option>
            <option value="severe">{t("admin.sortSevere")}</option>
          </select>
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--dmg-complete-ink)", marginBottom: 12, fontSize: 14 }}>
          {error}
        </p>
      )}

      <div className="admin-table">
        <div className="admin-thead admin-uthead">
          <span>{t("admin.colReport")}</span>
          <span>{t("admin.colCause")}</span>
          <span>{t("admin.colLocation")}</span>
          <span>{t("admin.colSubmitted")}</span>
          <span style={{ textAlign: "right" }}>{t("admin.colAssign")}</span>
        </div>

        {loading ? (
          <div className="admin-empty">{t("admin.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {t("admin.unlistedAllAssigned")}
          </div>
        ) : (
          filtered.map((report) => {
            const dmgClass = damageLevelClass(report.damage_level);
            const InfraIcon = INFRA_ICONS[report.infra_type] ?? MoreHorizontal;
            const locationLabel =
              addressLabels[report.id] ??
              briefLocationFromAdmin(report.location) ??
              t("admin.unlistedNoLocation");
            const busy = actionId === report.id;
            const lat = report.location?.latitude;
            const lng = report.location?.longitude;
            const reporter =
              report.reporter_name && report.reporter_name !== "anonymous"
                ? report.reporter_name
                : t("admin.anonymous");

            return (
              <div
                key={report.id}
                role="button"
                tabIndex={0}
                className={`admin-trow admin-urow ${selectedReportId === report.id ? "selected" : ""}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  openReportDetail(report.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openReportDetail(report.id);
                  }
                }}
              >
                <div className="admin-u-report">
                  <span className={`admin-u-swatch ${dmgClass}`}>
                    <InfraIcon strokeWidth={2} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="un">
                      {damageLevelLabel(report.damage_level)}{" "}
                      <span className="ui">{report.id.slice(0, 8)}</span>
                    </div>
                    <div className="us">
                      {infraTypeLabel(report.infra_type, report.infra_subtype)} ·{" "}
                      {reporter}
                    </div>
                  </span>
                </div>

                <div className="admin-c-onset">
                  <b>{report.nature_of_crisis ?? t("admin.unknownCause")}</b>
                </div>

                <div className="admin-c-loc">
                  <b>{locationLabel}</b>
                  {lat != null && lng != null && (
                    <div className="coords">
                      {lat.toFixed(4)}, {lng.toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="admin-c-onset">
                  {relativeTime(report.collected_at)}
                </div>

                <div className="admin-u-actions">
                  <button
                    type="button"
                    className="icon-btn sm"
                    title={t("admin.viewReport")}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      openReportDetail(report.id);
                    }}
                  >
                    <Eye strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy || assignableCrises.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuPop(null);
                      setAssignPop({ id: report.id, anchor: e.currentTarget });
                    }}
                  >
                    <Link2 strokeWidth={2} />
                    {t("admin.unlistedAssign")}
                    <ChevronDown className="chev" strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm"
                    title={t("admin.moreActions")}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignPop(null);
                      setMenuPop({ id: report.id, anchor: e.currentTarget });
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <circle cx="12" cy="5" r="1.4" />
                      <circle cx="12" cy="12" r="1.4" />
                      <circle cx="12" cy="19" r="1.4" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <PopoverMenu
        anchor={assignPop?.anchor ?? null}
        open={Boolean(assignPop && activeReport)}
        onClose={closePops}
      >
        <div className="pop-label">{t("admin.assignToCrisis")}</div>
        {assignableCrises.map((crisis) => {
          const iconClass = crisisTypeIconClass(crisis.crisis_type);
          const TypeIcon = TYPE_ICONS[iconClass];
          return (
            <button
              key={crisis.id}
              type="button"
              onClick={() => {
                if (assignPop) void handleAssign(assignPop.id, crisis.id);
                closePops();
              }}
            >
              <span
                className={`tico ${iconClass}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <TypeIcon width={13} height={13} strokeWidth={2} />
              </span>
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {crisis.name}
              </span>
            </button>
          );
        })}
        <div className="sep" />
        <button
          type="button"
          style={{ color: "var(--accent)", fontWeight: 600 }}
          onClick={() => {
            if (activeReport && onCreateFromReport) {
              onCreateFromReport(activeReport);
            }
            closePops();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("admin.createNewFromReport")}
        </button>
      </PopoverMenu>

      <PopoverMenu
        anchor={menuPop?.anchor ?? null}
        open={Boolean(menuPop && activeReport)}
        onClose={closePops}
      >
        {activeReport && (
          <>
            <button
              type="button"
              onClick={() => {
                openReportDetail(activeReport.id);
                closePops();
              }}
            >
              <Eye strokeWidth={2} />
              {t("admin.viewReport")}
            </button>
            <button
              type="button"
              onClick={() => {
                onCreateFromReport?.(activeReport);
                closePops();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("admin.createCrisisFromReport")}
            </button>
            <div className="sep" />
            <button
              type="button"
              className="danger"
              onClick={() => {
                void handleDelete(activeReport.id);
                closePops();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
              {t("admin.dismissReport")}
            </button>
          </>
        )}
      </PopoverMenu>

      <AdminReportDetailPanel
        reportId={selectedReportId}
        open={Boolean(selectedReportId)}
        crises={crises}
        onClose={closeReportDetail}
        onAssign={(anchor) => {
          if (selectedReportId) {
            setAssignPop({ id: selectedReportId, anchor });
          }
        }}
        onCreateCrisis={() => {
          if (selectedReport) {
            closeReportDetail();
            onCreateFromReport?.(selectedReport);
          }
        }}
        onDismiss={() => {
          if (selectedReportId) void handleDelete(selectedReportId);
        }}
        assignDisabled={assignableCrises.length === 0}
        actionDisabled={Boolean(actionId)}
      />
    </>
  );
}
