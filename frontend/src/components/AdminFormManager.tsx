import {
  Calendar,
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  Circle,
  Clock,
  FileText,
  GripVertical,
  Hash,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ApiError,
  adminCreateFormTemplate,
  adminDeleteFormTemplate,
  adminFetchFormTemplates,
  adminUpdateFormTemplate,
} from "../api/client";
import { getAdminToken, isAdminAuthenticated } from "../lib/adminAuth";
import type { FormFieldDefinition, FormFieldType, FormTemplate } from "../types/formTemplate";
import {
  FORM_FIELD_TYPES,
  fieldTypeHasOptions,
  newFormField,
} from "../types/formTemplate";
import ThemeToggle from "./ThemeToggle";

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Text",
  number: "Number",
  textarea: "Paragraph",
  select: "Dropdown",
  radio: "Radio",
  checkbox: "Checkboxes",
  date: "Date",
  datetime: "Date & Time",
  file: "File Upload",
};

const FIELD_TYPE_ICONS: Record<FormFieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  textarea: FileText,
  select: ChevronDown,
  radio: Circle,
  checkbox: CheckSquare,
  date: Calendar,
  datetime: Clock,
  file: Camera,
};

interface DraftTemplate {
  name: string;
  title: string;
  intro: string;
  fields: FormFieldDefinition[];
}

function emptyDraft(): DraftTemplate {
  return {
    name: "",
    title: "Incident Report",
    intro: "Please provide details about the incident",
    fields: [],
  };
}

function templateToDraft(template: FormTemplate): DraftTemplate {
  return {
    name: template.name,
    title: template.title,
    intro: template.intro ?? "",
    fields: template.fields.map((f) => ({ ...f, options: f.options ?? [] })),
  };
}

