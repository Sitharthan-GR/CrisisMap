import { fetchCrisisMap } from "../api/client";
import type { DamageLevel } from "../types/report";

export interface CrisisSeverityBreakdown {
  complete: number;
  partial: number;
  minimal: number;
}

export interface CrisisReportStats {
  total: number;
  sev: CrisisSeverityBreakdown;
}

const EMPTY_STATS: CrisisReportStats = {
  total: 0,
  sev: { complete: 0, partial: 0, minimal: 0 },
};

export async function fetchCrisisReportStats(
  crisisId: string,
  signal?: AbortSignal,
): Promise<CrisisReportStats> {
  try {
    const map = await fetchCrisisMap(crisisId, { status: "all" }, signal);
    const sev: CrisisSeverityBreakdown = { complete: 0, partial: 0, minimal: 0 };

    for (const feature of map.features) {
      const level = feature.properties.damage_level as DamageLevel;
      const count = feature.properties.report_count ?? 1;
      if (level in sev) {
        sev[level] += count;
      }
    }

    return { total: map.total, sev };
  } catch {
    return EMPTY_STATS;
  }
}

export async function fetchAllCrisisReportStats(
  crisisIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, CrisisReportStats>> {
  const entries = await Promise.all(
    crisisIds.map(async (id) => {
      const stats = await fetchCrisisReportStats(id, signal);
      return [id, stats] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function crisisTypeIconClass(
  type: string,
): "natural" | "technological" | "human" {
  if (type === "technological") return "technological";
  if (type === "human_made") return "human";
  return "natural";
}
