import type { SearchEngineConfig, SearchEngineId } from "./types";

export const SEARCH_ENGINES: SearchEngineConfig[] = [
  {
    id: "google",
    name: "Google Images",
    description: "Open Google Lens by URL.",
    sendsTo: "Google",
    badge: "Sends to search engine"
  },
  {
    id: "bing",
    name: "Bing Visual Search",
    description: "Open Bing image search with the image URL.",
    sendsTo: "Microsoft Bing",
    badge: "Sends to search engine"
  },
  {
    id: "tineye",
    name: "TinEye",
    description: "Search TinEye's reverse image index by URL.",
    sendsTo: "TinEye",
    badge: "Sends to search engine"
  },
  {
    id: "yandex",
    name: "Yandex Images",
    description: "Open Yandex reverse image search by URL.",
    sendsTo: "Yandex",
    badge: "Sends to search engine"
  },
  {
    id: "saucenao",
    name: "SauceNAO",
    description: "Search SauceNAO's source-focused reverse image index.",
    sendsTo: "SauceNAO",
    badge: "Sends to search engine"
  }
];

export const SEARCH_ENGINE_IDS = SEARCH_ENGINES.map((engine) => engine.id);

export interface SearchUrlResult {
  ok: boolean;
  url?: string;
  reason?: string;
}

export function getSearchEngine(id: SearchEngineId): SearchEngineConfig {
  const engine = SEARCH_ENGINES.find((candidate) => candidate.id === id);
  if (!engine) {
    throw new Error(`Unknown search engine: ${id}`);
  }
  return engine;
}

export function isNetworkImageUrl(imageUrl: string): boolean {
  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getUnsupportedImageReason(imageUrl: string): string {
  if (imageUrl.startsWith("data:")) {
    return "This is an embedded data URL. Search engines need an uploaded image or public URL.";
  }
  if (imageUrl.startsWith("blob:")) {
    return "This is a page-local blob URL. A cloud upload/proxy flow is required for third-party search.";
  }
  if (imageUrl.startsWith("file:")) {
    return "Local file URLs cannot be sent directly to web search engines.";
  }
  return "This image URL is not reachable by third-party search engines.";
}

export function buildSearchUrl(engineId: SearchEngineId, imageUrl: string): SearchUrlResult {
  if (!isNetworkImageUrl(imageUrl)) {
    return {
      ok: false,
      reason: getUnsupportedImageReason(imageUrl)
    };
  }

  const encoded = encodeURIComponent(imageUrl);

  switch (engineId) {
    case "google":
      return {
        ok: true,
        url: `https://lens.google.com/uploadbyurl?url=${encoded}`
      };
    case "bing":
      return {
        ok: true,
        url: `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIHMP&sbisrc=UrlPaste&q=imgurl:${encoded}`
      };
    case "tineye":
      return {
        ok: true,
        url: `https://tineye.com/search?url=${encoded}`
      };
    case "yandex":
      return {
        ok: true,
        url: `https://yandex.com/images/search?rpt=imageview&url=${encoded}`
      };
    case "saucenao":
      return {
        ok: true,
        url: `https://saucenao.com/search.php?url=${encoded}`
      };
    default:
      return {
        ok: false,
        reason: "Unsupported search engine."
      };
  }
}

export function buildEnabledSearchUrls(
  engineIds: SearchEngineId[],
  imageUrl: string
): Array<{ engineId: SearchEngineId; result: SearchUrlResult }> {
  return engineIds.map((engineId) => ({
    engineId,
    result: buildSearchUrl(engineId, imageUrl)
  }));
}
