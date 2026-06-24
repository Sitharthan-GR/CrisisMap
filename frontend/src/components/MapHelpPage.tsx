import { ArrowLeft, ExternalLink, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MapMarkerIconKey } from "../lib/mapMarkers";
import {
  ALL_INFRA_KEYS,
  ALL_NATURE_KEYS,
  LEGEND_DAMAGE_LEVELS,
  markerIconHtml,
} from "../lib/mapMarkers";
import { DEMO_VIDEO_URL } from "../lib/constants";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

function MarkerSample({
  damageLevel,
  iconKey,
  label,
  hint,
}: {
  damageLevel: string;
  iconKey: MapMarkerIconKey;
  label: string;
  hint?: string;
}) {
  return (
    <li className="map-help-item">
      <div
        className="map-help-item__pin"
        dangerouslySetInnerHTML={{
          __html: markerIconHtml(damageLevel, iconKey),
        }}
      />
      <div className="map-help-item__text">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
    </li>
  );
}

export default function MapHelpPage() {
  const { t } = useTranslation();

  return (
    <div className="map-help-shell">
      <header className="map-help-header">
        <Link to="/" className="report-wizard-back">
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          {t("nav.dashboard")}
        </Link>
        <p className="map-help-header__title">{t("help.title")}</p>
        <div className="map-help-header__actions">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="map-help-main">
        <div className="map-help-card">
          <p className="map-help-intro">{t("help.intro")}</p>

          {DEMO_VIDEO_URL ? (
            <section className="map-help-section map-help-demo">
              <h2>{t("help.demoTitle")}</h2>
              <p className="map-help-section__lead">{t("help.demoLead")}</p>
              <div className="map-help-demo__player">
                <video
                  className="map-help-demo__video"
                  controls
                  preload="metadata"
                  playsInline
                  src={DEMO_VIDEO_URL}
                >
                  {t("help.demoFallback")}
                </video>
              </div>
              <a
                className="map-help-demo__link"
                href={DEMO_VIDEO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
                {t("help.demoOpen")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </section>
          ) : null}

          <section className="map-help-section">
            <h2>{t("help.damageTitle")}</h2>
            <p className="map-help-section__lead">{t("help.damageLead")}</p>
            <ul className="map-help-grid map-help-grid--damage">
              {LEGEND_DAMAGE_LEVELS.map((level) => (
                <MarkerSample
                  key={level}
                  damageLevel={level}
                  iconKey="residential"
                  label={t(`damage.${level}Title`)}
                  hint={t(`damage.${level}Sub`)}
                />
              ))}
            </ul>
          </section>

          <section className="map-help-section">
            <h2>{t("help.causeTitle")}</h2>
            <p className="map-help-section__lead">{t("help.causeLead")}</p>
            <ul className="map-help-grid">
              {ALL_NATURE_KEYS.map((cause) => (
                <MarkerSample
                  key={cause}
                  damageLevel="partial"
                  iconKey={cause}
                  label={t(`nature.${cause}`)}
                />
              ))}
            </ul>
          </section>

          <section className="map-help-section">
            <h2>{t("help.infraTitle")}</h2>
            <p className="map-help-section__lead">{t("help.infraLead")}</p>
            <ul className="map-help-grid">
              {ALL_INFRA_KEYS.map((infra) => (
                <MarkerSample
                  key={infra}
                  damageLevel="partial"
                  iconKey={infra}
                  label={t(`infra.${infra}`)}
                />
              ))}
            </ul>
          </section>

          <section className="map-help-section">
            <h2>{t("help.crisisTypeTitle")}</h2>
            <p className="map-help-section__lead">{t("help.crisisTypeLead")}</p>
            <ul className="map-help-type-list">
              <li>
                <span className="map-help-type-chip natural">{t("admin.crisisType.natural_hazard")}</span>
                <span>{t("help.crisisTypeNatural")}</span>
              </li>
              <li>
                <span className="map-help-type-chip technological">{t("admin.crisisType.technological")}</span>
                <span>{t("help.crisisTypeTech")}</span>
              </li>
              <li>
                <span className="map-help-type-chip human">{t("admin.crisisType.human_made")}</span>
                <span>{t("help.crisisTypeHuman")}</span>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
