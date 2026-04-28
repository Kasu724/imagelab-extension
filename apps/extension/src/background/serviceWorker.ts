import {
  getImageContextMenuAction,
  isOpenImageTracerMenuClick,
  registerContextMenus,
  type ImageContextMenuAction
} from "./contextMenus";
import { uploadImageForSearch } from "../shared/cloudClient";
import { OFFSCREEN_DOCUMENT_PATH } from "../shared/constants";
import { buildEnabledSearchUrls, buildSearchUrl } from "../shared/searchEngines";
import {
  getCurrentImage,
  getSettings,
  setCurrentImage,
  updateCurrentImage,
  upsertHistoryEntry
} from "../shared/storage";
import { createSelectedImage, imageNeedsUploadProxy } from "../shared/imageMetadata";
import type {
  ContentImageContext,
  LocalImageAnalysis,
  RuntimeRequest,
  RuntimeResponse,
  SearchEngineId,
  SelectedImage
} from "../shared/types";

type OffscreenResponse = {
  ok: boolean;
  analysis?: LocalImageAnalysis;
  error?: string;
};

void registerContextMenus();

chrome.runtime.onInstalled.addListener(() => {
  void registerContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void registerContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (isOpenImageTracerMenuClick(info)) {
    void openImageTracerSurface(tab?.id);
    return;
  }

  const imageAction = getImageContextMenuAction(info);
  if (imageAction) {
    void handleImageContextClick(info, tab, imageAction);
  }
});

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  if (!isRuntimeRequest(request)) {
    return false;
  }

  void handleRuntimeRequest(request)
    .then((response) => sendResponse(response))
    .catch((error: Error) =>
      sendResponse({
        ok: false,
        error: error.message
      } satisfies RuntimeResponse)
    );
  return true;
});

function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      [
        "OPEN_SEARCH_ENGINE",
        "OPEN_ENABLED_ENGINES",
        "ANALYZE_CURRENT_IMAGE",
        "GET_CURRENT_IMAGE"
      ].includes(String((value as { type?: unknown }).type))
  );
}

async function handleImageContextClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
  action: ImageContextMenuAction
): Promise<void> {
  const image = await captureImageFromContext(info, tab);

  if (!image) {
    await openImageTracerSurface(tab?.id);
    return;
  }

  void analyzeAndStore(image);

  try {
    if (action.type === "open-panel") {
      await openImageTracerSurface(tab?.id);
      return;
    }

    if (action.type === "search-all") {
      const settings = await getSettings();
      await openEnabledEngines(image, settings.enabledEngines);
      return;
    }

    await openEngine(image, action.engineId);
  } catch (error) {
    await openImageTracerSurface(tab?.id);
    console.warn("ImageTracer context-menu search failed.", error);
  }
}

async function captureImageFromContext(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<SelectedImage | null> {
  if (!info.srcUrl) {
    return null;
  }

  const context = tab?.id
    ? await sendTabMessage<ContentImageContext>(tab.id, {
        type: "GET_IMAGE_CONTEXT",
        srcUrl: info.srcUrl
      })
    : null;

  const image = createSelectedImage(info.srcUrl, info.pageUrl ?? tab?.url, context);
  await setCurrentImage(image);
  await upsertHistoryEntry(image);
  return image;
}

async function handleRuntimeRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  switch (request.type) {
    case "GET_CURRENT_IMAGE": {
      const image = await getCurrentImage();
      return { ok: true, data: image };
    }
    case "OPEN_SEARCH_ENGINE": {
      const image = await getCurrentImage();
      if (!image) {
        return { ok: false, error: "Select an image first." };
      }
      await openEngine(image, request.engineId);
      return { ok: true };
    }
    case "OPEN_ENABLED_ENGINES": {
      const image = await getCurrentImage();
      if (!image) {
        return { ok: false, error: "Select an image first." };
      }
      const settings = await getSettings();
      await openEnabledEngines(image, settings.enabledEngines);
      return { ok: true };
    }
    case "ANALYZE_CURRENT_IMAGE": {
      const image = await getCurrentImage();
      if (!image) {
        return { ok: false, error: "Select an image first." };
      }
      const analysis = await analyzeAndStore(image);
      return { ok: true, data: analysis };
    }
    default:
      return { ok: false, error: "Unsupported request." };
  }
}

