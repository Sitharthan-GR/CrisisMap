export type DemoVideoSource =
  | { kind: "file"; url: string }
  | { kind: "embed"; url: string; openUrl: string };

/** Resolve VITE_DEMO_VIDEO_URL to a file URL or embed (YouTube / Vimeo). */
export function resolveDemoVideoSource(raw: string | undefined): DemoVideoSource | null {
  const url = raw?.trim();
  if (!url) return null;

  const youtubeId = parseYouTubeId(url);
  if (youtubeId) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}`;
    return { kind: "embed", url: embedUrl, openUrl: `https://www.youtube.com/watch?v=${youtubeId}` };
  }

  const vimeoId = parseVimeoId(url);
  if (vimeoId) {
    const embedUrl = `https://player.vimeo.com/video/${vimeoId}`;
    return { kind: "embed", url: embedUrl, openUrl: `https://vimeo.com/${vimeoId}` };
  }

  return { kind: "file", url };
}

function parseYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function parseVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("vimeo.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = parts.find((part) => /^\d+$/.test(part));
    return id ?? null;
  } catch {
    return null;
  }
}
