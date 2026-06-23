import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ALL_CRISES_ID } from "../lib/constants";
import type { Crisis } from "../types/report";

interface CrisisComboboxProps {
  crises: Crisis[];
  selectedCrisisId: string;
  nearestCrisisId?: string | null;
  disabled?: boolean;
  onChange: (crisisId: string) => void;
}

function crisisLabel(
  crisis: Crisis,
  nearestCrisisId: string | null | undefined,
  nearestSuffix: string,
): string {
  const nearest =
    nearestCrisisId === crisis.id ? ` (${nearestSuffix})` : "";
  return `${crisis.name}${nearest}`;
}

function matchesQuery(crisis: Crisis, query: string): boolean {
  const haystack = [crisis.name, crisis.crisis_subtype, crisis.crisis_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function CrisisCombobox({
  crises,
  selectedCrisisId,
  nearestCrisisId,
  disabled = false,
  onChange,
}: CrisisComboboxProps) {
  const { t } = useTranslation();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allCrisesLabel = t("dashboard.allCrises");
  const nearestSuffix = t("wizard.nearestCrisis");

  const selectedCrisis =
    selectedCrisisId !== ALL_CRISES_ID
      ? crises.find((crisis) => crisis.id === selectedCrisisId)
      : null;

  const selectedLabel =
    selectedCrisisId === ALL_CRISES_ID
      ? allCrisesLabel
      : selectedCrisis
        ? crisisLabel(selectedCrisis, nearestCrisisId, nearestSuffix)
        : t("dashboard.selectCrisis");

  const normalizedQuery = query.trim().toLowerCase();

  const showAllOption =
    !normalizedQuery || allCrisesLabel.toLowerCase().includes(normalizedQuery);

  const orderedCrises = useMemo(() => {
    const nearest = nearestCrisisId
      ? crises.find((crisis) => crisis.id === nearestCrisisId)
      : null;

    const pool = normalizedQuery
      ? crises.filter((crisis) => matchesQuery(crisis, normalizedQuery))
      : crises;

    if (!nearest) return pool;

    const rest = pool.filter((crisis) => crisis.id !== nearest.id);
    return [nearest, ...rest];
  }, [crises, normalizedQuery, nearestCrisisId]);

  const hasOptions = showAllOption || orderedCrises.length > 0;

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open, selectedCrisisId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const selectCrisis = (crisisId: string) => {
    onChange(crisisId);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={rootRef}
      className={`crisis-combobox${open ? " open" : ""}${disabled ? " disabled" : ""}`}
    >
      <div className="crisis-combobox__control">
        <Search className="crisis-combobox__icon" strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          id="crisis-combobox"
          className="field crisis-combobox__input"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={open ? query : selectedLabel}
          placeholder={t("dashboard.searchCrisisPlaceholder")}
          aria-label={t("dashboard.searchCrisis")}
          disabled={disabled}
          autoComplete="off"
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (orderedCrises[0]) {
                selectCrisis(orderedCrises[0].id);
              } else if (showAllOption) {
                selectCrisis(ALL_CRISES_ID);
              }
            }
          }}
        />
        <button
          type="button"
          className="crisis-combobox__toggle"
          aria-label={t("dashboard.selectCrisis")}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
        >
          <ChevronDown strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open && (
        <ul id={listboxId} className="crisis-combobox__list" role="listbox">
          {showAllOption && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={selectedCrisisId === ALL_CRISES_ID}
                className={selectedCrisisId === ALL_CRISES_ID ? "selected" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCrisis(ALL_CRISES_ID)}
              >
                <span className="crisis-combobox__option-title">{allCrisesLabel}</span>
                <span className="crisis-combobox__option-meta">
                  {t("dashboard.allCrisesMeta", { count: crises.length })}
                </span>
              </button>
            </li>
          )}
          {orderedCrises.map((crisis) => (
            <li key={crisis.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={selectedCrisisId === crisis.id}
                className={selectedCrisisId === crisis.id ? "selected" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCrisis(crisis.id)}
              >
                <span className="crisis-combobox__option-title">
                  {crisis.name}
                  {nearestCrisisId === crisis.id
                    ? ` (${nearestSuffix})`
                    : ""}
                </span>
                <span className="crisis-combobox__option-meta">
                  {crisis.crisis_subtype} ·{" "}
                  {new Date(crisis.onset_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
          {!hasOptions && (
            <li className="crisis-combobox__empty" role="presentation">
              {t("dashboard.noCrisesMatch")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
