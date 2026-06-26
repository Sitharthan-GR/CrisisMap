import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DemoVideoPlayer from "./DemoVideoPlayer";

type GuideStep = {
  titleKey: string;
  steps: string[];
};

const FIELD_SECTIONS: GuideStep[] = [
  { titleKey: "help.guideFieldReport", steps: ["help.guideFieldReport1", "help.guideFieldReport2", "help.guideFieldReport3", "help.guideFieldReport4", "help.guideFieldReport5", "help.guideFieldReport6", "help.guideFieldReport7", "help.guideFieldReport8", "help.guideFieldReport9"] },
  { titleKey: "help.guideFieldDashboard", steps: ["help.guideFieldDashboard1", "help.guideFieldDashboard2", "help.guideFieldDashboard3", "help.guideFieldDashboard4", "help.guideFieldDashboard5"] },
  { titleKey: "help.guideFieldOffline", steps: ["help.guideFieldOffline1", "help.guideFieldOffline2", "help.guideFieldOffline3", "help.guideFieldOffline4"] },
];

const ADMIN_SECTIONS: GuideStep[] = [
  { titleKey: "help.guideAdminSetup", steps: ["help.guideAdminSetup1", "help.guideAdminSetup2", "help.guideAdminSetup3", "help.guideAdminSetup4", "help.guideAdminSetup5", "help.guideAdminSetup6"] },
  { titleKey: "help.guideAdminOps", steps: ["help.guideAdminOps1", "help.guideAdminOps2", "help.guideAdminOps3", "help.guideAdminOps4", "help.guideAdminOps5"] },
  { titleKey: "help.guideAdminExport", steps: ["help.guideAdminExport1", "help.guideAdminExport2", "help.guideAdminExport3", "help.guideAdminExport4"] },
];

function GuideSection({ titleKey, steps }: GuideStep) {
  const { t } = useTranslation();

  return (
    <section className="help-guide-section">
      <h3>{t(titleKey)}</h3>
      <ol className="help-guide-steps">
        {steps.map((stepKey) => (
          <li key={stepKey}>{t(stepKey)}</li>
        ))}
      </ol>
    </section>
  );
}

export default function HowToUseGuide() {
  const { t } = useTranslation();

  return (
    <div className="help-panel">
      <p className="map-help-intro">{t("help.guideIntro")}</p>

      <div className="help-quick-links">
        <Link to="/report" className="help-quick-link">
          {t("nav.reportDamage")}
        </Link>
        <Link to="/" className="help-quick-link">
          {t("nav.dashboard")}
        </Link>
        <Link to="/admin" className="help-quick-link">
          {t("nav.admin")}
        </Link>
      </div>

      <DemoVideoPlayer />

      <section className="help-guide-group">
        <h2 className="help-guide-group__title">{t("help.guideFieldTitle")}</h2>
        {FIELD_SECTIONS.map((section) => (
          <GuideSection key={section.titleKey} {...section} />
        ))}
      </section>

      <section className="help-guide-group">
        <h2 className="help-guide-group__title">{t("help.guideAdminTitle")}</h2>
        {ADMIN_SECTIONS.map((section) => (
          <GuideSection key={section.titleKey} {...section} />
        ))}
      </section>
    </div>
  );
}
