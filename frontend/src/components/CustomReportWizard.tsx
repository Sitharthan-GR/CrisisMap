import { ArrowLeft, Camera, CircleCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ApiError,
  createReport,
  fetchFormTemplate,
  fetchReverseGeocode,
  searchPlaces,
  type PlaceSearchResult,
} from "../api/client";
import { getCurrentLocation } from "../lib/geolocation";
import {
  isApiReachable,
  isNetworkFailure,
  queueReportForSync,
} from "../lib/offlineSync";
import {
  MAX_PHOTOS_PER_REPORT,
  type PendingPhoto,
  fileToPendingPhoto,
  revokePendingPhoto,
  uploadReportPhotos,
  validateImageFile,
} from "../lib/photos";
import {
  loadReporterName,
  resolveReporterName,
  saveReporterName,
} from "../lib/reporterName";
import { resolveGeocodeLabel } from "../lib/address";
import { detectSubmissionChannel } from "../lib/submissionChannel";
import type { FormFieldDefinition, FormTemplate } from "../types/formTemplate";
import { fieldTypeHasOptions } from "../types/formTemplate";
import type { Crisis, Report, ReportCreateInput } from "../types/report";
import ReportLocationPicker from "./ReportLocationPicker";

type CustomStep = "form" | "location" | "attachments" | "done";

interface CustomReportWizardProps {
  crisis: Crisis;
  onSwitchCrisis?: () => void;
}

function toIsoUtc(date: Date): string {
  return date.toISOString();
}

function formatResponsesSummary(
  fields: FormFieldDefinition[],
  values: Record<string, unknown>,
): string {
  return fields
    .map((field) => {
      const raw = values[field.id];
      if (raw === undefined || raw === null || raw === "") return null;
      const display = Array.isArray(raw) ? raw.join(", ") : String(raw);
      return `${field.label}: ${display}`;
    })
    .filter(Boolean)
    .join("\n");
}

