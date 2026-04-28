# ImageTracer

ImageTracer is a privacy-first reverse image search Chromium extension. It runs local/free features in the browser and includes a local FastAPI backend for optional cloud-ready workflows.

## Current Features

Free/local extension features:

- Right-click an image and choose **Search image with ImageTracer**.
- Right-click a normal page area and choose **Open ImageTracer** to open the extension UI without selecting an image.
- Right-click an image and use the ImageTracer submenu to open the panel, search one engine, or search all enabled engines.
- Paste a public image URL or upload a small local image from the popup or extension tab.
- Capture the image URL, page URL, dimensions, alt text, and title when available.
- Open URL-based reverse image searches in Google Images, Bing Visual Search, TinEye, Yandex Images, and SauceNAO.
- Enable or disable engines in the options page.
- Store current image, history, notes, and favorites in `chrome.storage.local`.
- Run local image metadata and dominant-color analysis through an MV3 offscreen document.
- Show privacy badges for local-only work, search-engine sharing, and cloud mode.
- Keep OCR behind a clean adapter boundary with a lightweight mock implementation until Tesseract.js is intentionally bundled.

Cloud-ready features:

- FastAPI backend with SQLite and SQLAlchemy.
- API-key auth seeded for local development.
- Mock normalized cloud search, cloud analysis, saved searches, batch search, monitors, and usage endpoints.
- Plan-aware monthly usage limits: free `0`, pro `300`, creator `1500`, team configurable.

No paid services are used by default.

## Tech Stack

- Chromium Manifest V3
- TypeScript
- React
- Vite
- Tailwind CSS
- Chrome extension APIs: context menus, storage, tabs, messaging, offscreen documents
- FastAPI
- SQLite via SQLAlchemy
- Pytest and Vitest

## Setup

Install JavaScript dependencies:

```bash
pnpm install
```

Install backend dependencies:

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
python -m pip install -e ".[dev]"
```

## Run the Extension

For a production-style unpacked build:

```bash
pnpm build
```

Load `apps/extension/dist` as an unpacked extension.

For UI iteration only:

```bash
pnpm dev:extension
```

The unpacked extension should still be loaded from a built `dist` directory because Chromium consumes the generated MV3 manifest and bundled service worker.

## Run the Backend

```bash
cd apps/api
.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Seeded local credentials:

- API base URL: `http://127.0.0.1:8000`
- API key: `dev_imagetracer_key`
- User: `demo@imagetracer.local`
- Plan: `pro`

## Load Unpacked Extension

Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/extension/dist`.

Opera GX:

1. Open `opera://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/extension/dist`.

Microsoft Edge:

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/extension/dist`.

## Test

```bash
pnpm test
pnpm test:api
```

## Build for Production

```bash
pnpm build
```

Package the contents of `apps/extension/dist` for distribution. The FastAPI app can be deployed separately and configured from the extension options page.

## Known Limitations

- URL-based reverse image search only works when the image has a public HTTP(S) URL.
- Blob, data, protected, and local file images need a future upload/proxy flow.
- Local uploads are stored as data URLs in the extension and limited to 2.5 MB there.
- To send an uploaded image to third-party reverse search engines, Cloud Mode uploads it to the configured API first. The API base URL must be publicly reachable by those engines; `127.0.0.1` is useful for local mock cloud testing but not for real third-party fetches.
- Canvas color extraction can be blocked by image CORS rules.
- OCR is an adapter-backed mock by default; Tesseract.js is intentionally not bundled yet.
- Cloud search returns mock normalized results. It does not scrape third-party engines or call paid APIs.
- Billing and Stripe integration are placeholders.

## Roadmap

- Optional lazy-loaded Tesseract.js OCR pack.
- Cloud upload/proxy flow for blob, data, and protected images.
- Unified result aggregation from licensed APIs or user-authorized providers.
- Saved cloud collections, monitoring jobs, and batch queues.
- Team accounts, billing, and admin usage controls.
- Store-ready icons, onboarding, and extension listing assets.
