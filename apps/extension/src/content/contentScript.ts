import type { ContentImageContext } from "../shared/types";

interface GetImageContextRequest {
  type: "GET_IMAGE_CONTEXT";
  srcUrl: string;
}

chrome.runtime.onMessage.addListener((request: GetImageContextRequest, _sender, sendResponse) => {
  if (request.type !== "GET_IMAGE_CONTEXT") {
    return false;
  }

  const image = findImageBySource(request.srcUrl);
  const context: ContentImageContext = image
    ? {
        altText: image.alt || undefined,
        title: image.title || undefined,
        width: image.width || undefined,
        height: image.height || undefined,
        naturalWidth: image.naturalWidth || undefined,
        naturalHeight: image.naturalHeight || undefined
      }
    : {};

  sendResponse(context);
  return true;
});

function findImageBySource(srcUrl: string): HTMLImageElement | null {
  const normalizedTarget = normalizeUrl(srcUrl);
  const images = Array.from(document.images);

  return (
    images.find((image) => normalizeUrl(image.currentSrc) === normalizedTarget) ??
    images.find((image) => normalizeUrl(image.src) === normalizedTarget) ??
    images.find((image) => image.currentSrc === srcUrl || image.src === srcUrl) ??
    null
  );
}

function normalizeUrl(value: string): string {
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return value;
  }
}
