import {
  Activity,
  ArrowLeft,
  Ban,
  Bomb,
  Building,
  Camera,
  Check,
  CircleCheck,
  Construction,
  FlaskConical,
  Flame,
  Home,
  Landmark,
  MapPin,
  MoreHorizontal,
  Route,
  Store,
  Swords,
  Trash2,
  Trees,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { ApiError, createReport, fetchActiveCrises, fetchReverseGeocode, searchPlaces, type PlaceSearchResult } from "../api/client";
import { autoDetectLanguageFromLocation } from "../i18n";
import { getCurrentLocation } from "../lib/geolocation";
import {
  loadReporterName,
  resolveReporterName,
  saveReporterName,
} from "../lib/reporterName";
import {
  damageLevelLabel,
  infraTypeLabel,
} from "../lib/severity";
import {
  MAX_PHOTOS_PER_REPORT,
  type PendingPhoto,
  fileToPendingPhoto,
  revokePendingPhoto,
  uploadReportPhotos,
  validateImageFile,
} from "../lib/photos";
import type { ReportLocationPrefill } from "../types/location";
import type { Crisis, DamageLevel, InfraType, LocationMethod, Report } from "../types/report";
import LanguageSwitcher from "./LanguageSwitcher";
import ReportLocationPicker from "./ReportLocationPicker";

type WizardStep = "damage" | "infra" | "crisis" | "debris" | "location" | "photo" | "done";

const WIZARD_STEPS: WizardStep[] = [
  "damage",
  "infra",
  "crisis",
  "debris",
  "location",
  "photo",
];

type NatureOfCrisis =
  | "earthquake"
  | "flood"
  | "tsunami"
  | "cyclone"
  | "wildfire"
  | "explosion"
  | "chemical"
  | "conflict";

interface OptionCard {
  value: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
}

function toIsoUtc(date: Date): string {
  return date.toISOString();
}

function defaultNatureFromCrisis(crisis: Crisis): NatureOfCrisis {
  const normalized = crisis.crisis_subtype.toLowerCase().replace(/\s+/g, "_");
  const known: NatureOfCrisis[] = [
    "earthquake",
    "flood",
    "tsunami",
    "cyclone",
    "wildfire",
    "explosion",
    "chemical",
    "conflict",
  ];
  return known.includes(normalized as NatureOfCrisis)
    ? (normalized as NatureOfCrisis)
    : "earthquake";
}

function canProceed(
  step: WizardStep,
  state: {
    damage: DamageLevel | null;
    infra: InfraType | null;
    crisis: NatureOfCrisis | null;
    debris: "yes" | "no" | null;
  },
): boolean {
  if (step === "location" || step === "photo") return true;
  if (step === "damage") return state.damage !== null;
  if (step === "infra") return state.infra !== null;
  if (step === "crisis") return state.crisis !== null;
  if (step === "debris") return state.debris !== null;
  return false;
}

interface OptionButtonProps {
  option: OptionCard;
  selected: boolean;
  onSelect: () => void;
  grid?: boolean;
}

function OptionButton({ option, selected, onSelect, grid }: OptionButtonProps) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-3 text-start transition ${
        grid ? "flex-col justify-center gap-1.5 text-center" : ""
      } ${
        selected
          ? "border-2 border-accent bg-accent/10"
          : "border-surface-border bg-surface hover:border-slate-500 hover:bg-surface-raised"
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${selected ? "text-accent" : "text-slate-400"}`}
        aria-hidden
      />
      <div className={grid ? "" : "min-w-0 flex-1"}>
        <p className="text-sm text-white">{option.title}</p>
        {option.subtitle && (
          <p className="text-xs text-slate-400">{option.subtitle}</p>
        )}
      </div>
    </button>
  );
}

export default function CrisisReportForm() {
  const { t, i18n } = useTranslation();
  const routerLocation = useLocation();
  const locationPrefill = routerLocation.state?.locationPrefill as
    | ReportLocationPrefill
    | undefined;
  const [step, setStep] = useState<WizardStep>("damage");
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [crisisId, setCrisisId] = useState("");
  const [damage, setDamage] = useState<DamageLevel | null>(null);
  const [infra, setInfra] = useState<InfraType | null>(null);
  const [nature, setNature] = useState<NatureOfCrisis | null>(null);
  const [debris, setDebris] = useState<"yes" | "no" | null>(null);
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState(loadReporterName);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [locationMethod, setLocationMethod] = useState<LocationMethod>("gps");
  const [buildingFootprintId, setBuildingFootprintId] = useState<string | undefined>();
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "detecting" | "detected" | "failed"
  >("idle");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [loadingCrises, setLoadingCrises] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<Report | null>(null);
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotosRef = useRef(pendingPhotos);
  const gpsAttemptedRef = useRef(false);
  pendingPhotosRef.current = pendingPhotos;

  const stepIndex = WIZARD_STEPS.indexOf(step);
  const selectedCrisis = crises.find((c) => c.id === crisisId);

  const damageOptions = useMemo<OptionCard[]>(
    () => [
      {
        value: "minimal",
        title: t("damage.minimalTitle"),
        subtitle: t("damage.minimalSub"),
        icon: Home,
      },
      {
        value: "partial",
        title: t("damage.partialTitle"),
        subtitle: t("damage.partialSub"),
        icon: Construction,
      },
      {
        value: "complete",
        title: t("damage.completeTitle"),
        subtitle: t("damage.completeSub"),
        icon: Ban,
      },
    ],
    [t],
  );

  const infraOptions = useMemo<OptionCard[]>(
    () => [
      { value: "residential", title: t("infra.residential"), icon: Home },
      { value: "commercial", title: t("infra.commercial"), icon: Store },
      { value: "government", title: t("infra.government"), icon: Landmark },
      { value: "utility", title: t("infra.utility"), icon: Zap },
      { value: "transport", title: t("infra.transport"), icon: Route },
      { value: "community", title: t("infra.community"), icon: Building },
      { value: "public_space", title: t("infra.public_space"), icon: Trees },
      { value: "other", title: t("infra.other"), icon: MoreHorizontal },
    ],
    [t],
  );

  const crisisOptions = useMemo<OptionCard[]>(
    () => [
      { value: "earthquake", title: t("nature.earthquake"), icon: Activity },
      { value: "flood", title: t("nature.flood"), icon: Waves },
      { value: "tsunami", title: t("nature.tsunami"), icon: Waves },
      { value: "cyclone", title: t("nature.cyclone"), icon: Wind },
      { value: "wildfire", title: t("nature.wildfire"), icon: Flame },
      { value: "explosion", title: t("nature.explosion"), icon: Bomb },
      { value: "chemical", title: t("nature.chemical"), icon: FlaskConical },
      { value: "conflict", title: t("nature.conflict"), icon: Swords },
    ],
    [t],
  );

  const debrisOptions = useMemo<OptionCard[]>(
    () => [
      {
        value: "yes",
        title: t("debris.yes"),
        subtitle: t("debris.yesSub"),
        icon: Trash2,
      },
      {
        value: "no",
        title: t("debris.no"),
        subtitle: t("debris.noSub"),
        icon: Check,
      },
    ],
    [t],
  );

  const stepLabel = (current: WizardStep): string => {
    const index = WIZARD_STEPS.indexOf(current);
    if (index < 0) return "";
    if (current === "photo") return t("wizard.stepOptional");
    return t("wizard.stepOf", { current: index + 1 });
  };

  const stepQuestion = (current: WizardStep): string => {
    if (current === "done") return "";
    return t(`wizard.questions.${current}`);
  };

  useEffect(() => {
    if (!locationPrefill) return;
    setLatitude(String(locationPrefill.latitude));
    setLongitude(String(locationPrefill.longitude));
    setPlaceLabel(locationPrefill.placeLabel);
    setLocationMethod(locationPrefill.locationMethod);
    setBuildingFootprintId(locationPrefill.buildingFootprintId);
    setLocationStatus("detected");
    setAddressQuery(locationPrefill.placeLabel);
    gpsAttemptedRef.current = true;
    if (locationPrefill.crisisId) {
      setCrisisId(locationPrefill.crisisId);
    }
  }, [locationPrefill]);

  useEffect(() => {
    const controller = new AbortController();
    fetchActiveCrises(controller.signal)
      .then((data) => {
        setCrises(data);
        if (data.length > 0) {
          setCrisisId((current) => current || data[0].id);
          setNature((current) =>
            current ?? defaultNatureFromCrisis(data[0]),
          );
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? err.message
            : t("wizard.errors.loadCrises"),
        );
      })
      .finally(() => setLoadingCrises(false));
    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    return () => pendingPhotosRef.current.forEach(revokePendingPhoto);
  }, []);

  const detectLocation = async () => {
    setLocationStatus("detecting");
    setLocationMethod("gps");
    try {
      const coords = await getCurrentLocation();
      setLatitude(coords.latitude.toFixed(6));
      setLongitude(coords.longitude.toFixed(6));
      setLocationStatus("detected");
      void autoDetectLanguageFromLocation(coords.latitude, coords.longitude);
      try {
        const geo = await fetchReverseGeocode(coords.latitude, coords.longitude);
        setPlaceLabel(geo.display_name ?? t("wizard.currentLocation"));
      } catch {
        setPlaceLabel(t("wizard.currentLocation"));
      }
    } catch {
      setLocationStatus("failed");
      setPlaceLabel("");
    }
  };

  useEffect(() => {
    if (!showManualLocation) return;
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
        .then((results) => setPlaceResults(results))
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
  }, [addressQuery, showManualLocation]);

  const selectPlace = (place: PlaceSearchResult) => {
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    setPlaceLabel(place.display_name);
    setLocationMethod("manual");
    setLocationStatus("detected");
    setBuildingFootprintId(undefined);
    setAddressQuery(place.display_name);
    setPlaceResults([]);
    setShowManualLocation(false);
    setError(null);
  };

  const handleMapPick = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setLocationMethod("manual");
    setLocationStatus("detected");
    setBuildingFootprintId(undefined);
    setError(null);
    void fetchReverseGeocode(lat, lng)
      .then((geo) => {
        const label = geo.display_name ?? t("map.pickedLocation");
        setPlaceLabel(label);
        setAddressQuery(label);
      })
      .catch(() => {
        setPlaceLabel(t("map.pickedLocation"));
      });
  };

  useEffect(() => {
    if (loadingCrises || crises.length === 0 || gpsAttemptedRef.current || locationPrefill) {
      return;
    }
    gpsAttemptedRef.current = true;
    void detectLocation();
  }, [loadingCrises, crises.length, locationPrefill]);

  const resetWizard = () => {
    pendingPhotos.forEach(revokePendingPhoto);
    setStep("damage");
    setDamage(null);
    setInfra(null);
    setNature(crises[0] ? defaultNatureFromCrisis(crises[0]) : null);
    setDebris(null);
    setDescription("");
    setPendingPhotos([]);
    setShowManualLocation(false);
    setPlaceLabel("");
    setAddressQuery("");
    setPlaceResults([]);
    setBuildingFootprintId(undefined);
    setLocationMethod("gps");
    setSubmittedReport(null);
    setUploadedPhotoCount(0);
    setError(null);
    gpsAttemptedRef.current = false;
    setLocationStatus("idle");
    void detectLocation().finally(() => {
      gpsAttemptedRef.current = true;
    });
  };

  const goNext = () => {
    const idx = WIZARD_STEPS.indexOf(step);
    if (idx < WIZARD_STEPS.length - 1) {
      setStep(WIZARD_STEPS[idx + 1]);
    }
  };

  const goBack = () => {
    const idx = WIZARD_STEPS.indexOf(step);
    if (idx > 0) {
      setStep(WIZARD_STEPS[idx - 1]);
    }
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

  const submitReport = async () => {
    if (!crisisId || !damage || !infra || !nature || debris === null) {
      setError(t("wizard.errors.incomplete"));
      return;
    }

    if (!latitude || !longitude) {
      setError(t("wizard.errors.locationRequired"));
      setStep("location");
      setShowManualLocation(true);
      return;
    }

    setSubmitting(true);
    setUploadProgress(null);
    setError(null);

    try {
      const resolvedReporterName = resolveReporterName(reporterName);
      const report = await createReport({
        crisis_id: crisisId,
        damage_level: damage,
        infra_type: infra,
        debris_present: debris === "yes",
        nature_of_crisis: nature,
        description_raw: description.trim() || undefined,
        reporter_name: resolvedReporterName,
        source_language: i18n.language,
        submission_channel: "app",
        collected_at: toIsoUtc(new Date()),
        location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          location_method: locationMethod,
          building_footprint_id: buildingFootprintId,
        },
      });

      let photoCount = 0;
      if (pendingPhotos.length > 0) {
        setUploadProgress(
          t("wizard.uploading", { done: 0, total: pendingPhotos.length }),
        );
        const photos = await uploadReportPhotos(
          report.id,
          pendingPhotos.map((p) => p.file),
          { lat: Number(latitude), lng: Number(longitude) },
          (done, total) =>
            setUploadProgress(t("wizard.uploading", { done, total })),
        );
        photoCount = photos.length;
      }

      if (resolvedReporterName !== "anonymous") {
        saveReporterName(resolvedReporterName);
      }

      pendingPhotos.forEach(revokePendingPhoto);
      setPendingPhotos([]);
      setSubmittedReport(report);
      setUploadedPhotoCount(photoCount);
      setStep("done");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("wizard.errors.submitFailed"),
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (loadingCrises) {
    return (
      <WizardShell crisisName={t("wizard.loading")}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-400">
          {t("wizard.loadingCrises")}
        </div>
      </WizardShell>
    );
  }

  if (crises.length === 0) {
    return (
      <WizardShell crisisName={t("wizard.noActiveCrisis")}>
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm font-medium text-amber-100">
            {t("wizard.noActiveCrisesTitle")}
          </p>
          <p className="text-xs text-slate-400">
            {t("wizard.noActiveCrisesBody")}
          </p>
          <Link
            to="/"
            className="mt-2 text-sm text-accent hover:underline"
          >
            {t("nav.backToDashboard")}
          </Link>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell crisisName={selectedCrisis?.name ?? t("wizard.reportDamage")}>
      {step !== "done" && (
        <div className="flex gap-1 px-4 pt-3.5">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-0.5 flex-1 rounded-sm transition-colors ${
                i < stepIndex
                  ? "bg-emerald-500"
                  : i === stepIndex
                    ? "bg-accent"
                    : "bg-surface-border"
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end px-4 pt-2">
        <LanguageSwitcher compact />
      </div>

      {error && step !== "done" && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="min-h-[280px] px-4 py-4">
        {step === "done" && submittedReport ? (
          <div className="py-5 text-center">
            <CircleCheck className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-2.5 text-lg font-medium text-white">
              {t("wizard.doneTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {t("wizard.doneSubtitle")}
            </p>
            <div className="relative mx-auto mt-4 h-[150px] max-w-[280px] overflow-hidden rounded-lg border border-surface-border bg-[#1a2a3a]">
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "linear-gradient(#2a3544 0.5px, transparent 0.5px), linear-gradient(90deg, #2a3544 0.5px, transparent 0.5px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <MapPin className="absolute left-1/2 top-[45%] h-8 w-8 -translate-x-1/2 -translate-y-full text-red-500" />
            </div>
            <p className="mt-2.5 text-xs text-slate-400">
              {t("wizard.doneSummary", {
                damage: damageLevelLabel(damage ?? undefined),
                infra: infraTypeLabel(infra ?? undefined),
              })}
              {uploadedPhotoCount > 0 &&
                t("wizard.donePhotos", { count: uploadedPhotoCount })}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              {submittedReport.id}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-0.5 text-[11px] text-slate-500">{stepLabel(step)}</p>
            <p className="mb-3.5 text-[17px] font-medium leading-snug text-white">
              {stepQuestion(step)}
            </p>

            {step === "damage" && (
              <div className="space-y-2">
                {damageOptions.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    option={opt}
                    selected={damage === opt.value}
                    onSelect={() => setDamage(opt.value as DamageLevel)}
                  />
                ))}
              </div>
            )}

            {step === "infra" && (
              <div className="grid grid-cols-2 gap-2">
                {infraOptions.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    option={opt}
                    grid
                    selected={infra === opt.value}
                    onSelect={() => setInfra(opt.value as InfraType)}
                  />
                ))}
              </div>
            )}

            {step === "crisis" && (
              <div className="grid grid-cols-2 gap-2">
                {crisisOptions.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    option={opt}
                    grid
                    selected={nature === opt.value}
                    onSelect={() => setNature(opt.value as NatureOfCrisis)}
                  />
                ))}
              </div>
            )}

            {step === "debris" && (
              <div className="space-y-2">
                {debrisOptions.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    option={opt}
                    selected={debris === opt.value}
                    onSelect={() => setDebris(opt.value as "yes" | "no")}
                  />
                ))}
              </div>
            )}

            {step === "location" && (
              <ReportLocationPicker
                latitude={latitude}
                longitude={longitude}
                placeLabel={placeLabel}
                locationStatus={locationStatus}
                locationMethod={locationMethod}
                addressQuery={addressQuery}
                placeResults={placeResults}
                searchingPlaces={searchingPlaces}
                showSearch={showManualLocation}
                onToggleSearch={() => {
                  setShowManualLocation((v) => !v);
                  if (!showManualLocation) {
                    setAddressQuery(placeLabel);
                    setPlaceResults([]);
                  }
                }}
                onAddressQueryChange={setAddressQuery}
                onSelectPlace={selectPlace}
                onMapPick={handleMapPick}
                onUseGps={() => void detectLocation()}
              />
            )}

            {step === "photo" && (
              <div>
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
                  className="w-full rounded-lg border border-dashed border-surface-border px-4 py-6 text-center text-[13px] text-slate-400 transition hover:border-accent hover:text-slate-300 disabled:opacity-50"
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

                <p className="mb-1 mt-3 text-xs text-slate-400">
                  {t("wizard.reporterNameOptional")}
                </p>
                <input
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder={t("wizard.reporterNamePlaceholder")}
                  autoComplete="name"
                  maxLength={100}
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {t("wizard.reporterNameHint")}
                </p>

                <p className="mb-1 mt-3 text-xs text-slate-400">
                  {t("wizard.descriptionOptional")}
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("wizard.descriptionPlaceholder")}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
                />

                <button
                  type="button"
                  onClick={() => void submitReport()}
                  disabled={submitting}
                  className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
                >
                  {submitting
                    ? uploadProgress ?? t("wizard.submitting")
                    : t("wizard.skipSubmit")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {step !== "done" ? (
        <div className="flex gap-2 border-t border-surface-border px-4 py-3.5">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="flex w-12 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-transparent text-slate-200 transition hover:bg-surface disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4 rtl-flip" />
            </button>
          )}
          <button
            type="button"
            disabled={
              submitting ||
              !canProceed(step, {
                damage,
                infra,
                crisis: nature,
                debris,
              })
            }
            onClick={() => {
              if (step === "photo") void submitReport();
              else goNext();
            }}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? uploadProgress ?? t("wizard.submitting")
              : step === "photo"
                ? t("wizard.submitReport")
                : t("wizard.continue")}
          </button>
        </div>
      ) : (
        <div className="border-t border-surface-border px-4 py-3.5">
          <button
            type="button"
            onClick={resetWizard}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent-muted"
          >
            {t("wizard.submitAnother")}
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function WizardShell({
  crisisName,
  children,
}: {
  crisisName: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface-raised/80 px-4 py-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          {t("nav.dashboard")}
        </Link>
        <p className="truncate text-sm text-slate-400">{crisisName}</p>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-y-auto p-4">
        <div className="w-full max-w-[380px] overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
          {children}
        </div>
      </div>
    </div>
  );
}
