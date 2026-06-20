import {
  Archive,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  LogOut,
  MapPin,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ApiError,
  adminCreateCrisis,
  adminCreateCrisisFromReport,
  adminFetchCrises,
  adminLogin,
  adminUpdateCrisis,
  fetchReverseGeocode,
} from "../api/client";
import {
  clearAdminToken,
  getAdminToken,
  isAdminAuthenticated,
  setAdminToken,
} from "../lib/adminAuth";
import {
  fetchAllCrisisReportStats,
  type CrisisReportStats,
} from "../lib/adminCrisisStats";
import { shortAddress } from "../lib/address";
import type { Crisis, CrisisStatus, ReportDetail } from "../types/report";
import AdminCrisisPanel, {
  type CrisisPanelValues,
} from "./AdminCrisisPanel";
import AdminCrisesTable from "./AdminCrisesTable";
import CrisisExportModal from "./CrisisExportModal";
import ThemeToggle from "./ThemeToggle";
import UnlistedReportsPanel from "./UnlistedReportsPanel";

type AdminView = "crises" | "unlisted";

function toIsoUtcFromLocal(value: string): string {
  return new Date(value).toISOString();
}

export default function AdminPage() {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [crises, setCrises] = useState<Crisis[]>([]);
  const [stats, setStats] = useState<Record<string, CrisisReportStats>>({});
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [placeLabels, setPlaceLabels] = useState<Record<string, string>>({});
  const adminToken = getAdminToken();

  const [view, setView] = useState<AdminView>("crises");
  const [unlistedCount, setUnlistedCount] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingCrisis, setEditingCrisis] = useState<Crisis | null>(null);
  const [fromReport, setFromReport] = useState<ReportDetail | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const listedCrises = useMemo(
    () => crises.filter((c) => !c.is_unlisted),
    [crises],
  );

  const loadCrises = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setAuthenticated(false);
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const data = await adminFetchCrises(token);
      setCrises(data);

      const listed = data.filter((c) => !c.is_unlisted);
      const nextStats = await fetchAllCrisisReportStats(listed.map((c) => c.id));
      setStats(nextStats);
      setAuthenticated(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        clearAdminToken();
        setAuthenticated(false);
        return;
      }
      setListError(
        err instanceof ApiError ? err.message : t("admin.errors.loadFailed"),
      );
    } finally {
      setListLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authenticated) {
      void loadCrises();
    }
  }, [authenticated, loadCrises]);

  useEffect(() => {
    const controller = new AbortController();

    for (const crisis of listedCrises) {
      const lat = crisis.epicenter_lat;
      const lng = crisis.epicenter_lng;
      if (lat == null || lng == null || (lat === 0 && lng === 0)) continue;

      void fetchReverseGeocode(lat, lng, controller.signal)
        .then((geo) => {
          const name = geo.display_name?.trim();
          if (!name) return;
          setPlaceLabels((prev) => ({
            ...prev,
            [crisis.id]: shortAddress(name, 2),
          }));
        })
        .catch(() => {
          // coords fallback in table
        });
    }

    return () => controller.abort();
  }, [listedCrises]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const { token } = await adminLogin(password);
      setAdminToken(token);
      setPassword("");
      setAuthenticated(true);
    } catch (err) {
      setLoginError(
        err instanceof ApiError ? err.message : t("admin.errors.loginFailed"),
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setAuthenticated(false);
    setCrises([]);
    setStats({});
  };

  const openCreatePanel = () => {
    setEditingCrisis(null);
    setFromReport(null);
    setPanelError(null);
    setPanelOpen(true);
  };

  const openEditPanel = (crisis: Crisis) => {
    setEditingCrisis(crisis);
    setFromReport(null);
    setPanelError(null);
    setPanelOpen(true);
  };

  const openCreateFromReport = (report: ReportDetail) => {
    setEditingCrisis(null);
    setFromReport(report);
    setPanelError(null);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingCrisis(null);
    setFromReport(null);
    setPanelError(null);
  };

  const handlePanelSave = async (values: CrisisPanelValues) => {
    const token = getAdminToken();
    if (!token) return;

    setPanelLoading(true);
    setPanelError(null);

    try {
      const hasCoords = Boolean(values.latitude && values.longitude);
      const coords = hasCoords
        ? {
            epicenter_lat: Number(values.latitude),
            epicenter_lng: Number(values.longitude),
          }
        : {};

      if (editingCrisis) {
        await adminUpdateCrisis(token, editingCrisis.id, {
          name: values.name.trim(),
        });
      } else if (fromReport) {
        await adminCreateCrisisFromReport(token, fromReport.id, {
          name: values.name.trim(),
          crisis_type: values.crisisType,
          crisis_subtype: values.crisisSubtype.trim(),
          onset_at: toIsoUtcFromLocal(values.onsetAt),
          ...coords,
        });
      } else {
        await adminCreateCrisis(token, {
          name: values.name.trim(),
          crisis_type: values.crisisType,
          crisis_subtype: values.crisisSubtype.trim(),
          onset_at: toIsoUtcFromLocal(values.onsetAt),
          ...coords,
        });
      }

      closePanel();
      await loadCrises();
    } catch (err) {
      setPanelError(
        err instanceof ApiError ? err.message : t("admin.errors.createFailed"),
      );
    } finally {
      setPanelLoading(false);
    }
  };

  const handleStatusChange = async (crisisId: string, status: CrisisStatus) => {
    const token = getAdminToken();
    if (!token) return;

    setSavingId(crisisId);
    setListError(null);
    try {
      await adminUpdateCrisis(token, crisisId, { status });
      setCrises((prev) =>
        prev.map((crisis) =>
          crisis.id === crisisId ? { ...crisis, status } : crisis,
        ),
      );
    } catch (err) {
      setListError(
        err instanceof ApiError ? err.message : t("admin.errors.updateFailed"),
      );
    } finally {
      setSavingId(null);
    }
  };

  const kpiStats = useMemo(() => {
    const active = listedCrises.filter((c) => c.status === "active").length;
    const closed = listedCrises.length - active;
    const reports = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
    return {
      total: listedCrises.length,
      active,
      closed,
      reports,
    };
  }, [listedCrises, stats]);

  if (!authenticated) {
    return (
      <div className="admin-app">
        <header className="admin-topbar">
          <div className="dashboard-brand">
            <span className="mark">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
                <path d="M9 4v14M15 6v14" />
              </svg>
            </span>
            <span>
              <div className="bt">{t("app.name")}</div>
              <div className="bs">{t("admin.consoleSubtitle")}</div>
            </span>
          </div>
          <div className="spacer" />
          <Link to="/" className="backlink">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t("nav.backToDashboard")}
          </Link>
        </header>

        <div className="admin-login-wrap">
          <form className="admin-login-card" onSubmit={(e) => void handleLogin(e)}>
            <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>
              {t("admin.title")}
            </h1>
            <p style={{ margin: "0 0 20px", color: "var(--text-dim)", fontSize: 14 }}>
              {t("admin.loginSubtitle")}
            </p>

            <label className="admin-fieldset">
              <span className="label">{t("admin.passwordLabel")}</span>
              <div style={{ position: "relative", marginTop: 7 }}>
                <Lock
                  style={{
                    position: "absolute",
                    left: 13,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 16,
                    height: 16,
                    color: "var(--text-faint)",
                  }}
                />
                <input
                  type="password"
                  className="field"
                  style={{ paddingLeft: 40 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>

            {loginError && (
              <p style={{ color: "var(--dmg-complete-ink)", fontSize: 14, marginTop: 12 }}>
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={loginLoading || !password}
            >
              {loginLoading ? t("admin.signingIn") : t("admin.signIn")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div className="dashboard-brand">
          <span className="mark">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </span>
          <span>
            <div className="bt">{t("app.name")}</div>
            <div className="bs">{t("admin.consoleSubtitle")}</div>
          </span>
        </div>
        <div className="spacer" />
        <Link to="/" className="backlink">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t("nav.backToDashboard")}
        </Link>
        <ThemeToggle />
        <button
          type="button"
          className="btn btn-sm hide-sm"
          onClick={() => setExportOpen(true)}
        >
          <Download strokeWidth={2} />
          {t("export.openModal")}
        </button>
        <button type="button" className="btn btn-sm hide-sm" onClick={handleLogout}>
          <LogOut strokeWidth={2} />
          {t("admin.signOut")}
        </button>
      </header>

      <main className="admin-page">
        <div className="admin-page-head">
          <div>
            <h1>{t("admin.pageTitle")}</h1>
            <p>{t("admin.pageSubtitle")}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreatePanel}>
            <Plus strokeWidth={2.2} />
            {t("admin.newCrisis")}
          </button>
        </div>

        <div className="admin-kpis">
          <div className="admin-kpi">
            <div className="kl">
              <Archive strokeWidth={2} />
              {t("admin.kpiTotal")}
            </div>
            <div className="kn">{kpiStats.total}</div>
            <div className="ks">{t("admin.kpiTotalHint")}</div>
          </div>
          <div className="admin-kpi accent">
            <div className="kl">
              <Clock strokeWidth={2} />
              {t("admin.kpiActive")}
            </div>
            <div className="kn">{kpiStats.active}</div>
            <div className="ks">{t("admin.kpiActiveHint")}</div>
          </div>
          <div className="admin-kpi">
            <div className="kl">
              <CheckCircle2 strokeWidth={2} />
              {t("admin.kpiClosed")}
            </div>
            <div className="kn">{kpiStats.closed}</div>
            <div className="ks">{t("admin.kpiClosedHint")}</div>
          </div>
          <div className="admin-kpi">
            <div className="kl">
              <MapPin strokeWidth={2} />
              {t("admin.kpiReports")}
            </div>
            <div className="kn">{kpiStats.reports.toLocaleString()}</div>
            <div className="ks">{t("admin.kpiReportsHint")}</div>
          </div>
        </div>

        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab ${view === "crises" ? "on" : ""}`}
            onClick={() => setView("crises")}
          >
            {t("admin.allCrises")}
            <span className="count">{listedCrises.length}</span>
          </button>
          <button
            type="button"
            className={`admin-tab ${view === "unlisted" ? "on" : ""}`}
            onClick={() => setView("unlisted")}
          >
            {t("admin.unlistedReports")}
            <span className={`count ${unlistedCount > 0 ? "warn" : ""}`}>
              {unlistedCount}
            </span>
          </button>
        </div>

        {listError && (
          <p style={{ color: "var(--dmg-complete-ink)", marginBottom: 16, fontSize: 14 }}>
            {listError}
          </p>
        )}

        {view === "crises" ? (
          <AdminCrisesTable
            crises={crises}
            stats={stats}
            loading={listLoading}
            savingId={savingId}
            placeLabels={placeLabels}
            onStatusChange={(id, status) => void handleStatusChange(id, status)}
            onEdit={openEditPanel}
          />
        ) : (
          <UnlistedReportsPanel
            crises={crises}
            onCrisesChange={loadCrises}
            onCountChange={setUnlistedCount}
            onCreateFromReport={openCreateFromReport}
          />
        )}
      </main>

      <AdminCrisisPanel
        open={panelOpen}
        editingCrisis={editingCrisis}
        fromReport={fromReport}
        loading={panelLoading}
        error={panelError}
        onClose={closePanel}
        onSave={(values) => void handlePanelSave(values)}
      />

      {adminToken && (
        <CrisisExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          crises={crises}
          adminToken={adminToken}
        />
      )}
    </div>
  );
}