export default function CustomReportWizard({
  crisis,
  onSwitchCrisis,
}: CustomReportWizardProps) {
  const { t, i18n } = useTranslation();
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [step, setStep] = useState<CustomStep>("form");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fileFields, setFileFields] = useState<Record<string, PendingPhoto[]>>({});
  const [description, setDescription] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [reporterName, setReporterName] = useState(loadReporterName);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [locationMethod, setLocationMethod] = useState<"gps" | "manual">("gps");
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "detecting" | "detected" | "failed"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<Report | null>(null);
  const [submittedOffline, setSubmittedOffline] = useState(false);
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);
  const gpsAttemptedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotosRef = useRef(pendingPhotos);
  pendingPhotosRef.current = pendingPhotos;

  useEffect(() => {
    if (!crisis.form_template_id) return;
    const controller = new AbortController();
    setLoadingTemplate(true);
    fetchFormTemplate(crisis.form_template_id, controller.signal)
      .then(setTemplate)
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? err.message
            : t("customForm.errors.loadTemplate"),
        );
      })
      .finally(() => setLoadingTemplate(false));
    return () => controller.abort();
  }, [crisis.form_template_id, t]);

  const detectLocation = async () => {
    setLocationStatus("detecting");
    setLocationMethod("gps");
    try {
      const coords = await getCurrentLocation();
      setLatitude(coords.latitude.toFixed(6));
      setLongitude(coords.longitude.toFixed(6));
      const fallback = t("wizard.currentLocation");
      try {
        const geo = await fetchReverseGeocode(coords.latitude, coords.longitude);
        const label = resolveGeocodeLabel(geo, fallback);
        setPlaceLabel(label);
        setAddressQuery(label !== fallback ? label : "");
      } catch {
        setPlaceLabel(fallback);
      }
      setLocationStatus("detected");
    } catch {
      setLocationStatus("failed");
    }
  };

  useEffect(() => {
    if (gpsAttemptedRef.current) return;
    gpsAttemptedRef.current = true;
    void detectLocation();
  }, []);

  useEffect(() => {
    const query = addressQuery.trim();
    if (query.length < 2) {
      setPlaceResults([]);
      setSearchingPlaces(false);
      return;
    }
    const controller = new AbortController();
    setSearchingPlaces(true);
    const timer = window.setTimeout(() => {
      searchPlaces(query, 5, controller.signal)
        .then(setPlaceResults)
        .catch((err) => {
          if (err.name === "AbortError") return;
          setPlaceResults([]);
        })
        .finally(() => setSearchingPlaces(false));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [addressQuery]);

  useEffect(() => {
    return () => pendingPhotosRef.current.forEach(revokePendingPhoto);
  }, []);

  const setFieldValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleCheckboxOption = (fieldId: string, option: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  };

  const handleFileChange = (fieldId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const valid: PendingPhoto[] = [];
    for (const file of files.slice(0, MAX_PHOTOS_PER_REPORT)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(t(`wizard.errors.${validationError}`));
        continue;
      }
      valid.push(fileToPendingPhoto(file));
    }
    if (valid.length > 0) {
      setFileFields((prev) => ({
        ...prev,
        [fieldId]: [...(prev[fieldId] ?? []), ...valid],
      }));
    }
    event.target.value = "";
  };

  const handleAddPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setError(null);
    const remaining = MAX_PHOTOS_PER_REPORT - pendingPhotos.length;
    const toAdd: PendingPhoto[] = [];

    for (const file of files.slice(0, remaining)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(t(`wizard.errors.${validationError}`));
        continue;
      }
      toAdd.push(fileToPendingPhoto(file));
    }

    if (toAdd.length > 0) {
      setPendingPhotos((prev) => [...prev, ...toAdd]);
    }
    event.target.value = "";
  };

  const handleRemovePhoto = (photoId: string) => {
    setPendingPhotos((prev) => {
      const removed = prev.find((p) => p.id === photoId);
      if (removed) revokePendingPhoto(removed);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  const validateForm = (): boolean => {
    if (!template) return false;
    for (const field of template.fields) {
      if (!field.required) continue;
      const value = values[field.id];
      if (field.type === "file") {
        if (!(fileFields[field.id]?.length ?? 0)) {
          setError(t("customForm.errors.required", { field: field.label }));
          return false;
        }
        continue;
      }
      if (field.type === "checkbox") {
        if (!Array.isArray(value) || value.length === 0) {
          setError(t("customForm.errors.required", { field: field.label }));
          return false;
        }
        continue;
      }
      if (value === undefined || value === null || String(value).trim() === "") {
        setError(t("customForm.errors.required", { field: field.label }));
        return false;
      }
    }
    setError(null);
    return true;
  };

  const validateLocation = (): boolean => {
    if (locationStatus === "detecting") {
      return false;
    }
    if (!latitude || !longitude) {
      setError(t("wizard.errors.locationRequired"));
      return false;
    }
    setError(null);
    return true;
  };

  const validateAttachments = (): boolean => {
    if (!description.trim()) {
      setError(t("customForm.errors.descriptionRequired"));
      return false;
    }
    if (pendingPhotos.length === 0) {
      setError(t("customForm.errors.photosRequired"));
      return false;
    }
    setError(null);
    return true;
  };

  const templateFilePhotos = Object.values(fileFields).flat();
  const allPendingPhotos = [...pendingPhotos, ...templateFilePhotos];

  const finishOfflineSubmission = async (payload: ReportCreateInput) => {
    await queueReportForSync(payload, allPendingPhotos.map((p) => p.file));
    if (payload.reporter_name !== "anonymous") {
      saveReporterName(payload.reporter_name!);
    }
    allPendingPhotos.forEach(revokePendingPhoto);
    setFileFields({});
    setPendingPhotos([]);
    setUploadedPhotoCount(allPendingPhotos.length);
    setSubmittedOffline(true);
    setSubmittedReport(null);
    setStep("done");
  };

  const submitReport = async () => {
    if (!template || !validateLocation() || !validateAttachments()) {
      return;
    }

    setSubmitting(true);
    setUploadProgress(null);
    setError(null);

    const resolvedReporterName = resolveReporterName(reporterName);
    const formResponses: Record<string, unknown> = { ...values };
    for (const [fieldId, photos] of Object.entries(fileFields)) {
      formResponses[fieldId] = photos.map((p) => p.file.name);
    }

    const formSummary = formatResponsesSummary(template.fields, formResponses);
    const descriptionText = description.trim();

    const payload: ReportCreateInput = {
      crisis_id: crisis.id,
      damage_level: "minimal",
      infra_type: "other",
      debris_present: false,
      description_raw: [descriptionText, formSummary].filter(Boolean).join("\n\n") || undefined,
      reporter_name: resolvedReporterName,
      source_language: i18n.language,
      submission_channel: detectSubmissionChannel(),
      collected_at: toIsoUtc(new Date()),
      form_responses: formResponses,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        location_method: locationMethod,
      },
    };

    try {
      const online = await isApiReachable();
      if (!online) {
        await finishOfflineSubmission(payload);
        return;
      }

      const report = await createReport(payload);
      let photoCount = 0;
      if (allPendingPhotos.length > 0) {
        setUploadProgress(
          t("wizard.uploading", { done: 0, total: allPendingPhotos.length }),
        );
        const photos = await uploadReportPhotos(
          report.id,
          allPendingPhotos.map((p) => p.file),
          { lat: Number(latitude), lng: Number(longitude) },
          (done, total) =>
            setUploadProgress(t("wizard.uploading", { done, total })),
        );
        photoCount = photos.length;
      }

      if (resolvedReporterName !== "anonymous") {
        saveReporterName(resolvedReporterName);
      }

      allPendingPhotos.forEach(revokePendingPhoto);
      setFileFields({});
      setPendingPhotos([]);
      setSubmittedOffline(false);
      setSubmittedReport(report);
      setUploadedPhotoCount(photoCount);
      setStep("done");
    } catch (err) {
      if (isNetworkFailure(err)) {
        try {
          await finishOfflineSubmission(payload);
          return;
        } catch (queueErr) {
          setError(
            queueErr instanceof Error
              ? queueErr.message
              : t("wizard.errors.submitFailed"),
          );
          return;
        }
      }
      setError(
        err instanceof ApiError ? err.message : t("wizard.errors.submitFailed"),
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (loadingTemplate) {
    return (
      <div className="custom-form-shell">
        <p className="custom-form-loading">{t("customForm.loading")}</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="custom-form-shell">
        <p className="custom-form-error">{error ?? t("customForm.errors.loadTemplate")}</p>
        {onSwitchCrisis && (
          <button type="button" className="btn" onClick={onSwitchCrisis}>
            {t("customForm.switchCrisis")}
          </button>
        )}
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="custom-form-shell">
        <div className="custom-form-done">
          <CircleCheck strokeWidth={1.8} className="custom-form-done-icon" />
          <h2>
            {submittedOffline
              ? t("wizard.doneTitleOffline")
              : t("wizard.doneTitle")}
          </h2>
          <p>
            {submittedOffline
              ? t("wizard.doneSubtitleOffline")
              : t("wizard.doneSubtitle")}
          </p>
          {uploadedPhotoCount > 0 && (
            <p className="custom-form-done-meta">
              {t("wizard.donePhotos", { count: uploadedPhotoCount })}
            </p>
          )}
          {submittedReport && (
            <p className="custom-form-done-meta font-mono text-[11px]">
              {submittedReport.id}
            </p>
          )}
          <Link to="/" className="btn btn-primary btn-block">
            {t("nav.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-form-shell">
      {step === "form" && (
        <>
          <div className="custom-form-head">
            <h2>{template.title}</h2>
            {template.intro && <p>{template.intro}</p>}
          </div>

          {template.fields.map((field) => (
            <div key={field.id} className="custom-form-field">
              <label className="custom-form-label">
                {field.label}
                {field.required && <span className="form-required">*</span>}
              </label>

              {field.type === "text" && (
                <input
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                />
              )}
              {field.type === "number" && (
                <input
                  type="number"
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                />
              )}
              {field.type === "textarea" && (
                <textarea
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                  rows={4}
                />
              )}
              {field.type === "select" && (
                <select
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                >
                  <option value="">{t("customForm.selectPlaceholder")}</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
              {field.type === "radio" && (
                <div className="form-preview-checkgroup">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt} className="form-preview-check">
                      <input
                        type="radio"
                        name={field.id}
                        checked={values[field.id] === opt}
                        onChange={() => setFieldValue(field.id, opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {field.type === "checkbox" && fieldTypeHasOptions(field.type) && (
                <div className="form-preview-checkgroup">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt} className="form-preview-check">
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(values[field.id]) &&
                          (values[field.id] as string[]).includes(opt)
                        }
                        onChange={() => toggleCheckboxOption(field.id, opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {field.type === "date" && (
                <input
                  type="date"
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                />
              )}
              {field.type === "datetime" && (
                <input
                  type="datetime-local"
                  className="report-wizard-field"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) => setFieldValue(field.id, e.target.value)}
                />
              )}
              {field.type === "file" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    className="report-wizard-field"
                    multiple
                    onChange={(e) => handleFileChange(field.id, e)}
                  />
                  {(fileFields[field.id] ?? []).length > 0 && (
                    <p className="custom-form-file-count">
                      {t("customForm.filesSelected", {
                        count: fileFields[field.id]?.length ?? 0,
                      })}
                    </p>
                  )}
                </>
              )}

              {field.help_text && (
                <span className="custom-form-hint">{field.help_text}</span>
              )}
            </div>
          ))}

          <div className="custom-form-field">
            <label className="custom-form-label">{t("wizard.reporterNameOptional")}</label>
            <input
              className="field"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder={t("wizard.reporterNamePlaceholder")}
            />
          </div>

          {error && <p className="custom-form-error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              if (validateForm()) setStep("location");
            }}
          >
            {t("customForm.continueToLocation")}
          </button>
        </>
      )}

      {step === "location" && (
        <>
          <button
            type="button"
            className="custom-form-back"
            onClick={() => setStep("form")}
          >
            <ArrowLeft strokeWidth={2} />
            {t("customForm.back")}
          </button>

          <ReportLocationPicker
            title={t("wizard.questions.location")}
            latitude={latitude}
            longitude={longitude}
            placeLabel={placeLabel}
            locationStatus={locationStatus}
            addressQuery={addressQuery}
            placeResults={placeResults}
            searchingPlaces={searchingPlaces}
            onAddressQueryChange={setAddressQuery}
            onSelectPlace={(place) => {
              setLatitude(String(place.latitude));
              setLongitude(String(place.longitude));
              setPlaceLabel(place.display_name);
              setLocationMethod("manual");
              setLocationStatus("detected");
              setAddressQuery(place.display_name);
              setPlaceResults([]);
            }}
            onMapPick={(lat, lng) => {
              setLatitude(lat.toFixed(6));
              setLongitude(lng.toFixed(6));
              setLocationMethod("manual");
              setLocationStatus("detected");
              void fetchReverseGeocode(lat, lng)
                .then((geo) => {
                  const label = resolveGeocodeLabel(geo, t("map.pickedLocation"));
                  setPlaceLabel(label);
                  setAddressQuery(label);
                })
                .catch(() => setPlaceLabel(t("map.pickedLocation")));
            }}
            onUseGps={() => void detectLocation()}
          />

          {error && <p className="custom-form-error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={locationStatus === "detecting" || !latitude || !longitude}
            onClick={() => {
              if (validateLocation()) setStep("attachments");
            }}
          >
            {t("wizard.continue")}
          </button>
        </>
      )}

      {step === "attachments" && (
        <>
          <button
            type="button"
            className="custom-form-back"
            onClick={() => setStep("location")}
          >
            <ArrowLeft strokeWidth={2} />
            {t("customForm.back")}
          </button>

          <div className="custom-form-head">
            <h2>{t("wizard.questions.photo")}</h2>
          </div>

          <div className="custom-form-field">
            <label className="custom-form-label">
              {t("customForm.descriptionLabel")}
              <span className="form-required">*</span>
            </label>
            <textarea
              className="report-wizard-field resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("wizard.descriptionPlaceholder")}
              rows={4}
            />
          </div>

          <div className="custom-form-field">
            <label className="custom-form-label">
              {t("customForm.photosLabel")}
              <span className="form-required">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleAddPhotos}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || pendingPhotos.length >= MAX_PHOTOS_PER_REPORT}
              className="w-full rounded-xl border border-dashed border-surface-border px-4 py-6 text-center text-[13px] text-ink-dim transition hover:border-accent hover:text-ink disabled:opacity-50"
            >
              <Camera className="mx-auto mb-1.5 h-7 w-7" />
              {t("wizard.tapPhoto")}
            </button>
            {pendingPhotos.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {pendingPhotos.map((photo) => (
                  <li key={photo.id} className="relative">
                    <img
                      src={photo.previewUrl}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="custom-form-error">{error}</p>}
          {uploadProgress && (
            <p className="custom-form-hint">{uploadProgress}</p>
          )}

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={
              submitting ||
              !description.trim() ||
              pendingPhotos.length === 0
            }
            onClick={() => void submitReport()}
          >
            {submitting ? t("wizard.submitting") : t("customForm.submitReport")}
          </button>
        </>
      )}
    </div>
  );
}
