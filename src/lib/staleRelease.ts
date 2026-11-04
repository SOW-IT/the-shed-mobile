export const STALE_RELOAD_KEY = "shed.staleReleaseReloadAt";
export const STALE_RELOAD_WINDOW_MS = 60_000;

type ReloadStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type ReloadHost = {
  storage: ReloadStorage | null;
  online: boolean;
  now: () => number;
  reload: () => void;
};

export const reloadAllowed = (
  lastReloadAt: string | null,
  now: number,
  windowMs: number = STALE_RELOAD_WINDOW_MS
): boolean => {
  if (!lastReloadAt) return true;
  const last = Number(lastReloadAt);
  if (!Number.isFinite(last)) return true;
  return now < last || now - last >= windowMs;
};

const allowedBy = (host: ReloadHost | null): host is ReloadHost & { storage: ReloadStorage } => {
  if (!host?.storage || !host.online) return false;
  try {
    return reloadAllowed(host.storage.getItem(STALE_RELOAD_KEY), host.now());
  } catch {
    return false;
  }
};

export const createStaleReloader = (getHost: () => ReloadHost | null) => {
  let pending = false;
  return {
    canReload: (): boolean => pending || allowedBy(getHost()),
    reload: (): boolean => {
      if (pending) return true;
      const host = getHost();
      if (!allowedBy(host)) return false;
      try {
        host.storage.setItem(STALE_RELOAD_KEY, String(host.now()));
      } catch {
        return false;
      }
      pending = true;
      try {
        host.reload();
      } catch {
        pending = false;
        return false;
      }
      return true;
    },
  };
};

export const browserReloadHost = (): ReloadHost | null => {
  if (typeof window === "undefined" || typeof window.location?.reload !== "function") return null;
  let storage: ReloadStorage | null = null;
  try {
    storage = window.sessionStorage ?? null;
  } catch {
    storage = null;
  }
  return {
    storage,
    online: typeof navigator === "undefined" || navigator.onLine !== false,
    now: () => Date.now(),
    reload: () => window.location.reload(),
  };
};
