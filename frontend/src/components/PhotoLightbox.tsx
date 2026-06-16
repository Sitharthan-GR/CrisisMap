import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface PhotoLightboxProps {
  photos: string[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function PhotoLightbox({
  photos,
  index,
  open,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const { t } = useTranslation();
  const hasMultiple = photos.length > 1;
  const current = photos[index];

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + photos.length) % photos.length);
  }, [index, onIndexChange, photos.length]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % photos.length);
  }, [index, onIndexChange, photos.length]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, goPrev, goNext]);

  if (!open || !current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={t("reportDetail.photoViewer")}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-slate-300">
          {hasMultiple
            ? t("reportDetail.photoCounter", {
                current: index + 1,
                total: photos.length,
              })
            : t("reportDetail.photoViewer")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("reportDetail.close")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white transition hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-4">
        {hasMultiple && (
          <button
            type="button"
            onClick={goPrev}
            aria-label={t("reportDetail.prevPhoto")}
            className="absolute start-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition hover:bg-white/10 sm:start-4"
          >
            <ChevronLeft className="h-6 w-6 rtl-flip" />
          </button>
        )}

        <img
          src={current}
          alt=""
          className="max-h-full max-w-full object-contain"
        />

        {hasMultiple && (
          <button
            type="button"
            onClick={goNext}
            aria-label={t("reportDetail.nextPhoto")}
            className="absolute end-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition hover:bg-white/10 sm:end-4"
          >
            <ChevronRight className="h-6 w-6 rtl-flip" />
          </button>
        )}
      </div>

      {hasMultiple && (
        <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-4">
          {photos.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? "border-accent" : "border-white/20 opacity-70 hover:opacity-100"
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

interface PhotoGalleryProps {
  photos: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  compact?: boolean;
}

export function PhotoGallery({
  photos,
  activeIndex,
  onIndexChange,
  compact = false,
}: PhotoGalleryProps) {
  const { t } = useTranslation();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const current = photos[activeIndex];
  if (!current) return null;

  return (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block w-full overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label={t("reportDetail.viewFullscreen")}
        >
          <img
            src={current}
            alt=""
            className={`w-full object-cover transition group-hover:brightness-90 ${
              compact ? "max-h-36" : "max-h-56"
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[11px] font-medium text-white opacity-90 transition hover:bg-black/80"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {photos.length > 1
            ? t("reportDetail.viewPhotos", { count: photos.length })
            : t("reportDetail.enlarge")}
        </button>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange((activeIndex - 1 + photos.length) % photos.length);
              }}
              aria-label={t("reportDetail.prevPhoto")}
              className="absolute start-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-e-md border border-white/20 border-s-0 bg-black/70 text-white transition hover:bg-black/90"
            >
              <ChevronLeft className="h-4 w-4 rtl-flip" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange((activeIndex + 1) % photos.length);
              }}
              aria-label={t("reportDetail.nextPhoto")}
              className="absolute end-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-s-md border border-white/20 border-e-0 bg-black/70 text-white transition hover:bg-black/90"
            >
              <ChevronRight className="h-4 w-4 rtl-flip" />
            </button>
            <span className="absolute bottom-2 start-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">
              {t("reportDetail.photoCounter", {
                current: activeIndex + 1,
                total: photos.length,
              })}
            </span>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {photos.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => onIndexChange(index)}
              className={`h-11 w-11 shrink-0 overflow-hidden rounded-md border-2 transition ${
                index === activeIndex
                  ? "border-accent"
                  : "border-surface-border opacity-70 hover:opacity-100"
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <PhotoLightbox
        photos={photos}
        index={activeIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={onIndexChange}
      />
    </>
  );
}
