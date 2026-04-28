import type { RuntimeRequest, RuntimeResponse } from "./types";

export function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<RuntimeResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: RuntimeResponse<T> | undefined) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response ?? { ok: false, error: "No response from background service worker." });
    });
  });
}
