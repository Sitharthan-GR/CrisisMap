import { Activity, Map, MapPinPlus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useMobileNav, type MobilePanel } from "../lib/MobileNavContext";

export type MobileTab = MobilePanel | "report";

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { panel, setPanel, feedCount } = useMobileNav();

  const isReportRoute = location.pathname.startsWith("/report");

  const goToPanel = (next: MobilePanel) => {
    if (location.pathname !== "/") {
      navigate("/");
    }
    setPanel(next);
  };

  return (
    <nav className="mobile-bottom-nav" aria-label={t("mobileNav.ariaLabel")}>
      <button
        type="button"
        className={`mobile-nav-item${!isReportRoute && panel === "map" ? " active" : ""}`}
        onClick={() => goToPanel("map")}
        aria-current={!isReportRoute && panel === "map" ? "page" : undefined}
      >
        <Map strokeWidth={2.1} aria-hidden />
        <span>{t("mobileNav.map")}</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-item${!isReportRoute && panel === "search" ? " active" : ""}`}
        onClick={() => goToPanel("search")}
        aria-current={!isReportRoute && panel === "search" ? "page" : undefined}
      >
        <Search strokeWidth={2.1} aria-hidden />
        <span>{t("mobileNav.search")}</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-item${!isReportRoute && panel === "feed" ? " active" : ""}`}
        onClick={() => goToPanel("feed")}
        aria-current={!isReportRoute && panel === "feed" ? "page" : undefined}
      >
        <span className="mobile-nav-icon-wrap">
          <Activity strokeWidth={2.1} aria-hidden />
          {feedCount > 0 && (
            <span className="mobile-nav-badge" aria-hidden>
              {feedCount > 99 ? "99+" : feedCount}
            </span>
          )}
        </span>
        <span>{t("mobileNav.feed")}</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-item mobile-nav-report${isReportRoute ? " active" : ""}`}
        onClick={() => navigate("/report")}
        aria-current={isReportRoute ? "page" : undefined}
      >
        <MapPinPlus strokeWidth={2.1} aria-hidden />
        <span>{t("mobileNav.report")}</span>
      </button>
    </nav>
  );
}
