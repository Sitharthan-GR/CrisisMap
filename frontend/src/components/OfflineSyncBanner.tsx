import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  runOfflineSync,
  subscribeOfflineSync,
  type OfflineSyncState,
} from "../lib/offlineSync";

export default function OfflineSyncBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<OfflineSyncState>({
    pendingCount: 0,
    syncing: false,
    lastSyncedAt: null,
  });

  useEffect(() => subscribeOfflineSync(setState), []);

  if (state.pendingCount === 0 && !state.syncing) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
      <div className="flex min-w-0 items-center gap-2">
        {state.syncing ? (
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
        )}
        <p className="truncate">
          {state.syncing
            ? t("offline.syncing", { count: state.pendingCount })
            : t("offline.pending", { count: state.pendingCount })}
        </p>
      </div>
      {!state.syncing && (
        <button
          type="button"
          onClick={() => void runOfflineSync()}
          className="shrink-0 rounded-md border border-amber-500/40 px-2 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-500/10"
        >
          {t("offline.retryNow")}
        </button>
      )}
    </div>
  );
}
