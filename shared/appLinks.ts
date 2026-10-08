/**
 * Which mobile app a web deployment hands phones over to. The production web
 * pairs with The SHED; the dev web (the-shed-web-dev) pairs with The SHED
 * Staging, which is on TestFlight rather than the stores.
 */
export type AppVariant = "production" | "staging";

export type AppLink = {
  scheme: string;
  /** The web deployment that pairs with the app, for opening a page there. */
  web: string;
  iosStore: string | null;
  androidStore: string | null;
};

export const APP_LINKS: Record<AppVariant, AppLink> = {
  production: {
    scheme: "theshedmobile",
    web: "https://theshed.sow.org.au",
    iosStore: "https://apps.apple.com/app/id6781592871",
    androidStore: "https://play.google.com/store/apps/details?id=au.org.sow.theshed",
  },
  staging: {
    scheme: "theshedmobilestaging",
    web: "https://the-shed-web-dev.vercel.app",
    iosStore: null,
    androidStore: null,
  },
};

/** The variant named by EXPO_PUBLIC_APP_VARIANT at build time; production
 *  unless it says staging. */
export const appVariantFrom = (value: string | undefined): AppVariant =>
  value?.trim().toLowerCase() === "staging" ? "staging" : "production";

export const appLinkFor = (value: string | undefined): AppLink =>
  APP_LINKS[appVariantFrom(value)];

/** The app's own link details, from the URL scheme it was built with. */
export const appLinkForScheme = (scheme: string | undefined): AppLink =>
  Object.values(APP_LINKS).find((link) => link.scheme === scheme) ?? APP_LINKS.production;

/**
 * Pages added after people may have installed the app, with the first app
 * version that has them. An older app can't open them ("Unmatched Route"), so
 * on a phone the web keeps these pages to itself unless the link says the
 * person's app is new enough (`#app`, see `appCanOpen`).
 */
export const NEWER_PAGES: readonly { prefix: string; since: string }[] = [
  { prefix: "/event-requests", since: "2.3.0" },
  { prefix: "/announcements", since: "2.4.0" },
];

/** The marker on a link whose recipient's app can open it. */
export const APP_LINK_MARKER = "#app";

const parts = (version: string) => version.split(".").map((n) => Number.parseInt(n, 10) || 0);

/** Negative, zero or positive as version `a` is older than, the same as or newer than `b`. */
export const compareVersions = (a: string, b: string): number => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

export const isAppVersion = (value: string): boolean => /^\d+\.\d+\.\d+$/.test(value);

/** The app version a page needs, or null when every version has it. */
export const versionNeededFor = (path: string): string | null => {
  const pathname = path.split(/[?#]/)[0];
  const page = NEWER_PAGES.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`)
  );
  return page?.since ?? null;
};

/** Whether an app of `version` (null: unknown or an old app) can open `path`. */
export const appCanOpen = (path: string, version: string | null | undefined): boolean => {
  const needed = versionNeededFor(path);
  if (!needed) return true;
  return !!version && compareVersions(version, needed) >= 0;
};
