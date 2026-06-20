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
    <div className="rd-overlay">
      <div className="rd-eyebrow">
        <span className="label">{t("reportDetail.title")}</span>
        {canDelete && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="btn btn-sm"
            style={{
              marginRight: 40,
              borderColor: "var(--dmg-complete)",
              color: "var(--dmg-complete-ink)",
            }}
          >
            <Trash2 strokeWidth={2} />
            {deleting ? t("admin.deletingReport") : t("admin.deleteReport")}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-btn sm rd-close"
        onClick={onClose}
        aria-label={t("reportDetail.close")}
      >
        <X strokeWidth={2.2} />
      </button>
      {deleteError && (
        <div
          className="hint"
          style={{ color: "var(--dmg-complete-ink)", marginBottom: 8 }}
        >
          {deleteError}
        </div>
      )}
      <div className="rd-body">
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
