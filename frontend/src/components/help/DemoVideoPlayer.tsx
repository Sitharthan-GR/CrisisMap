import { ExternalLink, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDemoVideoSource } from "../../hooks/useDemoVideoSource";

export default function DemoVideoPlayer() {
  const { t } = useTranslation();
  const demoVideoSource = useDemoVideoSource();

  if (!demoVideoSource) return null;

  const openUrl =
    demoVideoSource.kind === "embed"
      ? demoVideoSource.openUrl
      : demoVideoSource.url;

  return (
    <section className="map-help-section map-help-demo">
      <h2>{t("help.demoTitle")}</h2>
      <p className="map-help-section__lead">{t("help.demoLead")}</p>
      <div className="map-help-demo__player">
        {demoVideoSource.kind === "embed" ? (
          <iframe
            className="map-help-demo__embed"
            src={demoVideoSource.url}
            title={t("help.demoTitle")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            className="map-help-demo__video"
            controls
            preload="metadata"
            playsInline
            src={demoVideoSource.url}
          >
            {t("help.demoFallback")}
          </video>
        )}
      </div>
      <a
        className="map-help-demo__link"
        href={openUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <PlayCircle className="h-4 w-4" aria-hidden />
        {t("help.demoOpen")}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </section>
  );
}
