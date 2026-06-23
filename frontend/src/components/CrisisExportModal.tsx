import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  ApiError,
  downloadAdminExport,
  type ExportFormat,
  type ExportIncludeScope,
  type ExportQueryParams,
} from "../api/client";
import type { Crisis } from "../types/report";

interface CrisisExportModalProps {
  open: boolean;
  onClose: () => void;
  crises: Crisis[];
  adminToken: string;
}

function crisesForIncludeScope(
  crises: Crisis[],
  include: ExportIncludeScope,
): Crisis[] {
  if (include === "unlisted") {
    return crises.filter((crisis) => crisis.is_unlisted);
  }
  if (include === "active") {
    return crises.filter((crisis) => crisis.status === "active" && !crisis.is_unlisted);
  }
  if (include === "closed") {
    return crises.filter((crisis) => crisis.status === "closed" && !crisis.is_unlisted);
  }
  return crises.filter((crisis) => !crisis.is_unlisted);
}

export default function CrisisExportModal({
  open,
  onClose,
  crises,
  adminToken,
}: CrisisExportModalProps) {
  const { t } = useTranslation();

  const [crisisId, setCrisisId] = useState<string>("all");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [include, setInclude] = useState<ExportIncludeScope>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportableCrises = useMemo(
    () => crisesForIncludeScope(crises, include),
    [crises, include],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (include === "unlisted") {
      setCrisisId("all");
      return;
    }
    if (crisisId !== "all" && !exportableCrises.some((crisis) => crisis.id === crisisId)) {
      setCrisisId(exportableCrises.length === 1 ? exportableCrises[0].id : "all");
    }
  }, [open, crisisId, exportableCrises, include]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const params: ExportQueryParams = {
    include,
    ...(dateFrom ? { date_from: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo ? { date_to: new Date(dateTo).toISOString() } : {}),
  };

  const canExport = include === "unlisted" || exportableCrises.length > 0;

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      await downloadAdminExport(adminToken, {
        crisisId: crisisId as string | "all",
        format,
        params,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t("export.errors.failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="export-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="export-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="export-modal-head">
          <div>
            <h2 id="export-modal-title">{t("export.modalTitle")}</h2>
            <p>{t("export.modalSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn sm"
            aria-label={t("export.close")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="export-modal-body">
          <div className="admin-fieldset">
            <label className="label" htmlFor="export-include">
              {t("export.statusFilter")}
            </label>
            <select
              id="export-include"
              className="field"
              value={include}
              onChange={(e) =>
                setInclude(e.target.value as ExportIncludeScope)
              }
            >
              <option value="all">{t("export.includeAll")}</option>
              <option value="active">{t("export.includeActive")}</option>
              <option value="closed">{t("export.includeClosed")}</option>
              <option value="unlisted">{t("export.includeUnlisted")}</option>
            </select>
          </div>

          {include !== "unlisted" && (
            <div className="admin-fieldset">
              <label className="label" htmlFor="export-crisis">
                {t("export.crisisFilter")}
              </label>
              <select
                id="export-crisis"
                className="field"
                value={crisisId}
                onChange={(e) => setCrisisId(e.target.value)}
                disabled={exportableCrises.length === 0}
              >
                <option value="all">{t("export.allCrises")}</option>
                {exportableCrises.map((crisis) => (
                  <option key={crisis.id} value={crisis.id}>
                    {crisis.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="admin-fieldset">
            <label className="label" htmlFor="export-format">
              {t("export.format")}
            </label>
            <select
              id="export-format"
              className="field"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="csv">{t("export.csv")}</option>
              <option value="geojson">{t("export.geojson")}</option>
              <option value="shapefile">{t("export.shapefile")}</option>
            </select>
          </div>

          <div className="export-grid-2">
            <div className="admin-fieldset">
              <label className="label" htmlFor="export-date-from">
                {t("export.dateFrom")}
              </label>
              <input
                id="export-date-from"
                type="date"
                className="field"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="admin-fieldset">
              <label className="label" htmlFor="export-date-to">
                {t("export.dateTo")}
              </label>
              <input
                id="export-date-to"
                type="date"
                className="field"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {format === "shapefile" && (
            <p className="export-hint">{t("export.shapefileHint")}</p>
          )}

          {error && <p className="export-error">{error}</p>}
        </div>

        <div className="export-modal-foot">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleExport()}
            disabled={loading || !canExport}
          >
            <Download strokeWidth={2} />
            {loading ? t("export.downloading") : t("export.exportButton")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
