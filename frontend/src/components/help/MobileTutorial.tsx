import { History, Map, MapPinPlus, Search, Share2, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type NavTab = "map" | "search" | "feed" | "report";

type TutorialStep = {
  src: string;
  titleKey: string;
  bodyKey: string;
  /** Bottom-nav tab to call out with a red circle */
  highlight?: NavTab;
};

type FeatureItem = {
  icon: typeof Map;
  titleKey: string;
  bodyKey: string;
};

const TAB_LEFT: Record<NavTab, string> = {
  map: "13.5%",
  search: "38%",
  feed: "63.5%",
  report: "86.5%",
};

const STEPS: TutorialStep[] = [
  {
    src: "/help/mobile/01-map",
    titleKey: "help.mobileStepMapTitle",
    bodyKey: "help.mobileStepMapBody",
    highlight: "map",
  },
  {
    src: "/help/mobile/02-search",
    titleKey: "help.mobileStepSearchTitle",
    bodyKey: "help.mobileStepSearchBody",
    highlight: "search",
  },
  {
    src: "/help/mobile/03-feed",
    titleKey: "help.mobileStepFeedTitle",
    bodyKey: "help.mobileStepFeedBody",
    highlight: "feed",
  },
  {
    src: "/help/mobile/04-report-damage",
    titleKey: "help.mobileStepDamageTitle",
    bodyKey: "help.mobileStepDamageBody",
    highlight: "report",
  },
  {
    src: "/help/mobile/05-report-infra",
    titleKey: "help.mobileStepInfraTitle",
    bodyKey: "help.mobileStepInfraBody",
    highlight: "report",
  },
  {
    src: "/help/mobile/07-report-location",
    titleKey: "help.mobileStepLocationTitle",
    bodyKey: "help.mobileStepLocationBody",
    highlight: "report",
  },
];

const FEATURES: FeatureItem[] = [
  {
    icon: Map,
    titleKey: "help.featureMapTitle",
    bodyKey: "help.featureMapBody",
  },
  {
    icon: Search,
    titleKey: "help.featureSearchTitle",
    bodyKey: "help.featureSearchBody",
  },
  {
    icon: MapPinPlus,
    titleKey: "help.featureReportTitle",
    bodyKey: "help.featureReportBody",
  },
  {
    icon: History,
    titleKey: "help.featureHistoryTitle",
    bodyKey: "help.featureHistoryBody",
  },
  {
    icon: Share2,
    titleKey: "help.featureShareTitle",
    bodyKey: "help.featureShareBody",
  },
  {
    icon: WifiOff,
    titleKey: "help.featureOfflineTitle",
    bodyKey: "help.featureOfflineBody",
  },
];

function PhoneFrame({
  children,
  callout,
}: {
  children: ReactNode;
  callout?: ReactNode;
}) {
  return (
    <figure className="help-mobile-phone">
      <div className="help-mobile-phone__bezel">
        <span className="help-mobile-phone__notch" aria-hidden />
        <div className="help-mobile-phone__screen">{children}</div>
        {callout}
      </div>
    </figure>
  );
}

function TabCallout({ tab }: { tab: NavTab }) {
  const { t } = useTranslation();
  return (
    <span
      className={`help-mobile-callout help-mobile-callout--${tab}`}
      style={{ left: TAB_LEFT[tab] }}
      data-tab={tab}
      aria-label={t("help.mobileTapHere")}
    >
      <span className="help-mobile-callout__ring" />
      <span className="help-mobile-callout__pulse" />
    </span>
  );
}

function HistoryExample() {
  const { t } = useTranslation();

  const versions = [
    {
      level: t("damage.partialTitle"),
      when: t("help.historyExampleV3When"),
      version: "v3",
      color: "var(--dmg-partial)",
      active: true,
    },
    {
      level: t("damage.minimalTitle"),
      when: t("help.historyExampleV2When"),
      version: "v2",
      color: "var(--dmg-minimal)",
      active: false,
    },
    {
      level: t("damage.completeTitle"),
      when: t("help.historyExampleV1When"),
      version: "v1",
      color: "var(--dmg-complete)",
      active: false,
    },
  ];

  return (
    <div className="help-mobile-mock" aria-hidden={false}>
      <div className="help-mobile-mock__bar">
        <span>{t("reportDetail.title")}</span>
        <span className="help-mobile-mock__share-chip">
          <Share2 strokeWidth={2} aria-hidden />
          {t("reportDetail.share")}
        </span>
      </div>

      <div className="help-mobile-mock__tabs">
        <span>{t("reportDetail.tabInfo")}</span>
        <span>{t("reportDetail.tabPhotos")}</span>
        <span className="on help-mobile-mock__target">
          {t("reportDetail.tabHistory")}
          <span className="help-mobile-callout help-mobile-callout--on-target" aria-hidden>
            <span className="help-mobile-callout__ring" />
            <span className="help-mobile-callout__pulse" />
          </span>
        </span>
      </div>

      <p className="help-mobile-mock__hint">{t("help.historyExampleHint")}</p>
      <p className="help-mobile-mock__section">{t("reportDetail.damageHistoryTitle")}</p>

      <ol className="help-mobile-mock__timeline">
        {versions.map((version, index) => (
          <li key={version.version}>
            {index < versions.length - 1 ? (
              <span className="help-mobile-mock__line" aria-hidden />
            ) : null}
            <span
              className="help-mobile-mock__dot"
              style={{ backgroundColor: version.color }}
              aria-hidden
            />
            <div>
              <p className="help-mobile-mock__level">{version.level}</p>
              <p className="help-mobile-mock__meta">
                {version.when} · {version.version}
              </p>
              {version.active ? (
                <p className="help-mobile-mock__active">
                  {t("reportDetail.viewingVersion")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShareExample() {
  const { t } = useTranslation();

  return (
    <div className="help-mobile-mock">
      <div className="help-mobile-mock__bar">
        <span>{t("reportDetail.title")}</span>
        <span className="help-mobile-mock__share-chip help-mobile-mock__share-chip--focus help-mobile-mock__target">
          <Share2 strokeWidth={2} aria-hidden />
          {t("reportDetail.share")}
          <span className="help-mobile-callout help-mobile-callout--on-target" aria-hidden>
            <span className="help-mobile-callout__ring" />
            <span className="help-mobile-callout__pulse" />
          </span>
        </span>
      </div>

      <div className="help-mobile-mock__tabs">
        <span className="on">{t("reportDetail.tabInfo")}</span>
        <span>{t("reportDetail.tabPhotos")}</span>
        <span>{t("reportDetail.tabHistory")}</span>
      </div>

      <div className="help-mobile-mock__card">
        <p className="help-mobile-mock__level">
          <span
            className="help-mobile-mock__dmg"
            style={{ backgroundColor: "var(--dmg-partial)" }}
            aria-hidden
          />
          {t("damage.partialTitle")}
        </p>
        <p className="help-mobile-mock__meta">{t("help.shareExampleMeta")}</p>
        <p className="help-mobile-mock__hint">{t("help.shareExampleHint")}</p>
        <div className="help-mobile-mock__toast">{t("reportDetail.shareCopied")}</div>
      </div>
    </div>
  );
}

export default function MobileTutorial() {
  const { t } = useTranslation();

  return (
    <section className="help-mobile-tutorial" aria-labelledby="help-mobile-tutorial-title">
      <div className="help-mobile-tutorial__header">
        <p className="help-mobile-tutorial__eyebrow">{t("help.mobileEyebrow")}</p>
        <h2 id="help-mobile-tutorial-title">{t("help.mobileTitle")}</h2>
        <p className="help-mobile-tutorial__lead">{t("help.mobileLead")}</p>
      </div>

      <ul className="help-feature-list">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.titleKey} className="help-feature-item">
              <span className="help-feature-item__icon" aria-hidden>
                <Icon strokeWidth={2} />
              </span>
              <div>
                <h3>{t(feature.titleKey)}</h3>
                <p>{t(feature.bodyKey)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <ol className="help-mobile-tutorial__track">
        {STEPS.map((step, index) => (
          <li key={step.src} className="help-mobile-step">
            <div className="help-mobile-step__copy">
              <span className="help-mobile-step__num" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{t(step.titleKey)}</h3>
              <p>{t(step.bodyKey)}</p>
            </div>

            <PhoneFrame
              callout={
                step.highlight ? <TabCallout tab={step.highlight} /> : null
              }
            >
              <picture>
                <source srcSet={`${step.src}.webp`} type="image/webp" />
                <img
                  src={`${step.src}.png`}
                  alt={t(step.titleKey)}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  width={390}
                  height={664}
                />
              </picture>
            </PhoneFrame>
          </li>
        ))}

        <li className="help-mobile-step">
          <div className="help-mobile-step__copy">
            <span className="help-mobile-step__num" aria-hidden>
              07
            </span>
            <h3>{t("help.mobileStepHistoryTitle")}</h3>
            <p>{t("help.mobileStepHistoryBody")}</p>
          </div>
          <PhoneFrame>
            <HistoryExample />
          </PhoneFrame>
        </li>

        <li className="help-mobile-step">
          <div className="help-mobile-step__copy">
            <span className="help-mobile-step__num" aria-hidden>
              08
            </span>
            <h3>{t("help.mobileStepShareTitle")}</h3>
            <p>{t("help.mobileStepShareBody")}</p>
          </div>
          <PhoneFrame>
            <ShareExample />
          </PhoneFrame>
        </li>
      </ol>
    </section>
  );
}
