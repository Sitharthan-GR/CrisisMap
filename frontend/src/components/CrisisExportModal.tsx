import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  ApiError,
  downloadAdminExport,
  type ExportFormat,
  type ExportQueryParams,
} from "../api/client";
import type { Crisis } from "../types/report";

interface CrisisExportModalProps {
  open: boolean;
  onClose: () => void;
  crises: Crisis[];
  adminToken: string;
}

export default function CrisisExportModal({
  open,
  onClose,
  crises,
  adminToken,
}: CrisisExportModalProps) {
  const { t } = useTranslation();
  const exportableCrises = useMemo(
    () => crises.filter((crisis) => !crisis.is_unlisted),
    [crises],
  );

  const [crisisId, setCrisisId] = useState<string>("all");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [status, setStatus] = useState<ExportQueryParams["status"]>("validated");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (crisisId !== "all" && !exportableCrises.some((crisis) => crisis.id === crisisId)) {
      setCrisisId(exportableCrises.length === 1 ? exportableCrises[0].id : "all");
    }
  }, [open, crisisId, exportableCrises]);

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
    status,
    ...(dateFrom ? { date_from: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo ? { date_to: new Date(dateTo).toISOString() } : {}),
  };

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
            <label className="label" htmlFor="export-crisis">
              {t("export.crisisFilter")}
            </label>
            <select
              id="export-crisis"
              className="field"
              value={crisisId}
              onChange={(e) => setCrisisId(e.target.value)}
            >
              <option value="all">{t("export.allCrises")}</option>
              {exportableCrises.map((crisis) => (
                <option key={crisis.id} value={crisis.id}>
                  {crisis.name}
                </option>
              ))}
            </select>
          </div>

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

          <div className="admin-fieldset">
            <label className="label" htmlFor="export-status">
              {t("export.statusFilter")}
            </label>
            <select
              id="export-status"
              className="field"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as ExportQueryParams["status"])
              }
            >
              <option value="validated">{t("export.statusValidated")}</option>
              <option value="all">{t("export.statusAll")}</option>
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
            disabled={loading || exportableCrises.length === 0}
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
