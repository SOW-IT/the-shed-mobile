import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { imageCacheKey, isCacheableImageUrl } from "@/lib/imageCacheKey";

const CACHE_FOLDER = "images";

const downloads = new Map<string, Promise<string | null>>();
const onDevice = new Map<string, string>();

const cachedFile = (url: string) => new File(Paths.cache, CACHE_FOLDER, imageCacheKey(url));

const usesDeviceCache = (url: string | null): url is string =>
  Platform.OS !== "web" && !!url && isCacheableImageUrl(url);

function storedUri(url: string): string | null {
  const known = onDevice.get(url);
  if (known) return known;
  if (downloads.has(url)) return null;
  try {
    const file = cachedFile(url);
    if (!file.exists) return null;
    onDevice.set(url, file.uri);
    return file.uri;
  } catch {
    return null;
  }
}

function download(url: string): Promise<string | null> {
  const running = downloads.get(url);
  if (running) return running;
  const started = (async () => {
    try {
      new Directory(Paths.cache, CACHE_FOLDER).create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(url, cachedFile(url), { idempotent: true });
      onDevice.set(url, file.uri);
      return file.uri;
    } catch {
      return null;
    } finally {
      downloads.delete(url);
    }
  })();
  downloads.set(url, started);
  return started;
}

export function forgetCachedImage(url: string | null): void {
  if (!usesDeviceCache(url)) return;
  onDevice.delete(url);
  try {
    const file = cachedFile(url);
    if (file.exists) file.delete();
  } catch {
    return;
  }
}

export function useCachedImageUri(url: string | null): string | null {
  const [downloaded, setDownloaded] = useState<{ url: string; uri: string } | null>(null);
  const cached = usesDeviceCache(url) ? storedUri(url) : null;

  useEffect(() => {
    if (!usesDeviceCache(url) || storedUri(url)) return;
    let live = true;
    void download(url).then((uri) => {
      if (live && uri) setDownloaded({ url, uri });
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (!usesDeviceCache(url)) return url;
  if (cached) return cached;
  return downloaded?.url === url ? downloaded.uri : url;
}
