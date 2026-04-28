import type {
  CloudAnalysisResponse,
  CloudImageUploadRequest,
  CloudImageUploadResponse,
  CloudSearchRequest,
  CloudSearchResponse,
  CloudUsage
} from "./types";

export class CloudClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

export interface CloudClientOptions {
  apiBaseUrl: string;
  apiKey: string;
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

async function requestJson<T>(
  options: CloudClientOptions,
  path: string,
  init?: RequestInit
): Promise<T> {
  if (!options.apiKey.trim()) {
    throw new CloudClientError("Enter an API key in settings before using cloud mode.");
  }

  const response = await fetch(`${normalizeBaseUrl(options.apiBaseUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": options.apiKey,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Cloud API request failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      // Keep the generic error.
    }
    throw new CloudClientError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export async function getCloudUsage(options: CloudClientOptions): Promise<CloudUsage> {
  return requestJson<CloudUsage>(options, "/api/cloud/usage");
}

export async function runCloudSearch(
  options: CloudClientOptions,
  request: CloudSearchRequest
): Promise<CloudSearchResponse> {
  return requestJson<CloudSearchResponse>(options, "/api/cloud/search", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function runCloudAnalyze(
  options: CloudClientOptions,
  request: Pick<CloudSearchRequest, "image_url" | "page_url">
): Promise<CloudAnalysisResponse> {
  return requestJson<CloudAnalysisResponse>(options, "/api/cloud/analyze", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function uploadImageForSearch(
  options: CloudClientOptions,
  request: CloudImageUploadRequest
): Promise<CloudImageUploadResponse> {
  return requestJson<CloudImageUploadResponse>(options, "/api/cloud/upload-image", {
    method: "POST",
    body: JSON.stringify(request)
  });
}
