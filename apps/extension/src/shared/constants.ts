export const EXTENSION_NAME = "ImageTracer";

export const STORAGE_KEYS = {
  settings: "imagetracer.settings",
  currentImage: "imagetracer.currentImage",
  searchHistory: "imagetracer.searchHistory",
  notes: "imagetracer.notes",
  favorites: "imagetracer.favorites"
} as const;

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export const CONTEXT_MENU_ID = "imagetracer-search-image";
export const CONTEXT_MENU_IDS = {
  openImageTracer: "imagetracer-open",
  imageParent: CONTEXT_MENU_ID,
  imageOpenPanel: "imagetracer-image-open-panel",
  imageSearchAll: "imagetracer-image-search-all",
  imageSearchEnginePrefix: "imagetracer-image-search-engine:"
} as const;

export const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";

export const MAX_HISTORY_ITEMS = 60;
