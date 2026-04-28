import { CONTEXT_MENU_IDS } from "../shared/constants";
import { SEARCH_ENGINES } from "../shared/searchEngines";
import type { SearchEngineId } from "../shared/types";

export type ImageContextMenuAction =
  | { type: "open-panel" }
  | { type: "search-all" }
  | { type: "search-engine"; engineId: SearchEngineId };

export function registerContextMenus(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.openImageTracer,
        title: "Open ImageTracer",
        contexts: ["page", "selection", "link", "editable", "video", "audio"]
      });

      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.imageParent,
        title: "ImageTracer",
        contexts: ["image"]
      });

      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.imageOpenPanel,
        parentId: CONTEXT_MENU_IDS.imageParent,
        title: "Open panel",
        contexts: ["image"]
      });

      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.imageSearchAll,
        parentId: CONTEXT_MENU_IDS.imageParent,
        title: "Search all enabled engines",
        contexts: ["image"]
      });

      for (const engine of SEARCH_ENGINES) {
        chrome.contextMenus.create({
          id: `${CONTEXT_MENU_IDS.imageSearchEnginePrefix}${engine.id}`,
          parentId: CONTEXT_MENU_IDS.imageParent,
          title: `Search ${engine.name}`,
          contexts: ["image"]
        });
      }

      resolve();
    });
  });
}

export function isOpenImageTracerMenuClick(
  info: chrome.contextMenus.OnClickData
): boolean {
  return info.menuItemId === CONTEXT_MENU_IDS.openImageTracer;
}

export function getImageContextMenuAction(
  info: chrome.contextMenus.OnClickData
): ImageContextMenuAction | null {
  if (info.menuItemId === CONTEXT_MENU_IDS.imageOpenPanel) {
    return { type: "open-panel" };
  }

  if (info.menuItemId === CONTEXT_MENU_IDS.imageSearchAll) {
    return { type: "search-all" };
  }

  if (
    typeof info.menuItemId === "string" &&
    info.menuItemId.startsWith(CONTEXT_MENU_IDS.imageSearchEnginePrefix)
  ) {
    const engineId = info.menuItemId.slice(
      CONTEXT_MENU_IDS.imageSearchEnginePrefix.length
    ) as SearchEngineId;
    return { type: "search-engine", engineId };
  }

  return null;
}
