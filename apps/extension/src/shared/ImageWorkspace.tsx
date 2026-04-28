import {
  AlertTriangle,
  Cloud,
  ExternalLink,
  FileText,
  History,
  ImageIcon,
  Link,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Upload
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getCloudUsage, runCloudAnalyze, runCloudSearch, uploadImageForSearch } from "./cloudClient";
import { createSelectedImage, formatDimensions, imageNeedsUploadProxy } from "./imageMetadata";
import { getCloudDisclosure, getThirdPartyDisclosure, getUploadProxyHint } from "./permissions";
import { SEARCH_ENGINES, getSearchEngine } from "./searchEngines";
import {
  getCurrentImage,
  getFavorites,
  getHistory,
  getNotes,
  getSettings,
  setCurrentImage,
  setNote,
  subscribeToStorage,
  toggleFavorite,
  upsertHistoryEntry
} from "./storage";
import type {
  CloudAnalysisResponse,
  CloudSearchResult,
  CloudUsage,
  ImageTracerSettings,
  SearchEngineId,
  SearchHistoryItem,
  SelectedImage
} from "./types";
import { sendRuntimeMessage } from "./runtime";

interface ImageWorkspaceProps {
  surface: "popup" | "sidepanel";
}

type BusyAction = SearchEngineId | "all" | "analysis" | "cloud-search" | "cloud-analyze" | null;

const MAX_LOCAL_UPLOAD_BYTES = 2_500_000;

