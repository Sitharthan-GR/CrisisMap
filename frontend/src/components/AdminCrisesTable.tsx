import {
  Check,
  ChevronDown,
  Factory,
  Mountain,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  crisisTypeIconClass,
  type CrisisReportStats,
} from "../lib/adminCrisisStats";
import type { Crisis, CrisisStatus } from "../types/report";
import PopoverMenu from "./PopoverMenu";

const TYPE_ICONS: Record<"natural" | "technological" | "human", LucideIcon> = {
  natural: Mountain,
  technological: Factory,
  human: Star,
};

type StatusFilter = "all" | CrisisStatus;
type SortKey = "newest" | "reports" | "name" | "status";

interface AdminCrisesTableProps {
  crises: Crisis[];
  stats: Record<string, CrisisReportStats>;
  loading: boolean;
  savingId: string | null;
  placeLabels: Record<string, string>;
  onStatusChange: (crisisId: string, status: CrisisStatus) => void;
  onEdit: (crisis: Crisis) => void;
}

function formatOnset(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function sevbar(stats: CrisisReportStats) {
  const { sev } = stats;
  const total = sev.complete + sev.partial + sev.minimal || 1;
  const width = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <div
      className="sevbar"
      title={`${sev.complete} complete · ${sev.partial} partial · ${sev.minimal} minimal`}
    >
      <i className="s-complete" style={{ width: width(sev.complete) }} />
      <i className="s-partial" style={{ width: width(sev.partial) }} />
      <i className="s-minimal" style={{ width: width(sev.minimal) }} />
    </div>
  );
}

