import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CollapsiblePanelProps {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  width: number;
  title: string;
  expandLabel: string;
  collapseLabel: string;
  icon: ReactNode;
  children: ReactNode;
}

function openWidthClass(width: number): string {
  if (width === 300) return "xl:w-[300px]";
  if (width === 340) return "xl:w-[340px]";
  return `xl:max-w-[${width}px] xl:w-[${width}px]`;
}

export default function CollapsiblePanel({
  side,
  open,
  onToggle,
  width,
  title,
  expandLabel,
  collapseLabel,
  icon,
  children,
}: CollapsiblePanelProps) {
  const isLeft = side === "left";

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={expandLabel}
        title={expandLabel}
        className="flex w-11 shrink-0 flex-col items-center gap-2 self-stretch rounded-xl border border-surface-border bg-surface-raised/90 px-1.5 py-4 text-slate-400 transition hover:border-slate-500 hover:bg-surface-raised hover:text-white"
      >
        {isLeft ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
        <span className="text-accent">{icon}</span>
        <span
          className="text-[10px] font-medium uppercase tracking-wide [writing-mode:vertical-rl]"
          style={{ textOrientation: "mixed" }}
        >
          {title}
        </span>
      </button>
    );
  }

  return (
    <aside
      className={`flex h-full min-h-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised/40 transition-[width] duration-300 w-full xl:min-h-0 ${openWidthClass(width)}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-accent">{icon}</span>
          <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapseLabel}
          title={collapseLabel}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-surface-border text-slate-400 transition hover:border-slate-500 hover:bg-surface hover:text-white"
        >
          {isLeft ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
