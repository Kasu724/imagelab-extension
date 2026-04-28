import { describe, expect, it } from "vitest";
import {
  buildEnabledSearchUrls,
  buildSearchUrl,
  getUnsupportedImageReason,
  isNetworkImageUrl
} from "./searchEngines";

describe("search engine URL builders", () => {
  const imageUrl = "https://example.com/images/cat with spaces.jpg?size=large&ref=unit";

  it("builds Google Lens URL searches", () => {
    const result = buildSearchUrl("google", imageUrl);
    expect(result.ok).toBe(true);
    expect(result.url).toContain("https://lens.google.com/uploadbyurl");
    expect(result.url).toContain(encodeURIComponent(imageUrl));
  });

  it("builds Bing Visual Search URL searches", () => {
    const result = buildSearchUrl("bing", imageUrl);
    expect(result.ok).toBe(true);
    expect(result.url).toContain("https://www.bing.com/images/search");
    expect(result.url).toContain(`imgurl:${encodeURIComponent(imageUrl)}`);
  });

  it("builds TinEye URL searches", () => {
    const result = buildSearchUrl("tineye", imageUrl);
    expect(result.ok).toBe(true);
    expect(result.url).toBe(`https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`);
  });

  it("builds Yandex URL searches", () => {
    const result = buildSearchUrl("yandex", imageUrl);
    expect(result.ok).toBe(true);
    expect(result.url).toBe(
      `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`
    );
  });

  it("builds SauceNAO URL searches", () => {
    const result = buildSearchUrl("saucenao", imageUrl);
    expect(result.ok).toBe(true);
    expect(result.url).toBe(`https://saucenao.com/search.php?url=${encodeURIComponent(imageUrl)}`);
  });

  it("rejects blob, data, and local URLs", () => {
    expect(isNetworkImageUrl("blob:https://example.com/abc")).toBe(false);
    expect(buildSearchUrl("google", "data:image/png;base64,abc").ok).toBe(false);
    expect(getUnsupportedImageReason("file:///tmp/image.png")).toContain("Local file");
  });

  it("builds an entry per enabled engine", () => {
    const results = buildEnabledSearchUrls(["google", "tineye"], imageUrl);
    expect(results.map((result) => result.engineId)).toEqual(["google", "tineye"]);
    expect(results.every((result) => result.result.ok)).toBe(true);
  });
});