export default function AdminCrisesTable({
  crises,
  stats,
  loading,
  savingId,
  placeLabels,
  onStatusChange,
  onEdit,
}: AdminCrisesTableProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [statusPop, setStatusPop] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const [menuPop, setMenuPop] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);

  const listedCrises = useMemo(
    () => crises.filter((c) => !c.is_unlisted),
    [crises],
  );

  const filtered = useMemo(() => {
    let list = listedCrises.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const place = placeLabels[c.id] ?? "";
      return (
        c.name.toLowerCase().includes(q) ||
        t(`admin.crisisType.${c.crisis_type}`).toLowerCase().includes(q) ||
        c.crisis_subtype.toLowerCase().includes(q) ||
        place.toLowerCase().includes(q)
      );
    });

    if (sort === "reports") {
      list = [...list].sort(
        (a, b) => (stats[b.id]?.total ?? 0) - (stats[a.id]?.total ?? 0),
      );
    } else if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "status") {
      list = [...list].sort(
        (a, b) =>
          a.status.localeCompare(b.status) ||
          new Date(b.onset_at).getTime() - new Date(a.onset_at).getTime(),
      );
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.onset_at).getTime() - new Date(a.onset_at).getTime(),
      );
    }

    return list;
  }, [listedCrises, statusFilter, query, sort, stats, placeLabels, t]);

  const closePops = () => {
    setStatusPop(null);
    setMenuPop(null);
  };

  const activeCrisis = statusPop
    ? crises.find((c) => c.id === statusPop.id)
    : menuPop
      ? crises.find((c) => c.id === menuPop.id)
      : null;

  return (
    <>
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
            placeholder={t("admin.searchCrises")}
          />
        </div>

        <div className="seg-chips">
          {(
            [
              { key: "all", label: t("admin.filterAll") },
              { key: "active", label: t("admin.status.active"), dot: "var(--dmg-minimal)" },
              { key: "closed", label: t("admin.status.closed"), dot: "var(--text-faint)" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`chip ${statusFilter === chip.key ? "on" : ""}`}
              onClick={() => setStatusFilter(chip.key)}
            >
              {"dot" in chip && chip.dot ? (
                <span className="cdot" style={{ background: chip.dot }} />
              ) : null}
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
            <option value="reports">{t("admin.sortReports")}</option>
            <option value="name">{t("admin.sortName")}</option>
            <option value="status">{t("admin.sortStatus")}</option>
          </select>
        </div>
      </div>

      <div className="admin-table">
        <div className="admin-thead">
          <span>{t("admin.colCrisis")}</span>
          <span>{t("admin.colOnset")}</span>
          <span>{t("admin.colLocation")}</span>
          <span>{t("admin.colReports")}</span>
          <span>{t("admin.colStatus")}</span>
          <span style={{ textAlign: "right" }}>{t("admin.colActions")}</span>
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
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
            {t("admin.noCrisesMatch")}
          </div>
        ) : (
          filtered.map((crisis) => {
            const iconClass = crisisTypeIconClass(crisis.crisis_type);
            const TypeIcon = TYPE_ICONS[iconClass];
            const onset = formatOnset(crisis.onset_at);
            const crisisStats = stats[crisis.id] ?? {
              total: 0,
              sev: { complete: 0, partial: 0, minimal: 0 },
            };
            const hasCoords =
              typeof crisis.epicenter_lat === "number" &&
              typeof crisis.epicenter_lng === "number" &&
              !(crisis.epicenter_lat === 0 && crisis.epicenter_lng === 0);
            const place =
              placeLabels[crisis.id] ??
              (hasCoords ? t("admin.locationPending") : t("admin.unlistedNoLocation"));

            return (
              <div key={crisis.id} className="admin-trow">
                <div className="admin-c-crisis">
                  <span className={`tico ${iconClass}`}>
                    <TypeIcon strokeWidth={2} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="cn">{crisis.name}</div>
                    <div className="ct">
                      {t(`admin.crisisType.${crisis.crisis_type}`)} ·{" "}
                      {crisis.crisis_subtype}
                    </div>
                  </span>
                </div>

                <div className="admin-c-onset">
                  <b>{onset.date}</b>
                  {onset.time}
                </div>

                <div className="admin-c-loc">
                  <b>{place}</b>
                  {hasCoords && (
                    <div className="coords">
                      {crisis.epicenter_lat!.toFixed(4)},{" "}
                      {crisis.epicenter_lng!.toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="admin-c-reports">
                  <b>{crisisStats.total.toLocaleString()}</b>
                  {crisisStats.total > 0 && sevbar(crisisStats)}
                </div>

                <div>
                  <button
                    type="button"
                    className={`admin-statusbtn ${crisis.status}`}
                    disabled={savingId === crisis.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuPop(null);
                      setStatusPop({ id: crisis.id, anchor: e.currentTarget });
                    }}
                  >
                    <span className="sd" />
                    {t(`admin.status.${crisis.status}`)}
                    <ChevronDown className="chev" strokeWidth={2.4} />
                  </button>
                </div>

                <div className="admin-c-actions">
                  <Link
                    to="/"
                    className="icon-btn sm"
                    title={t("admin.viewOnDashboard")}
                    onClick={(e) => e.stopPropagation()}
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
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    className="icon-btn sm"
                    title={t("admin.moreActions")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatusPop(null);
                      setMenuPop({ id: crisis.id, anchor: e.currentTarget });
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
        anchor={statusPop?.anchor ?? null}
        open={Boolean(statusPop && activeCrisis)}
        onClose={closePops}
      >
        {activeCrisis &&
          (["active", "closed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                onStatusChange(activeCrisis.id, status);
                closePops();
              }}
            >
              <span
                className="dmg-dot minimal"
                style={
                  status === "closed"
                    ? { background: "var(--text-faint)" }
                    : undefined
                }
              />
              {t(`admin.status.${status}`)}
              {activeCrisis.status === status && (
                <Check className="check" strokeWidth={2.5} />
              )}
            </button>
          ))}
      </PopoverMenu>

      <PopoverMenu
        anchor={menuPop?.anchor ?? null}
        open={Boolean(menuPop && activeCrisis)}
        onClose={closePops}
      >
        {activeCrisis && (
          <>
            <button
              type="button"
              onClick={() => {
                onEdit(activeCrisis);
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
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              {t("admin.editCrisis")}
            </button>
            <button
              type="button"
              onClick={() => {
                onStatusChange(
                  activeCrisis.id,
                  activeCrisis.status === "active" ? "closed" : "active",
                );
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
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 2" />
              </svg>
              {activeCrisis.status === "active"
                ? t("admin.markClosed")
                : t("admin.reopenCrisis")}
            </button>
          </>
        )}
      </PopoverMenu>
    </>
  );
}
