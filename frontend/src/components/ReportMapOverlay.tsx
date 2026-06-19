import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, adminDeleteReport } from "../api/client";
import { getAdminToken, isAdminAuthenticated } from "../lib/adminAuth";
import ReportDetailContent from "./ReportDetailContent";

interface ReportMapOverlayProps {
  reportId: string;
  crisisName?: string;
  onClose: () => void;
  onSelectVersion?: (reportId: string) => void;
  onReportDeleted?: () => void;
}

export default function ReportMapOverlay({
  reportId,
  crisisName,
  onClose,
  onSelectVersion,
  onReportDeleted,
}: ReportMapOverlayProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = isAdminAuthenticated();

  const handleDelete = async () => {
    const token = getAdminToken();
    if (!token) return;
    if (!window.confirm(t("admin.deleteReportConfirm"))) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await adminDeleteReport(token, reportId);
      onReportDeleted?.();
      onClose();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : t("admin.errors.deleteFailed"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] flex max-h-[calc(100%-5.5rem)] flex-col overflow-hidden rounded-xl border border-surface-border bg-[#121820]/98 shadow-panel backdrop-blur sm:left-3 sm:right-auto sm:w-[min(100%,380px)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("reportDetail.title")}
        </p>
        <div className="flex items-center gap-1.5">
          {canDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              aria-label={t("admin.deleteReport")}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 px-2 text-[11px] font-medium text-red-300 transition hover:border-red-500/50 hover:bg-red-950/40 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? t("admin.deletingReport") : t("admin.deleteReport")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reportDetail.close")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-surface-border text-slate-400 transition hover:border-slate-500 hover:bg-surface hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {deleteError && (
        <div className="shrink-0 border-b border-red-500/30 bg-red-950/40 px-4 py-2 text-xs text-red-200">
          {deleteError}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ReportDetailContent
          reportId={reportId}
          crisisName={crisisName}
          variant="panel"
          onSelectVersion={onSelectVersion}
        />
      </div>
    </div>
  );
}
