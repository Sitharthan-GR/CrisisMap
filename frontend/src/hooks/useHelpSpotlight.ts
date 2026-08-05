import { useEffect, useState } from "react";
import { claimHelpSpotlightVisit } from "../lib/helpSpotlight";

/**
 * Highlights the help button for the first two site visits.
 * Dismisses when the user clicks Help or anywhere else on the page.
 */
export function useHelpSpotlight(enabled = true): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!claimHelpSpotlightVisit()) return;
    setActive(true);
  }, [enabled]);

  useEffect(() => {
    if (!active) return;

    const dismiss = () => setActive(false);

    // Avoid dismissing from the same gesture that mounted the page.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", dismiss, true);
      document.addEventListener("keydown", dismiss, true);
    }, 500);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
    };
  }, [active]);

  return active;
}
