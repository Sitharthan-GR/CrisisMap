import { Map, RefreshCw, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";

interface HeaderProps {
  onRefresh: () => void;
  loading?: boolean;
}

export default function Header({ onRefresh, loading }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="relative z-[1100] flex items-center justify-between overflow-visible border-b border-surface-border bg-surface-raised/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
          <Map className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">
            {t("app.name")}
          </h1>
          <p className="text-xs text-slate-400">{t("app.tagline")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          <Shield className="h-4 w-4" />
          {t("nav.admin")}
        </Link>
        <Link
          to="/report"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-muted"
        >
          {t("nav.reportDamage")}
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-surface-raised disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("nav.refresh")}
        </button>
      </div>
    </header>
  );
}
