import { Link2, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReportDetailContent from "./ReportDetailContent";

interface AdminReportDetailPanelProps {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
  onAssign: (anchor: HTMLElement) => void;
  onCreateCrisis: () => void;
  onDismiss: () => void;
  assignDisabled?: boolean;
  actionDisabled?: boolean;
}

export default function AdminReportDetailPanel({
  reportId,
  open,
  onClose,
  onAssign,
  onCreateCrisis,
  onDismiss,
  assignDisabled = false,
  actionDisabled = false,
}: AdminReportDetailPanelProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`admin-scrim ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`admin-panel admin-report-panel ${open ? "show" : ""}`}
        aria-hidden={!open}
        aria-labelledby="admin-report-panel-title"
      >
        <div className="admin-panel-head">
          <h2 id="admin-report-panel-title">{t("reportDetail.title")}</h2>
          <button
            type="button"
            className="icon-btn sm"
            onClick={onClose}
            aria-label={t("reportDetail.close")}
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

        <div className="admin-panel-body admin-report-panel-body">
          {reportId ? (
            <ReportDetailContent reportId={reportId} variant="panel" />
          ) : null}
        </div>

        <div className="admin-panel-foot admin-report-panel-foot">
          <button
            type="button"
            className="btn btn-sm"
            disabled={actionDisabled}
            onClick={onDismiss}
          >
            <Trash2 strokeWidth={2} />
            {t("admin.dismissReport")}
          </button>
          <div className="admin-report-panel-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={actionDisabled}
              onClick={onCreateCrisis}
            >
              <Plus strokeWidth={2.2} />
              {t("admin.createCrisisFromReport")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={assignDisabled || actionDisabled}
              onClick={(e) => onAssign(e.currentTarget)}
            >
              <Link2 strokeWidth={2} />
              {t("admin.unlistedAssign")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
