const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: "ImageTracer",
  version: "0.1.0",
  description:
    "Privacy-first reverse image search with local analysis and optional cloud features.",
  action: {
    default_title: "ImageTracer",
    default_popup: "popup.html"
  },
  options_page: "options.html",
  background: {
    service_worker: "background/serviceWorker.js",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content/contentScript.js"],
      run_at: "document_idle"
    }
  ],
  permissions: ["contextMenus", "storage", "tabs", "offscreen"],
  host_permissions: ["http://*/*", "https://*/*"],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:* https://*;"
  }
};

export default manifest;
