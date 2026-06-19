import { Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="export-modal-title" className="text-base font-semibold text-white">
              {t("export.modalTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t("export.modalSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-surface hover:text-white"
            aria-label={t("export.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            {t("export.crisisFilter")}
            <select
              value={crisisId}
              onChange={(e) => setCrisisId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
            >
              <option value="all">{t("export.allCrises")}</option>
              {exportableCrises.map((crisis) => (
                <option key={crisis.id} value={crisis.id}>
                  {crisis.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            {t("export.format")}
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
            >
              <option value="csv">{t("export.csv")}</option>
              <option value="geojson">{t("export.geojson")}</option>
              <option value="shapefile">{t("export.shapefile")}</option>
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            {t("export.statusFilter")}
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as ExportQueryParams["status"])
              }
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
            >
              <option value="validated">{t("export.statusValidated")}</option>
              <option value="all">{t("export.statusAll")}</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-400">
              {t("export.dateFrom")}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs text-slate-400">
              {t("export.dateTo")}
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>

        {format === "shapefile" && (
          <p className="mt-3 text-[11px] text-slate-500">{t("export.shapefileHint")}</p>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            {t("admin.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={loading || exportableCrises.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {loading ? t("export.downloading") : t("export.exportButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
