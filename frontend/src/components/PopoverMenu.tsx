import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface PopoverMenuProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
}

export default function PopoverMenu({
  anchor,
  open,
  onClose,
  children,
  align = "end",
}: PopoverMenuProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor || !popRef.current) return;

    const rect = anchor.getBoundingClientRect();
    const pop = popRef.current;
    let top = rect.bottom + 6;
    let left =
      align === "end" ? rect.right - pop.offsetWidth : rect.left;

    if (top + pop.offsetHeight > window.innerHeight - 10) {
      top = rect.top - pop.offsetHeight - 6;
    }
    left = Math.max(10, Math.min(left, window.innerWidth - pop.offsetWidth - 10));

    setPosition({ top, left });
  }, [open, anchor, align, children]);

  useEffect(() => {
    if (!open) return;

    const handleClick = () => onClose();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={popRef}
      className="admin-pop"
      style={{ top: position.top, left: position.left }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      {children}
    </div>,
    document.body,
  );
}
