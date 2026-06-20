import {
  ChevronDown,
  Crosshair,
  FlaskConical,
  LocateFixed,
  MapPin,
  Menu,
  Plus,
  Search,
  Shield,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

interface DashboardHeaderProps {
  onRailToggle: () => void;
  onFeedToggle: () => void;
}

export default function DashboardHeader({
  onRailToggle,
  onFeedToggle,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="dashboard-topbar">
      <button
        type="button"
        className="icon-btn sm rail-toggle"
        onClick={onRailToggle}
        title={t("panels.expandSearch")}
      >
        <Menu strokeWidth={2} />
      </button>

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
          <div className="bs">{t("app.tagline")}</div>
        </span>
      </div>

      <div className="spacer" />

      <LanguageSwitcher className="lang" variant="button" />
      <ThemeToggle />
      <Link to="/admin" className="btn btn-sm admin">
        <Shield strokeWidth={2} />
        {t("nav.admin")}
      </Link>
      <Link to="/report" className="btn btn-primary btn-sm">
        <Plus strokeWidth={2.2} />
        {t("nav.reportDamage")}
      </Link>
      <button
        type="button"
        className="icon-btn sm sheet-toggle"
        onClick={onFeedToggle}
        title={t("panels.expandFeed")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m3 12 4-9 5 18 4-12 2 5h3" />
        </svg>
      </button>
    </header>
  );
}

export {
  Crosshair,
  ChevronDown,
  FlaskConical,
  LocateFixed,
  MapPin,
  Search,
};