async function openEngine(image: SelectedImage, engineId: SearchEngineId): Promise<void> {
  const { image: searchableImage, imageUrl } = await ensureSearchableImageUrl(image);
  const result = buildSearchUrl(engineId, imageUrl);
  if (!result.ok || !result.url) {
    throw new Error(result.reason ?? "This image cannot be opened in that search engine.");
  }
  await createTab(result.url);
  await upsertHistoryEntry(searchableImage, [engineId]);
}

async function openEnabledEngines(
  image: SelectedImage,
  engineIds: SearchEngineId[]
): Promise<void> {
  const { image: searchableImage, imageUrl } = await ensureSearchableImageUrl(image);
  const urls = buildEnabledSearchUrls(engineIds, imageUrl);
  const opened: SearchEngineId[] = [];
  const errors: string[] = [];

  for (const { engineId, result } of urls) {
    if (!result.ok || !result.url) {
      errors.push(result.reason ?? `Could not open ${engineId}.`);
      continue;
    }
    await createTab(result.url, false);
    opened.push(engineId);
  }

  if (opened.length > 0) {
    await upsertHistoryEntry(searchableImage, opened);
  }

  if (opened.length === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }
}

async function ensureSearchableImageUrl(
  image: SelectedImage
): Promise<{ image: SelectedImage; imageUrl: string }> {
  if (!imageNeedsUploadProxy(image.srcUrl)) {
    return { image, imageUrl: image.srcUrl };
  }

  if (image.remoteImageUrl) {
    return { image, imageUrl: image.remoteImageUrl };
  }

  if (!image.srcUrl.startsWith("data:image/")) {
    throw new Error(
      "This protected image cannot be uploaded from the extension yet. Save or upload the image file in ImageTracer first."
    );
  }

  const settings = await getSettings();
  if (!settings.cloudMode) {
    throw new Error(
      "Uploaded-image reverse search needs Cloud Mode. Enable Cloud Mode and set your ImageTracer API key in settings."
    );
  }

  const upload = await uploadImageForSearch(
    {
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey
    },
    {
      image_data_url: image.srcUrl,
      filename: image.title ?? image.id
    }
  );

  const updatedImage: SelectedImage = {
    ...image,
    remoteImageUrl: upload.image_url,
    remoteImageUploadedAt: new Date().toISOString()
  };
  await setCurrentImage(updatedImage);
  await upsertHistoryEntry(updatedImage);

  return { image: updatedImage, imageUrl: upload.image_url };
}

async function analyzeAndStore(image: SelectedImage): Promise<LocalImageAnalysis> {
  const response = await analyzeImageWithOffscreen(image.srcUrl);
  const analysis: LocalImageAnalysis = response.ok && response.analysis
    ? response.analysis
    : {
        dominantColors: [],
        analyzedAt: new Date().toISOString(),
        error: response.error ?? "Local image analysis failed."
      };

  const current = await getCurrentImage();
  if (current?.id === image.id) {
    await updateCurrentImage({
      width: analysis.width ?? current.width,
      height: analysis.height ?? current.height,
      analysis
    });
  } else {
    await upsertHistoryEntry({
      ...image,
      width: analysis.width ?? image.width,
      height: analysis.height ?? image.height,
      analysis
    });
  }

  return analysis;
}

async function analyzeImageWithOffscreen(srcUrl: string): Promise<OffscreenResponse> {
  await ensureOffscreenDocument();
  return sendRuntimeMessage<OffscreenResponse>({
    type: "OFFSCREEN_ANALYZE_IMAGE",
    srcUrl
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error("Offscreen documents are not available in this Chromium build.");
  }

  const offscreenApi = chrome.offscreen as typeof chrome.offscreen & {
    hasDocument?: () => Promise<boolean>;
  };

  if (offscreenApi.hasDocument && (await offscreenApi.hasDocument())) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["BLOBS"] as chrome.offscreen.Reason[],
    justification: "Analyze selected images locally using canvas APIs."
  });
}

function sendTabMessage<T>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: T | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response ?? null);
    });
  });
}

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T | undefined) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response) {
        reject(new Error("No response received."));
        return;
      }
      resolve(response);
    });
  });
}

async function openImageTracerSurface(tabId?: number): Promise<void> {
  void tabId;
  await createTab(chrome.runtime.getURL("sidepanel.html"));
}

function createTab(url: string, active = true): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}
