import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HowToUseGuide from "./help/HowToUseGuide";
import LoadTestingResults from "./help/LoadTestingResults";
import MapLegendGuide from "./help/MapLegendGuide";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

type HelpTab = "legend" | "guide" | "performance";

const TABS: { id: HelpTab; labelKey: string }[] = [
  { id: "legend", labelKey: "help.tabLegend" },
  { id: "guide", labelKey: "help.tabGuide" },
  { id: "performance", labelKey: "help.tabPerformance" },
];

export default function MapHelpPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<HelpTab>("legend");

  return (
    <div className="map-help-shell">
      <header className="map-help-header">
        <Link to="/" className="report-wizard-back">
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          {t("nav.dashboard")}
        </Link>
        <p className="map-help-header__title">{t("help.pageTitle")}</p>
        <div className="map-help-header__actions">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="map-help-main">
        <div className="map-help-card">
          <div className="map-help-layout">
            <nav
              className="help-nav"
              role="tablist"
              aria-label={t("help.pageTitle")}
              aria-orientation="vertical"
            >
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`help-nav__item${tab === item.id ? " on" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </nav>

            <div className="help-content" role="tabpanel">
              {tab === "legend" ? <MapLegendGuide /> : null}
              {tab === "guide" ? <HowToUseGuide /> : null}
              {tab === "performance" ? <LoadTestingResults /> : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
