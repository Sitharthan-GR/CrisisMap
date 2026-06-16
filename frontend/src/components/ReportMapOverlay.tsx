import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReportDetailContent from "./ReportDetailContent";

interface ReportMapOverlayProps {
  reportId: string;
  crisisName?: string;
  onClose: () => void;
  onSelectVersion?: (reportId: string) => void;
}

export default function ReportMapOverlay({
  reportId,
  crisisName,
  onClose,
  onSelectVersion,
}: ReportMapOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] flex max-h-[calc(100%-5.5rem)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised/98 shadow-panel backdrop-blur sm:left-3 sm:right-auto sm:w-[min(100%,320px)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("reportDetail.title")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("reportDetail.close")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-surface-border text-slate-400 transition hover:border-slate-500 hover:bg-surface hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
