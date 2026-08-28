import { FileText, GripVertical, Plus, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

type GuideStep = {
  titleKey: string;
  bodyKey: string;
  image?: string;
  mock?: "new-form" | "drag-drop" | "preview";
};

const STEPS: GuideStep[] = [
  {
    image: "/help/forms/01-open-builder",
    titleKey: "help.formStepOpenTitle",
    bodyKey: "help.formStepOpenBody",
  },
  {
    mock: "new-form",
    titleKey: "help.formStepNewTitle",
    bodyKey: "help.formStepNewBody",
  },
  {
    mock: "drag-drop",
    titleKey: "help.formStepDragTitle",
    bodyKey: "help.formStepDragBody",
  },
  {
    mock: "preview",
    titleKey: "help.formStepPreviewTitle",
    bodyKey: "help.formStepPreviewBody",
  },
];

function ScreenshotFrame({
  src,
  alt,
  loading,
}: {
  src: string;
  alt: string;
  loading?: "eager" | "lazy";
}) {
  return (
    <figure className="help-screenshot">
      <div className="help-screenshot__frame">
        <picture>
          <source srcSet={`${src}.webp`} type="image/webp" />
          <img
            src={`${src}.png`}
            alt={alt}
            loading={loading ?? "lazy"}
            decoding="async"
            width={1200}
            height={750}
          />
        </picture>
      </div>
    </figure>
  );
}

function NewFormMock() {
  const { t } = useTranslation();
  return (
    <div className="help-form-mock" aria-hidden>
      <div className="help-form-mock__toolbar">
        <span>{t("formManager.title")}</span>
        <span className="help-form-mock__btn">
          <Plus strokeWidth={2} aria-hidden />
          {t("formManager.newForm")}
          <span className="help-form-mock__callout" />
        </span>
      </div>
      <div className="help-form-mock__body">
        <div className="help-form-mock__meta">
          <label>{t("formManager.formName")}</label>
          <div className="help-form-mock__field">{t("help.formMockName")}</div>
          <label>{t("formManager.formTitle")}</label>
          <div className="help-form-mock__field">{t("help.formMockTitle")}</div>
        </div>
      </div>
    </div>
  );
}

function DragDropMock() {
  const { t } = useTranslation();
  const palette = [
    t("help.formMockFieldText"),
    t("help.formMockFieldDropdown"),
    t("help.formMockFieldParagraph"),
  ];
  return (
    <div className="help-form-mock" aria-hidden>
      <p className="help-form-mock__section">{t("formManager.availableFields")}</p>
      <div className="help-form-mock__palette">
        {palette.map((label) => (
          <span key={label} className="help-form-mock__chip">
            <GripVertical strokeWidth={2} aria-hidden />
            {label}
          </span>
        ))}
        <span className="help-form-mock__arrow" aria-hidden>
          →
        </span>
      </div>
      <p className="help-form-mock__section">{t("formManager.formFields")}</p>
      <div className="help-form-mock__canvas">
        <div className="help-form-mock__item">
          <GripVertical strokeWidth={2} aria-hidden />
          <span>{t("help.formMockItemWater")}</span>
        </div>
        <div className="help-form-mock__item">
          <GripVertical strokeWidth={2} aria-hidden />
          <span>{t("help.formMockItemDepth")}</span>
        </div>
        <span className="help-form-mock__drop">{t("formManager.dropHint")}</span>
      </div>
    </div>
  );
}

function PreviewMock() {
  const { t } = useTranslation();
  return (
    <div className="help-form-mock help-form-mock--split" aria-hidden>
      <div>
        <p className="help-form-mock__section">{t("formManager.editField")}</p>
        <div className="help-form-mock__editor">
          <label>{t("formManager.fieldLabel")}</label>
          <div className="help-form-mock__field">{t("help.formMockItemDepth")}</div>
          <label>{t("formManager.fieldOptions")}</label>
          <div className="help-form-mock__field help-form-mock__field--multi">
            {t("help.formMockOptions")}
          </div>
        </div>
        <span className="help-form-mock__btn help-form-mock__btn--save">
          <Save strokeWidth={2} aria-hidden />
          {t("formManager.saveForm")}
        </span>
      </div>
      <div>
        <p className="help-form-mock__section">{t("formManager.livePreview")}</p>
        <div className="help-form-mock__preview">
          <h4>{t("help.formMockTitle")}</h4>
          <p>{t("help.formMockIntro")}</p>
          <label>{t("help.formMockItemWater")}</label>
          <div className="help-form-mock__field" />
          <label>{t("help.formMockItemDepth")}</label>
          <div className="help-form-mock__field help-form-mock__field--select">
            {t("help.formMockSelect")}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepVisual({ step, index }: { step: GuideStep; index: number }) {
  const { t } = useTranslation();

  if (step.image) {
    return (
      <ScreenshotFrame
        src={step.image}
        alt={t(step.titleKey)}
        loading={index === 0 ? "eager" : "lazy"}
      />
    );
  }

  if (step.mock === "new-form") return <NewFormMock />;
  if (step.mock === "drag-drop") return <DragDropMock />;
  if (step.mock === "preview") return <PreviewMock />;
  return null;
}

export default function FormBuilderGuide() {
  const { t } = useTranslation();

  return (
    <section className="help-form-guide" aria-labelledby="help-form-guide-title">
      <div className="help-form-guide__header">
        <p className="help-form-guide__eyebrow">{t("help.formEyebrow")}</p>
        <h2 id="help-form-guide-title">{t("help.formTitle")}</h2>
        <p className="help-form-guide__lead">{t("help.formLead")}</p>
        <p className="help-form-guide__note">{t("help.formDesktopNote")}</p>
      </div>

      <div className="help-form-guide__links">
        <Link to="/admin/forms" className="help-quick-link">
          <FileText strokeWidth={2} aria-hidden />
          {t("formManager.title")}
        </Link>
        <Link to="/admin" className="help-quick-link">
          {t("nav.admin")}
        </Link>
      </div>

      <ol className="help-form-guide__steps">
        {STEPS.map((step, index) => (
          <li key={step.titleKey} className="help-form-step">
            <div className="help-form-step__copy">
              <span className="help-form-step__num" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{t(step.titleKey)}</h3>
              <p>{t(step.bodyKey)}</p>
            </div>
            <StepVisual step={step} index={index} />
          </li>
        ))}
      </ol>

      <section className="help-guide-section help-form-guide__assign">
        <h3>{t("help.formAssignTitle")}</h3>
        <ol className="help-guide-steps">
          <li>{t("help.formAssign1")}</li>
          <li>{t("help.formAssign2")}</li>
          <li>{t("help.formAssign3")}</li>
        </ol>
      </section>
    </section>
  );
}
