import type { OcrResult } from "./types";

export interface OcrAdapter {
  readonly name: "mock" | "tesseract";
  isAvailable(): Promise<boolean>;
  recognize(imageUrl: string): Promise<OcrResult>;
}

export class MockOcrAdapter implements OcrAdapter {
  readonly name = "mock" as const;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async recognize(): Promise<OcrResult> {
    return {
      status: "unavailable",
      text: "",
      engine: "mock",
      message:
        "Local OCR is wired through an adapter, but Tesseract.js is not bundled in this first build to keep the extension lightweight."
    };
  }
}

export async function createOcrAdapter(): Promise<OcrAdapter> {
  // TODO: Install tesseract.js and lazy-load it here only after the user enables OCR.
  // Example future shape:
  // const { createWorker } = await import("tesseract.js");
  // return new TesseractOcrAdapter(createWorker);
  return new MockOcrAdapter();
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
    .join("")}`;
}
