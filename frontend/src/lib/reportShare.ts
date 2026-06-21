export function buildReportShareUrl(reportId: string): string {
  return `${window.location.origin}/reports/${reportId}`;
}

export type ShareReportResult = "shared" | "copied" | "failed";

export async function shareReportLink(
  reportId: string,
  title?: string,
): Promise<ShareReportResult> {
  const url = buildReportShareUrl(reportId);

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: title ?? "Crisis report",
        url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return "failed";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