export function ImageWorkspace({ surface }: ImageWorkspaceProps) {
  const [settings, setSettings] = useState<ImageTracerSettings | null>(null);
  const [currentImage, setCurrentImageState] = useState<SelectedImage | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [cloudResults, setCloudResults] = useState<CloudSearchResult[]>([]);
  const [cloudAnalysis, setCloudAnalysis] = useState<CloudAnalysisResponse | null>(null);
  const [usage, setUsage] = useState<CloudUsage | null>(null);

  async function refresh() {
    const [nextSettings, image, nextHistory, nextNotes, nextFavorites] = await Promise.all([
      getSettings(),
      getCurrentImage(),
      getHistory(),
      getNotes(),
      getFavorites()
    ]);
    setSettings(nextSettings);
    setCurrentImageState(image);
    setHistory(nextHistory);
    setNotes(nextNotes);
    setFavorites(nextFavorites);
    setNoteDraft(image ? nextNotes[image.id] ?? "" : "");
  }

  useEffect(() => {
    void refresh();
    return subscribeToStorage(() => {
      void refresh();
    });
  }, []);

  const enabledEngines = useMemo(() => {
    if (!settings) {
      return [];
    }
    return SEARCH_ENGINES.filter((engine) => settings.enabledEngines.includes(engine.id));
  }, [settings]);

  const isFavorite = Boolean(currentImage && favorites.includes(currentImage.id));
  const dimensions = currentImage
    ? formatDimensions(
        currentImage.analysis?.width ?? currentImage.width,
        currentImage.analysis?.height ?? currentImage.height
      )
    : "";
  const uploadProxyHint = currentImage ? getUploadProxyHint(currentImage) : null;

  async function runAction(action: BusyAction, operation: () => Promise<void>) {
    setBusy(action);
    setError("");
    setStatus("");
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function openEngine(engineId: SearchEngineId) {
    await runAction(engineId, async () => {
      const response = await sendRuntimeMessage({ type: "OPEN_SEARCH_ENGINE", engineId });
      if (!response.ok) {
        throw new Error(response.error ?? "Could not open search engine.");
      }
      setStatus(`Opened ${getSearchEngine(engineId).name}.`);
    });
  }

  async function openAll() {
    await runAction("all", async () => {
      const response = await sendRuntimeMessage({ type: "OPEN_ENABLED_ENGINES" });
      if (!response.ok) {
        throw new Error(response.error ?? "Could not open enabled engines.");
      }
      setStatus("Opened all enabled engines.");
    });
  }

  async function analyzeCurrentImage() {
    await runAction("analysis", async () => {
      const response = await sendRuntimeMessage({ type: "ANALYZE_CURRENT_IMAGE" });
      if (!response.ok) {
        throw new Error(response.error ?? "Local analysis failed.");
      }
      setStatus("Local analysis refreshed.");
    });
  }

  async function selectImage(image: SelectedImage, message: string) {
    await runAction("analysis", async () => {
      await setCurrentImage(image);
      await upsertHistoryEntry(image);
      setCloudResults([]);
      setCloudAnalysis(null);

      const response = await sendRuntimeMessage({ type: "ANALYZE_CURRENT_IMAGE" });
      setStatus(response.ok ? `${message} Local analysis refreshed.` : message);
    });
  }

  async function addImageUrl() {
    const trimmed = manualUrl.trim();
    if (!trimmed) {
      setError("Enter an image URL first.");
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError("Enter a valid HTTP or HTTPS image URL.");
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      setError("Image URLs must use HTTP or HTTPS.");
      return;
    }

    const image = createSelectedImage(parsed.href, undefined, {
      title: getHostname(parsed.href)
    });
    setManualUrl("");
    await selectImage(image, "Image URL added.");
  }

  async function uploadImage(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_LOCAL_UPLOAD_BYTES) {
      setError("Local uploads are limited to 2.5 MB in this build.");
      return;
    }

    await runAction("analysis", async () => {
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl);
      const image = createSelectedImage(dataUrl, undefined, {
        title: file.name,
        width: dimensions.width,
        height: dimensions.height,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height
      });
      await setCurrentImage(image);
      await upsertHistoryEntry(image);
      setCloudResults([]);
      setCloudAnalysis(null);

      const response = await sendRuntimeMessage({ type: "ANALYZE_CURRENT_IMAGE" });
      setStatus(response.ok ? "Image uploaded locally. Local analysis refreshed." : "Image uploaded locally.");
    });
  }

  async function ensureCloudReadyImage(image: SelectedImage): Promise<SelectedImage> {
    if (!imageNeedsUploadProxy(image.srcUrl) || image.remoteImageUrl) {
      return image;
    }
    if (!settings?.cloudMode) {
      throw new Error(
        "Uploaded images need Cloud Mode before they can be sent to cloud search or third-party reverse search."
      );
    }
    if (!image.srcUrl.startsWith("data:image/")) {
      throw new Error("This protected image cannot be uploaded from the extension yet.");
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
    setCurrentImageState(updatedImage);
    return updatedImage;
  }

  async function saveNoteDraft() {
    if (!currentImage) {
      return;
    }
    await setNote(currentImage.id, noteDraft);
    setStatus("Note saved locally.");
    await refresh();
  }

  async function toggleCurrentFavorite() {
    if (!currentImage) {
      return;
    }
    const next = await toggleFavorite(currentImage.id);
    setStatus(next ? "Added to favorites." : "Removed from favorites.");
    await refresh();
  }

  async function selectHistoryItem(item: SearchHistoryItem) {
    await setCurrentImage(item.image);
    setStatus("Loaded history item.");
    await refresh();
  }

  async function cloudSearch() {
    if (!settings || !currentImage) {
      return;
    }
    await runAction("cloud-search", async () => {
      const cloudReadyImage = await ensureCloudReadyImage(currentImage);
      const response = await runCloudSearch(
        { apiBaseUrl: settings.apiBaseUrl, apiKey: settings.apiKey },
        {
          image_url: cloudReadyImage.remoteImageUrl ?? cloudReadyImage.srcUrl,
          page_url: cloudReadyImage.pageUrl,
          enabled_engines: settings.enabledEngines
        }
      );
      setCloudResults(response.results);
      setUsage(response.usage);
      setStatus("Cloud search returned mock normalized results.");
    });
  }

  async function cloudAnalyze() {
    if (!settings || !currentImage) {
      return;
    }
    await runAction("cloud-analyze", async () => {
      const cloudReadyImage = await ensureCloudReadyImage(currentImage);
      const response = await runCloudAnalyze(
        { apiBaseUrl: settings.apiBaseUrl, apiKey: settings.apiKey },
        {
          image_url: cloudReadyImage.remoteImageUrl ?? cloudReadyImage.srcUrl,
          page_url: cloudReadyImage.pageUrl
        }
      );
      setCloudAnalysis(response);
      setStatus("Cloud analysis returned mock AI hints.");
    });
  }

  async function refreshUsage() {
    if (!settings) {
      return;
    }
    await runAction("cloud-search", async () => {
      const response = await getCloudUsage({
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey
      });
      setUsage(response);
      setStatus("Usage refreshed.");
    });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  return (
    <main
      className={
        surface === "popup"
          ? "w-[420px] bg-ink-50 text-ink-900 dark:bg-slate-950 dark:text-slate-100"
          : "min-h-screen bg-ink-50 text-ink-900 dark:bg-slate-950 dark:text-slate-100"
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-ink-900 text-white dark:bg-slate-100 dark:text-slate-950">
                <Search size={17} />
              </div>
              <div>
                <h1 className="text-lg font-semibold leading-tight">ImageTracer</h1>
                <p className="text-xs text-ink-500 dark:text-slate-400">
                  Local reverse image workflow
                </p>
              </div>
            </div>
          </div>
          <button
            className="it-button-secondary h-9 w-9 p-0"
            type="button"
            title="Open settings"
            onClick={openOptions}
          >
            <Settings size={17} />
          </button>
        </header>

        {status ? <StatusNotice tone="success">{status}</StatusNotice> : null}
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

        {!settings ? (
          <Panel className="p-5 text-sm text-ink-500">Loading ImageTracer...</Panel>
        ) : (
          <>
            <PrivacyStrip settings={settings} />
            <ImageInputPanel
              manualUrl={manualUrl}
              busy={busy}
              onManualUrlChange={setManualUrl}
              onAddImageUrl={addImageUrl}
              onUploadImage={uploadImage}
            />
            <CurrentImageCard
              image={currentImage}
              dimensions={dimensions}
              uploadProxyHint={uploadProxyHint}
              isFavorite={isFavorite}
              onFavorite={toggleCurrentFavorite}
            />

            {currentImage ? (
              <>
                <Panel className="p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Search engines</h2>
                      <p className="text-xs text-ink-500 dark:text-slate-400">
                        Opens a third-party page with the image URL.
                      </p>
                    </div>
                    <Badge tone="warning">Sends to search engine</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {enabledEngines.map((engine) => (
                      <button
                        key={engine.id}
                        className="it-button-secondary justify-between"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void openEngine(engine.id)}
                      >
                        <span className="flex items-center gap-2">
                          {busy === engine.id ? <Loader2 className="animate-spin" size={16} /> : <ExternalLink size={16} />}
                          {engine.name}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="it-button-primary mt-3 w-full"
                    type="button"
                    disabled={busy !== null || enabledEngines.length === 0}
                    onClick={() => void openAll()}
                  >
                    {busy === "all" ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    Open all enabled engines
                  </button>
                </Panel>

                <Panel className="p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Palette size={17} />
                      <h2 className="text-sm font-semibold">Local analysis</h2>
                    </div>
                    <Badge tone="local">Local</Badge>
                  </div>
                  <ColorList colors={currentImage.analysis?.dominantColors ?? []} />
                  <div className="mt-3 rounded-md bg-ink-50 p-3 text-xs text-ink-700 dark:bg-slate-800 dark:text-slate-300">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <FileText size={14} />
                      OCR
                    </div>
                    {currentImage.analysis?.ocr?.text ? (
                      <p>{currentImage.analysis.ocr.text}</p>
                    ) : (
                      <p>{currentImage.analysis?.ocr?.message ?? "Optional OCR adapter is ready; Tesseract.js is not bundled by default."}</p>
                    )}
                  </div>
                  {currentImage.analysis?.error ? (
                    <StatusNotice tone="error">{currentImage.analysis.error}</StatusNotice>
                  ) : null}
                  <button
                    className="it-button-secondary mt-3 w-full"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void analyzeCurrentImage()}
                  >
                    {busy === "analysis" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    Refresh local analysis
                  </button>
                </Panel>

                <Panel className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Notes</h2>
                    <Badge tone="local">Local</Badge>
                  </div>
                  <textarea
                    className="min-h-20 w-full resize-y rounded-md border border-ink-100 bg-white p-2 text-sm outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/20 dark:border-slate-700 dark:bg-slate-950"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add local notes or tags..."
                  />
                  <button className="it-button-secondary mt-2 w-full" type="button" onClick={() => void saveNoteDraft()}>
                    Save note
                  </button>
                </Panel>

                <CloudSection
                  settings={settings}
                  usage={usage}
                  results={cloudResults}
                  analysis={cloudAnalysis}
                  busy={busy}
                  onSearch={cloudSearch}
                  onAnalyze={cloudAnalyze}
                  onRefreshUsage={refreshUsage}
                />
              </>
            ) : null}

            <HistoryList history={history} notes={notes} onSelect={selectHistoryItem} />
          </>
        )}
      </div>
    </main>
  );
}

function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`it-panel rounded-lg ${className}`}>{children}</section>;
}

function Badge({ tone, children }: { tone: "local" | "warning" | "cloud"; children: ReactNode }) {
  const classes = {
    local: "bg-signal-500/10 text-signal-600 dark:text-emerald-300",
    warning: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
    cloud: "bg-berry-500/10 text-berry-600 dark:text-pink-300"
  };
  return <span className={`it-badge ${classes[tone]}`}>{children}</span>;
}

function StatusNotice({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        tone === "success"
          ? "border-signal-500/30 bg-signal-500/10 text-signal-600 dark:text-emerald-300"
          : "border-red-400/30 bg-red-400/10 text-red-700 dark:text-red-300"
      }`}
    >
      {children}
    </div>
  );
}

function PrivacyStrip({ settings }: { settings: ImageTracerSettings }) {
  return (
    <Panel className="grid gap-2 p-3 text-xs text-ink-700 dark:text-slate-300">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 shrink-0 text-signal-600" size={16} />
        <span>{getThirdPartyDisclosure(settings)}</span>
      </div>
      <div className="flex items-start gap-2">
        <Cloud className="mt-0.5 shrink-0 text-berry-600" size={16} />
        <span>{getCloudDisclosure(settings)}</span>
      </div>
    </Panel>
  );
}

function ImageInputPanel({
  manualUrl,
  busy,
  onManualUrlChange,
  onAddImageUrl,
  onUploadImage
}: {
  manualUrl: string;
  busy: BusyAction;
  onManualUrlChange: (value: string) => void;
  onAddImageUrl: () => void;
  onUploadImage: (file: File | null) => void;
}) {
  return (
    <Panel className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={17} />
          <h2 className="text-sm font-semibold">Add image</h2>
        </div>
        <Badge tone="local">Local</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="min-w-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/20 dark:border-slate-700 dark:bg-slate-950"
          type="url"
          value={manualUrl}
          placeholder="https://example.com/image.jpg"
          onChange={(event) => onManualUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddImageUrl();
            }
          }}
        />
        <button
          className="it-button-secondary"
          type="button"
          disabled={busy !== null}
          onClick={onAddImageUrl}
        >
          <Link size={16} />
          Use URL
        </button>
      </div>
      <label className="it-button-secondary mt-2 w-full cursor-pointer">
        <Upload size={16} />
        Upload image
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          disabled={busy !== null}
          onChange={(event) => {
            void onUploadImage(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <p className="mt-2 text-xs text-ink-500 dark:text-slate-400">
        Uploaded images stay local until you run cloud or reverse search.
      </p>
    </Panel>
  );
}

function CurrentImageCard({
  image,
  dimensions,
  uploadProxyHint,
  isFavorite,
  onFavorite
}: {
  image: SelectedImage | null;
  dimensions: string;
  uploadProxyHint: string | null;
  isFavorite: boolean;
  onFavorite: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [image?.id]);

  if (!image) {
    return (
      <Panel className="p-5 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-ink-100 text-ink-500 dark:bg-slate-800">
          <ImageIcon size={22} />
        </div>
        <h2 className="mt-3 text-base font-semibold">No image selected</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
          Right-click an image on a web page and choose ImageTracer.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-[96px_1fr] gap-3 p-3">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-md bg-ink-100 dark:bg-slate-800">
          {!previewFailed ? (
            <img
              className="h-full w-full object-cover"
              src={image.srcUrl}
              alt={image.altText || "Selected image preview"}
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <ImageIcon className="text-ink-500" size={26} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {image.altText || image.title || getHostname(image.srcUrl)}
              </h2>
              <p className="mt-1 truncate text-xs text-ink-500 dark:text-slate-400">
                {getHostname(image.pageUrl ?? image.srcUrl)}
              </p>
            </div>
            <button
              className={`it-button-secondary h-9 w-9 shrink-0 p-0 ${
                isFavorite ? "text-amber-500" : ""
              }`}
              type="button"
              title={isFavorite ? "Remove favorite" : "Add favorite"}
              onClick={onFavorite}
            >
              <Star size={17} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-ink-500 dark:text-slate-400">Dimensions</dt>
              <dd className="font-medium">{dimensions}</dd>
            </div>
            <div>
              <dt className="text-ink-500 dark:text-slate-400">Captured</dt>
              <dd className="font-medium">{new Date(image.capturedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </div>
      {uploadProxyHint ? (
        <div className="flex items-start gap-2 border-t border-ink-100 bg-amber-400/10 p-3 text-xs text-amber-800 dark:border-slate-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          <span>{uploadProxyHint}</span>
        </div>
      ) : null}
    </Panel>
  );
}

function ColorList({ colors }: { colors: Array<{ hex: string; percentage: number }> }) {
  if (colors.length === 0) {
    return (
      <p className="rounded-md bg-ink-50 p-3 text-sm text-ink-500 dark:bg-slate-800 dark:text-slate-400">
        Dominant colors will appear after local canvas analysis succeeds.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {colors.map((color) => (
        <div key={color.hex} className="flex items-center gap-3">
          <span
            className="h-7 w-7 shrink-0 rounded-md border border-black/10"
            style={{ backgroundColor: color.hex }}
          />
          <span className="w-20 text-sm font-medium">{color.hex}</span>
          <div className="h-2 flex-1 overflow-hidden rounded bg-ink-100 dark:bg-slate-800">
            <div className="h-full rounded bg-signal-500" style={{ width: `${color.percentage}%` }} />
          </div>
          <span className="w-10 text-right text-xs text-ink-500 dark:text-slate-400">
            {color.percentage}%
          </span>
        </div>
      ))}
    </div>
  );
}

function CloudSection({
  settings,
  usage,
  results,
  analysis,
  busy,
  onSearch,
  onAnalyze,
  onRefreshUsage
}: {
  settings: ImageTracerSettings;
  usage: CloudUsage | null;
  results: CloudSearchResult[];
  analysis: CloudAnalysisResponse | null;
  busy: BusyAction;
  onSearch: () => void;
  onAnalyze: () => void;
  onRefreshUsage: () => void;
}) {
  return (
    <Panel className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cloud size={17} />
          <h2 className="text-sm font-semibold">Cloud mode</h2>
        </div>
        <Badge tone="cloud">Cloud Pro</Badge>
      </div>

      {!settings.cloudMode ? (
        <p className="rounded-md bg-ink-50 p-3 text-sm text-ink-500 dark:bg-slate-800 dark:text-slate-400">
          Cloud mode is off in settings. Local search and analysis remain fully usable.
        </p>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button className="it-button-secondary" type="button" disabled={busy !== null} onClick={onSearch}>
              {busy === "cloud-search" ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
              Cloud search
            </button>
            <button className="it-button-secondary" type="button" disabled={busy !== null} onClick={onAnalyze}>
              {busy === "cloud-analyze" ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
              AI analyze
            </button>
          </div>
          <button className="it-button-secondary w-full" type="button" disabled={busy !== null} onClick={onRefreshUsage}>
            Usage: {usage ? `${usage.used}/${usage.limit ?? "unlimited"} this month` : "refresh"}
          </button>
          {results.length > 0 ? (
            <div className="grid gap-2">
              {results.map((result) => (
                <a
                  key={`${result.engine}-${result.url}`}
                  className="rounded-md border border-ink-100 bg-white p-3 text-sm hover:bg-ink-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="font-semibold">{result.title}</div>
                  <div className="mt-1 text-xs text-ink-500 dark:text-slate-400">
                    {result.engine} - {Math.round(result.confidence * 100)}%
                  </div>
                  <p className="mt-1 text-xs">{result.snippet}</p>
                </a>
              ))}
            </div>
          ) : null}
          {analysis ? (
            <div className="rounded-md bg-ink-50 p-3 text-sm dark:bg-slate-800">
              <p className="font-semibold">{analysis.description}</p>
              <p className="mt-2 text-xs text-ink-500 dark:text-slate-400">
                Suggested: {analysis.suggested_queries.join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function HistoryList({
  history,
  notes,
  onSelect
}: {
  history: SearchHistoryItem[];
  notes: Record<string, string>;
  onSelect: (item: SearchHistoryItem) => void;
}) {
  return (
    <Panel className="p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History size={17} />
          <h2 className="text-sm font-semibold">Local history</h2>
        </div>
        <Badge tone="local">Local</Badge>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-ink-500 dark:text-slate-400">No searches recorded yet.</p>
      ) : (
        <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
          {history.map((item) => (
            <button
              key={item.id}
              className="grid grid-cols-[44px_1fr] gap-2 rounded-md border border-ink-100 bg-white p-2 text-left hover:bg-ink-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
              type="button"
              onClick={() => onSelect(item)}
            >
              <div className="h-11 w-11 overflow-hidden rounded bg-ink-100 dark:bg-slate-800">
                <img className="h-full w-full object-cover" src={item.image.srcUrl} alt="" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  {item.favorite ? <Star className="text-amber-500" size={13} fill="currentColor" /> : null}
                  <span className="truncate text-sm font-medium">
                    {item.image.altText || getHostname(item.image.srcUrl)}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-500 dark:text-slate-400">
                  {item.engines.length ? item.engines.join(", ") : "Captured"}
                </p>
                {notes[item.id] ? (
                  <p className="mt-1 truncate text-xs text-ink-700 dark:text-slate-300">{notes[item.id]}</p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 60);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read the uploaded image."));
    };
    reader.onerror = () => reject(new Error("Could not read the uploaded image."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(srcUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
    image.onerror = () => reject(new Error("Could not inspect the uploaded image."));
    image.src = srcUrl;
  });
}
