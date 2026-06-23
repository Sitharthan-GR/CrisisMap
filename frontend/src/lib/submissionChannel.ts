export type SubmissionChannel = "mobile" | "web";

/** Infer whether the report was submitted from a phone/tablet or desktop browser. */
export function detectSubmissionChannel(): SubmissionChannel {
  if (typeof navigator === "undefined") {
    return "web";
  }

  const ua = navigator.userAgent;
  const isMobileUa =
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

  return isMobileUa || isTablet ? "mobile" : "web";
}
