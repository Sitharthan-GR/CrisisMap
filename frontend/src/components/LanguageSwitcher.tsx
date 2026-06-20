import { Globe } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "../i18n";
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../i18n/languages";

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
  variant?: "pill" | "button";
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export default function LanguageSwitcher({
  compact = false,
  className = "",
  variant = "pill",
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const current =
    SUPPORTED_LANGUAGES.find((lang) => lang.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const selectLanguage = (code: SupportedLanguage) => {
    setAppLanguage(code, true);
    setOpen(false);
  };

  const isRtl = document.documentElement.dir === "rtl";

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            className="fixed z-[9999] min-w-[200px] rounded-xl border py-1"
            style={{
              ...(isRtl
                ? { top: menuPos.top, left: menuPos.left }
                : {
                    top: menuPos.top,
                    left: menuPos.left + menuPos.width,
                    transform: "translateX(-100%)",
                  }),
              borderColor: "var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = i18n.language === lang.code;
              return (
                <li key={lang.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectLanguage(lang.code)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition ${
                      selected
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    }`}
                    style={selected ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <span>{lang.native}</span>
                    <span className="text-xs uppercase text-slate-500">
                      {lang.code}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  const buttonClass =
    variant === "button"
      ? "btn btn-sm"
      : `inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface text-slate-300 transition hover:border-slate-500 hover:text-white ${
          compact ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1.5 text-xs"
        }`;

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={buttonClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.select")}
      >
        <Globe className={variant === "button" || compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
        <span className="font-medium uppercase">{current.code}</span>
      </button>
      {menu}
    </div>
  );
}
