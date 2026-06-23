import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface ComboFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  getOptionLabel?: (option: string) => string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  required?: boolean;
  emptyLabel?: string;
}

function matchesOption(option: string, query: string, getOptionLabel: (option: string) => string): boolean {
  const haystack = [option, getOptionLabel(option)].join(" ").toLowerCase();
  return haystack.includes(query);
}

export default function ComboField({
  id,
  value,
  onChange,
  options,
  getOptionLabel = (option) => option,
  placeholder,
  disabled = false,
  maxLength,
  required = false,
  emptyLabel = "No matches",
}: ComboFieldProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => matchesOption(option, normalizedQuery, getOptionLabel));
  }, [getOptionLabel, normalizedQuery, options]);

  useEffect(() => {
    if (!open) {
      setQuery(value);
    }
  }, [open, value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [value]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const selectOption = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  const commitInput = () => {
    onChange(query.trim());
    setQuery(query.trim());
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`combo-field${open ? " open" : ""}${disabled ? " disabled" : ""}`}
    >
      <div className="combo-field__control">
        <input
          ref={inputRef}
          id={id}
          className="field combo-field__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={open ? query : value}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery(value);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery(value);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              commitInput();
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                commitInput();
              }
            }, 0);
          }}
        />
        <button
          type="button"
          className="combo-field__toggle"
          aria-label="Show options"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (open ? setOpen(false) : openList())}
        >
          <ChevronDown strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open && !disabled ? (
        <ul id={listboxId} className="combo-field__list" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <li key={option} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option}
                  className={value === option ? "selected" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {getOptionLabel(option)}
                </button>
              </li>
            ))
          ) : (
            <li className="combo-field__empty" role="presentation">
              {emptyLabel}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