export default function AdminFormManager() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<DraftTemplate>(emptyDraft);
  const [lastSaved, setLastSaved] = useState<DraftTemplate>(emptyDraft);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const token = getAdminToken();

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchFormTemplates(token);
      setTemplates(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("formManager.errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (isAdminAuthenticated()) {
      void loadTemplates();
    }
  }, [loadTemplates]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const selectTemplate = (template: FormTemplate) => {
    const next = templateToDraft(template);
    setSelectedId(template.id);
    setDraft(next);
    setLastSaved(next);
    setEditingIndex(-1);
    setError(null);
  };

  const startNew = () => {
    const next = emptyDraft();
    setSelectedId("new");
    setDraft(next);
    setLastSaved(emptyDraft());
    setEditingIndex(-1);
    setError(null);
  };

  const addField = (type: FormFieldType) => {
    setDraft((prev) => ({
      ...prev,
      fields: [...prev.fields, newFormField(type)],
    }));
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const fieldType = event.dataTransfer.getData("fieldType") as FormFieldType;
    if (fieldType) addField(fieldType);
  };

  const updateEditingField = (updates: Partial<FormFieldDefinition>) => {
    if (editingIndex < 0) return;
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((f, i) =>
        i === editingIndex ? { ...f, ...updates } : f,
      ),
    }));
  };

  const deleteFieldAt = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
    setEditingIndex(-1);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!draft.name.trim()) {
      setError(t("formManager.errors.nameRequired"));
      return;
    }
    if (draft.fields.length === 0) {
      setError(t("formManager.errors.fieldsRequired"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        title: draft.title.trim() || "Incident Report",
        intro: draft.intro.trim() || null,
        fields: draft.fields.map((f) => ({
          ...f,
          label: f.label.trim() || "Untitled",
          help_text: f.help_text?.trim() || null,
          options: fieldTypeHasOptions(f.type)
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : [],
        })),
      };

      if (selectedId === "new") {
        const created = await adminCreateFormTemplate(token, payload);
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        selectTemplate(created);
        setSuccess(t("formManager.saved"));
      } else if (selectedId) {
        const updated = await adminUpdateFormTemplate(token, selectedId, payload);
        setTemplates((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
        selectTemplate(updated);
        setSuccess(t("formManager.saved"));
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("formManager.errors.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!token || !selectedId || selectedId === "new") return;
    if (!window.confirm(t("formManager.confirmDelete"))) return;

    setSaving(true);
    setError(null);
    try {
      await adminDeleteFormTemplate(token, selectedId);
      setTemplates((prev) => prev.filter((item) => item.id !== selectedId));
      setSelectedId(null);
      setDraft(emptyDraft());
      setLastSaved(emptyDraft());
      setEditingIndex(-1);
      setSuccess(t("formManager.deleted"));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("formManager.errors.deleteFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm(t("formManager.confirmReset"))) return;
    setDraft({ ...lastSaved, fields: lastSaved.fields.map((f) => ({ ...f })) });
    setEditingIndex(-1);
  };

  const editingField = editingIndex >= 0 ? draft.fields[editingIndex] : null;

  const previewHtml = useMemo(() => {
    return (
      <>
        <h3 className="form-preview-heading">{draft.title}</h3>
        {draft.intro && <p className="form-preview-intro">{draft.intro}</p>}
        {draft.fields.map((field) => (
          <div key={field.id} className="form-preview-field">
            <label className="form-preview-label">
              {field.label}
              {field.required && <span className="form-required">*</span>}
            </label>
            {field.type === "text" && (
              <input type="text" className="field" disabled readOnly />
            )}
            {field.type === "number" && (
              <input type="number" className="field" disabled readOnly />
            )}
            {field.type === "textarea" && (
              <textarea className="field" disabled readOnly />
            )}
            {field.type === "select" && (
              <select className="field" disabled>
                <option>-- Select --</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            )}
            {field.type === "radio" && (
              <div className="form-preview-checkgroup">
                {(field.options ?? []).map((opt) => (
                  <label key={opt} className="form-preview-check">
                    <input type="radio" disabled readOnly /> {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "checkbox" && (
              <div className="form-preview-checkgroup">
                {(field.options ?? []).map((opt) => (
                  <label key={opt} className="form-preview-check">
                    <input type="checkbox" disabled readOnly /> {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "date" && (
              <input type="date" className="field" disabled readOnly />
            )}
            {field.type === "datetime" && (
              <input type="datetime-local" className="field" disabled readOnly />
            )}
            {field.type === "file" && (
              <input type="file" className="field" disabled readOnly />
            )}
            {field.help_text && (
              <span className="form-preview-hint">{field.help_text}</span>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-primary btn-block" disabled>
          {t("formManager.submitPreview")}
        </button>
      </>
    );
  }, [draft, t]);

  if (!isAdminAuthenticated()) {
    return (
      <div className="admin-app">
        <main className="admin-page">
          <p>{t("formManager.loginRequired")}</p>
          <Link to="/admin" className="backlink">
            {t("formManager.backToAdmin")}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar">
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
            <div className="bs">{t("admin.consoleSubtitle")}</div>
          </span>
        </div>
        <div className="spacer" />
        <Link to="/admin" className="backlink">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t("formManager.backToAdmin")}
        </Link>
        <ThemeToggle />
      </header>

      <main className="admin-page admin-page-wide">
        <div className="admin-page-head">
          <div>
            <h1>{t("formManager.title")}</h1>
            <p>{t("formManager.subtitle")}</p>
          </div>
          <div className="admin-page-head-actions">
            <button type="button" className="btn btn-primary" onClick={startNew}>
              <Plus strokeWidth={2.2} />
              {t("formManager.newForm")}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--dmg-complete-ink)", marginBottom: 16, fontSize: 14 }}>
            {error}
          </p>
        )}
        {success && (
          <p style={{ color: "var(--dmg-minimal-ink)", marginBottom: 16, fontSize: 14 }}>
            {success}
          </p>
        )}

        <div className="form-manager-layout">
          <aside className="admin-form-card form-manager-list">
            <div className="admin-form-card-head">
              <h2>{t("formManager.templates")}</h2>
            </div>
            <div className="admin-form-card-body">
              <button
                type="button"
                className={`form-template-item builtin ${selectedId === null ? "on" : ""}`}
                onClick={() => {
                  setSelectedId(null);
                  setEditingIndex(-1);
                }}
              >
                <strong>{t("formManager.defaultTemplate")}</strong>
                <span>{t("formManager.defaultTemplateHint")}</span>
              </button>
              {loading ? (
                <p className="form-manager-empty">{t("formManager.loading")}</p>
              ) : templates.length === 0 ? (
                <p className="form-manager-empty">{t("formManager.noTemplates")}</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`form-template-item ${selectedId === template.id ? "on" : ""}`}
                    onClick={() => selectTemplate(template)}
                  >
                    <strong>{template.name}</strong>
                    <span>
                      {t("formManager.fieldCount", { count: template.fields.length })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          {selectedId === null ? (
            <div className="admin-form-card form-manager-default-info">
              <div className="admin-form-card-head">
                <h2>{t("formManager.defaultTemplate")}</h2>
                <p>{t("formManager.defaultTemplateDesc")}</p>
              </div>
              <div className="admin-form-card-body">
                <p className="form-manager-default-text">{t("formManager.defaultTemplateBody")}</p>
              </div>
            </div>
          ) : (
            <div className="form-builder-grid">
              <div className="admin-form-card">
                <div className="admin-form-card-head">
                  <h2>{t("formManager.buildForm")}</h2>
                  <p>{t("formManager.buildFormDesc")}</p>
                </div>
                <div className="admin-form-card-body">
                  <div className="admin-fieldset">
                    <label className="label" htmlFor="form-name">
                      {t("formManager.formName")}
                    </label>
                    <input
                      id="form-name"
                      className="field"
                      value={draft.name}
                      onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t("formManager.formNamePlaceholder")}
                    />
                  </div>
                  <div className="admin-fieldset">
                    <label className="label" htmlFor="form-title">
                      {t("formManager.formTitle")}
                    </label>
                    <input
                      id="form-title"
                      className="field"
                      value={draft.title}
                      onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div className="admin-fieldset">
                    <label className="label" htmlFor="form-intro">
                      {t("formManager.formIntro")}
                    </label>
                    <textarea
                      id="form-intro"
                      className="field"
                      value={draft.intro}
                      onChange={(e) => setDraft((p) => ({ ...p, intro: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <h3 className="form-builder-section">{t("formManager.availableFields")}</h3>
                  <div className="field-palette">
                    {FORM_FIELD_TYPES.map((type) => {
                      const Icon = FIELD_TYPE_ICONS[type];
                      return (
                      <div
                        key={type}
                        className="field-type"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("fieldType", type);
                        }}
                        onClick={() => addField(type)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") addField(type);
                        }}
                      >
                        <Icon strokeWidth={2} aria-hidden />
                        {FIELD_TYPE_LABELS[type]}
                      </div>
                      );
                    })}
                  </div>

                  <h3 className="form-builder-section">{t("formManager.formFields")}</h3>
                  <div
                    className={`form-canvas ${draft.fields.length === 0 ? "empty" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {draft.fields.length === 0 ? (
                      t("formManager.dropHint")
                    ) : (
                      draft.fields.map((field, index) => (
                        <div
                          key={field.id}
                          className={`form-item ${index === editingIndex ? "editing" : ""}`}
                        >
                          <GripVertical className="form-item-drag" strokeWidth={2} />
                          <div className="form-item-content">
                            <div className="form-item-label">
                              {field.label}
                              {field.required && (
                                <span className="form-required">*</span>
                              )}
                            </div>
                            <div className="form-item-type">{field.type}</div>
                          </div>
                          <div className="form-item-actions">
                            <button
                              type="button"
                              className="icon-btn sm"
                              onClick={() => setEditingIndex(index)}
                              aria-label={t("formManager.editField")}
                            >
                              <Pencil strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn sm"
                              onClick={() => deleteFieldAt(index)}
                              aria-label={t("formManager.deleteField")}
                            >
                              <X strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {editingField && (
                    <div className="field-editor">
                      <div className="field-editor-title">{t("formManager.editField")}</div>
                      <div className="admin-fieldset">
                        <label className="label">{t("formManager.fieldLabel")}</label>
                        <input
                          className="field"
                          value={editingField.label}
                          onChange={(e) => updateEditingField({ label: e.target.value })}
                        />
                      </div>
                      <div className="admin-fieldset">
                        <label className="label">{t("formManager.fieldHelp")}</label>
                        <textarea
                          className="field"
                          value={editingField.help_text ?? ""}
                          onChange={(e) =>
                            updateEditingField({ help_text: e.target.value })
                          }
                          rows={2}
                        />
                      </div>
                      <div className="admin-fieldset">
                        <label className="label">{t("formManager.fieldType")}</label>
                        <select className="field" value={editingField.type} disabled>
                          <option>{FIELD_TYPE_LABELS[editingField.type]}</option>
                        </select>
                      </div>
                      <label className="form-manager-checkbox">
                        <input
                          type="checkbox"
                          checked={editingField.required}
                          onChange={(e) =>
                            updateEditingField({ required: e.target.checked })
                          }
                        />
                        {t("formManager.fieldRequired")}
                      </label>
                      {fieldTypeHasOptions(editingField.type) && (
                        <div className="admin-fieldset">
                          <label className="label">{t("formManager.fieldOptions")}</label>
                          <textarea
                            className="field"
                            value={(editingField.options ?? []).join("\n")}
                            onChange={(e) =>
                              updateEditingField({
                                options: e.target.value.split("\n"),
                              })
                            }
                            rows={4}
                            placeholder={t("formManager.fieldOptionsPlaceholder")}
                          />
                        </div>
                      )}
                      <div className="field-editor-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            if (editingIndex >= 0 && fieldTypeHasOptions(draft.fields[editingIndex]?.type)) {
                              const field = draft.fields[editingIndex];
                              updateEditingField({
                                options: (field.options ?? []).map((o) => o.trim()).filter(Boolean),
                              });
                            }
                            setEditingIndex(-1);
                          }}
                        >
                          <Check strokeWidth={2} />
                          {t("formManager.doneEdit")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => deleteFieldAt(editingIndex)}
                        >
                          <Trash2 strokeWidth={2} />
                          {t("formManager.deleteField")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="admin-form-card-foot">
                  {selectedId !== "new" && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void handleDeleteTemplate()}
                      disabled={saving}
                    >
                      <Trash2 strokeWidth={2} />
                      {t("formManager.deleteForm")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleReset}
                    disabled={saving}
                  >
                    <RotateCcw strokeWidth={2} />
                    {t("formManager.reset")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    <Save strokeWidth={2} />
                    {saving ? t("formManager.saving") : t("formManager.saveForm")}
                  </button>
                </div>
              </div>

              <div className="admin-form-card">
                <div className="admin-form-card-head">
                  <h2>{t("formManager.livePreview")}</h2>
                  <p>{t("formManager.livePreviewDesc")}</p>
                </div>
                <div className="admin-form-card-body form-preview-body">{previewHtml}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
