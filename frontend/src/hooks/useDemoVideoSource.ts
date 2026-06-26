import { useEffect, useState } from "react";
import { DEMO_VIDEO_SOURCE } from "../lib/constants";
import type { DemoVideoSource } from "../lib/demoVideo";
import { resolveDemoVideoSource } from "../lib/demoVideo";

type DemoConfigFile = {
  demoVideoUrl?: string;
};

let cachedRuntimeSource: DemoVideoSource | null | undefined;

async function loadRuntimeDemoVideoSource(): Promise<DemoVideoSource | null> {
  if (cachedRuntimeSource !== undefined) {
    return cachedRuntimeSource;
  }

  try {
    const response = await fetch("/demo-config.json", { cache: "no-cache" });
    if (!response.ok) {
      cachedRuntimeSource = null;
      return null;
    }
    const config = (await response.json()) as DemoConfigFile;
    cachedRuntimeSource = resolveDemoVideoSource(config.demoVideoUrl);
    return cachedRuntimeSource;
  } catch {
    cachedRuntimeSource = null;
    return null;
  }
}

/** Build-time env (VITE_DEMO_VIDEO_URL) with runtime fallback from /demo-config.json. */
export function useDemoVideoSource(): DemoVideoSource | null {
  const [runtimeSource, setRuntimeSource] = useState<DemoVideoSource | null>(null);

  useEffect(() => {
    if (DEMO_VIDEO_SOURCE) return;

    let cancelled = false;
    void loadRuntimeDemoVideoSource().then((source) => {
      if (!cancelled) setRuntimeSource(source);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return DEMO_VIDEO_SOURCE ?? runtimeSource;
}
