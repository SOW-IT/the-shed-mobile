import { describe, expect, test } from "vitest";
import { imageCacheKey, isCacheableImageUrl } from "./imageCacheKey";

describe("imageCacheKey", () => {
  test("is a stable 16-character hex name for a URL", () => {
    const url = "https://giant-bloodhound-191.convex.cloud/api/storage/90750694-dc57";
    expect(imageCacheKey(url)).toMatch(/^[0-9a-f]{16}$/);
    expect(imageCacheKey(url)).toBe(imageCacheKey(url));
  });

  test("differs for URLs that differ by one character", () => {
    const base = "https://giant-bloodhound-191.convex.cloud/api/storage/";
    const keys = new Set(
      Array.from({ length: 500 }, (_, i) => imageCacheKey(`${base}${i}`))
    );
    expect(keys.size).toBe(500);
  });
});

describe("isCacheableImageUrl", () => {
  test("only web URLs are saved on the device", () => {
    expect(isCacheableImageUrl("https://lh3.googleusercontent.com/a/x")).toBe(true);
    expect(isCacheableImageUrl("http://127.0.0.1:3210/api/storage/abc")).toBe(true);
    expect(isCacheableImageUrl("file:///tmp/a.jpg")).toBe(false);
    expect(isCacheableImageUrl("data:image/png;base64,AAAA")).toBe(false);
  });
});
