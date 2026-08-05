const SHOWS_KEY = "crisismap-help-spotlight-shows";
const SESSION_KEY = "crisismap-help-spotlight-session";
export const HELP_SPOTLIGHT_MAX_SHOWS = 2;

function readShows(): number {
  try {
    const raw = localStorage.getItem(SHOWS_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeShows(n: number) {
  try {
    localStorage.setItem(SHOWS_KEY, String(n));
  } catch {
    /* ignore quota / private mode */
  }
}

function sessionAlreadyClaimed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markSessionClaimed() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Claim one of the two first-visit highlight slots for this browser session.
 * Returns true if the help button should be highlighted now.
 */
export function claimHelpSpotlightVisit(): boolean {
  if (sessionAlreadyClaimed()) return false;

  const shows = readShows();
  if (shows >= HELP_SPOTLIGHT_MAX_SHOWS) return false;

  writeShows(shows + 1);
  markSessionClaimed();
  return true;
}
