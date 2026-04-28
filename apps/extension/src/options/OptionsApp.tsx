import {
  Cloud,
  KeyRound,
  Loader2,
  PanelRightOpen,
  Search,
  ShieldCheck,
  ToggleLeft
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getCloudUsage } from "../shared/cloudClient";
import { SEARCH_ENGINES } from "../shared/searchEngines";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../shared/storage";
import type { CloudUsage, ImageTracerSettings, SearchEngineId } from "../shared/types";

export function OptionsApp() {
  const [settings, setSettings] = useState<ImageTracerSettings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const enabledSet = useMemo(() => new Set(settings.enabledEngines), [settings.enabledEngines]);

  async function update(partial: Partial<ImageTracerSettings>) {
    const next = {
      ...settings,
      ...partial
    };
    setSettings(next);
    await saveSettings(partial);
    setStatus("Settings saved.");
    setError("");
  }

  async function toggleEngine(engineId: SearchEngineId) {
    const next = enabledSet.has(engineId)
      ? settings.enabledEngines.filter((id) => id !== engineId)
      : [...settings.enabledEngines, engineId];
    await update({ enabledEngines: next });
  }

  async function refreshUsage() {
    setLoadingUsage(true);
    setStatus("");
    setError("");
    try {
      const response = await getCloudUsage({
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey
      });
      setUsage(response);
      setStatus("Usage loaded from the configured API.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load usage.");
    } finally {
      setLoadingUsage(false);
    }
  }

  async function openImageTracerPanel() {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("sidepanel.html")
    });
  }

  return (
    <main className="min-h-screen bg-ink-50 p-4 text-ink-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto grid max-w-4xl gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">ImageTracer settings</h1>
            <p className="text-sm text-ink-500 dark:text-slate-400">
              Configure local engines, privacy defaults, and optional cloud mode.
            </p>
          </div>
          <button
            className="it-button-primary"
            type="button"
            onClick={() => void openImageTracerPanel()}
          >
            <PanelRightOpen size={16} />
            Open ImageTracer
          </button>
        </header>

        {status ? <Notice tone="success">{status}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <section className="it-panel rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search size={18} />
            <h2 className="text-base font-semibold">Search engines</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SEARCH_ENGINES.map((engine) => (
              <label
                key={engine.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-ink-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
              >
                <input
                  className="mt-1 h-4 w-4 accent-signal-600"
                  type="checkbox"
                  checked={enabledSet.has(engine.id)}
                  onChange={() => void toggleEngine(engine.id)}
                />
                <span>
                  <span className="block text-sm font-semibold">{engine.name}</span>
                  <span className="block text-xs text-ink-500 dark:text-slate-400">
                    {engine.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="it-panel rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} />
            <h2 className="text-base font-semibold">Privacy and workflow</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow
              title="Privacy mode"
              description="Shows clear warnings before workflows that send image URLs outside the browser."
              checked={settings.privacyMode}
              onChange={(checked) => void update({ privacyMode: checked })}
            />
            <ToggleRow
              title="Instant open"
              description="After a context-menu capture, immediately open all enabled search engines."
              checked={settings.instantOpen}
              onChange={(checked) => void update({ instantOpen: checked })}
            />
          </div>
        </section>

        <section className="it-panel rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <Cloud size={18} />
            <h2 className="text-base font-semibold">Cloud mode</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow
              title="Enable cloud mode"
              description="Unlocks calls to your configured ImageTracer FastAPI backend for mock normalized search and analysis."
              checked={settings.cloudMode}
              onChange={(checked) => void update({ cloudMode: checked })}
            />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">API base URL</span>
              <input
                className="rounded-md border border-ink-100 bg-white px-3 py-2 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/20 dark:border-slate-700 dark:bg-slate-950"
                value={settings.apiBaseUrl}
                onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })}
                onBlur={() => void update({ apiBaseUrl: settings.apiBaseUrl })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <KeyRound size={15} />
                API key
              </span>
              <input
                className="rounded-md border border-ink-100 bg-white px-3 py-2 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/20 dark:border-slate-700 dark:bg-slate-950"
                value={settings.apiKey}
                placeholder="dev_imagetracer_key"
                type="password"
                onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                onBlur={() => void update({ apiKey: settings.apiKey })}
              />
            </label>
            <button className="it-button-secondary w-fit" type="button" onClick={() => void refreshUsage()}>
              {loadingUsage ? <Loader2 className="animate-spin" size={16} /> : <ToggleLeft size={16} />}
              Refresh usage
            </button>
            {usage ? (
              <div className="rounded-md bg-ink-50 p-3 text-sm dark:bg-slate-800">
                <div className="font-semibold">
                  {usage.plan} plan · {usage.period}
                </div>
                <div className="mt-1 text-ink-500 dark:text-slate-400">
                  Used {usage.used} of {usage.limit ?? "unlimited"} cloud searches. Remaining{" "}
                  {usage.remaining ?? "unlimited"}.
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-ink-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-ink-500 dark:text-slate-400">{description}</span>
      </span>
      <input
        className="h-5 w-5 accent-signal-600"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Notice({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
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
