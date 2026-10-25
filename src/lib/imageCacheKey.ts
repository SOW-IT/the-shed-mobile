export const isCacheableImageUrl = (url: string): boolean => /^https?:\/\//.test(url);

export const imageCacheKey = (url: string): string => {
  let h1 = 0xdeadbeef ^ url.length;
  let h2 = 0x41c6ce57 ^ url.length;
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h2) + hex(h1);
};
